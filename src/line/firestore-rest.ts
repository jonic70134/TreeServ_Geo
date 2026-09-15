// 只供後端使用。使用固定服務身分的 Firebase token，所有資料存取仍受 Security Rules 限制。
export type LineStoreConfig = { projectId?: string; apiKey?: string; refreshToken?: string };
export type StoredDocument = { data: Record<string, unknown> };
export type StoreWrite = { path: string; data?: Record<string, unknown>; mask?: string[]; timestampFields?: string[] };
export type BindingStore = {
  transact<T>(operation: (get: (path: string) => Promise<StoredDocument | undefined>) => Promise<{ value: T; writes: StoreWrite[] }>): Promise<T>;
};

type FirestoreValue = { stringValue?: string; integerValue?: string; booleanValue?: boolean; timestampValue?: string; nullValue?: null };
type RestDocument = { fields?: Record<string, FirestoreValue> };
const cachedTokens = new Map<string, { token: string; until: number }>();

export function createBindingStore(config: LineStoreConfig, send: typeof fetch = fetch): BindingStore {
  const { projectId, apiKey, refreshToken } = config;
  if (!projectId || !/^[a-z0-9-]+$/.test(projectId) || !apiKey || !refreshToken) throw new Error('line_storage_not_configured');
  const root = `projects/${projectId}/databases/(default)/documents`;
  const endpoint = `https://firestore.googleapis.com/v1/${root}`;
  async function accessToken() {
    const cached = cachedTokens.get(refreshToken!);
    if (send === fetch && cached && cached.until > Date.now()) return cached.token;
    const response = await send(`https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(apiKey!)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken! }).toString(),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error('line_storage_auth_failed');
    const body = await response.json() as { id_token?: string; user_id?: string; expires_in?: string };
    if (!body.id_token || body.user_id !== 'treeserv-line-bot') throw new Error('invalid_line_service_identity');
    if (send === fetch) {
      cachedTokens.clear();
      cachedTokens.set(refreshToken!, { token: body.id_token, until: Date.now() + 50 * 60_000 });
    }
    return body.id_token;
  }
  function documentPath(path: string) {
    const parts = path.split('/');
    if (parts.length !== 2 || !['personnel', 'lineBindingRequests', 'lineBindings', 'lineAccounts', 'lineBindingAudit'].includes(parts[0]) || !/^[A-Za-z0-9_-]{1,128}$/.test(parts[1])) throw new Error('invalid_line_path');
    return `${root}/${path}`;
  }
  return {
    async transact(operation) {
      const token = await accessToken();
      const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
      const begin = await send(`${endpoint}:beginTransaction`, { method: 'POST', headers, body: '{}', signal: AbortSignal.timeout(8000) });
      if (!begin.ok) throw new Error('line_storage_failed');
      const { transaction } = await begin.json() as { transaction: string };
      try {
        const outcome = await operation(async (path) => {
          const name = documentPath(path);
          const result = await send(`${endpoint}:batchGet`, { method: 'POST', headers, body: JSON.stringify({ documents: [name], transaction }), signal: AbortSignal.timeout(8000) });
          if (!result.ok) throw new Error('line_storage_failed');
          const entries = await result.json() as Array<{ found?: RestDocument; missing?: string }>;
          const entry = entries.find((item) => item.found || item.missing);
          if (entry?.missing === name) return undefined;
          if (!entry?.found) throw new Error('invalid_line_document');
          const document = entry.found;
          const data: Record<string, unknown> = {};
          for (const [key, value] of Object.entries(document.fields ?? {})) {
            data[key] = value.stringValue ?? value.booleanValue ?? (value.integerValue !== undefined ? Number(value.integerValue) : value.timestampValue ? new Date(value.timestampValue).getTime() : null);
          }
          return { data };
        });
        const writes = outcome.writes.map((write) => {
          const name = documentPath(write.path);
          if (!write.data) return { delete: name };
          const fields: Record<string, FirestoreValue> = {};
          for (const [key, value] of Object.entries(write.data)) {
            if (typeof value === 'string') fields[key] = { stringValue: value };
            else if (typeof value === 'boolean') fields[key] = { booleanValue: value };
            else if (typeof value === 'number' && Number.isSafeInteger(value)) fields[key] = { integerValue: String(value) };
            else throw new Error('invalid_line_value');
          }
          return {
            update: { name, fields },
            ...(write.mask ? { updateMask: { fieldPaths: write.mask }, currentDocument: { exists: true } } : {}),
            ...(write.timestampFields ? { updateTransforms: write.timestampFields.map((fieldPath) => ({ fieldPath, setToServerValue: 'REQUEST_TIME' })) } : {}),
          };
        });
        const commit = await send(`${endpoint}:commit`, { method: 'POST', headers, body: JSON.stringify({ transaction, writes }), signal: AbortSignal.timeout(8000) });
        if (!commit.ok) throw new Error('line_storage_conflict');
        return outcome.value;
      } catch (error) {
        await send(`${endpoint}:rollback`, { method: 'POST', headers, body: JSON.stringify({ transaction }), signal: AbortSignal.timeout(3000) }).catch(() => undefined);
        throw error;
      }
    },
  };
}

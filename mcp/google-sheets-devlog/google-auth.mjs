import { createSign } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';

function base64url(value) {
  return Buffer.from(value)
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}

function parseCredentials(raw) {
  let credentials;
  try {
    credentials = JSON.parse(raw);
  } catch {
    throw new Error('Google 服務帳戶憑證不是有效的 JSON。');
  }

  if (!credentials.client_email || !credentials.private_key) {
    throw new Error('Google 服務帳戶憑證缺少 client_email 或 private_key。');
  }

  return {
    clientEmail: credentials.client_email,
    privateKey: credentials.private_key,
    tokenUri: credentials.token_uri || 'https://oauth2.googleapis.com/token',
  };
}

export async function loadServiceAccount(env = process.env) {
  if (env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    return parseCredentials(env.GOOGLE_SERVICE_ACCOUNT_JSON);
  }

  if (env.GOOGLE_SERVICE_ACCOUNT_JSON_B64) {
    return parseCredentials(Buffer.from(env.GOOGLE_SERVICE_ACCOUNT_JSON_B64, 'base64').toString('utf8'));
  }

  const credentialPath = env.GOOGLE_SERVICE_ACCOUNT_FILE || env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!credentialPath) {
    throw new Error(
      '尚未設定 Google 服務帳戶。請設定 GOOGLE_SERVICE_ACCOUNT_FILE、GOOGLE_APPLICATION_CREDENTIALS 或 GOOGLE_SERVICE_ACCOUNT_JSON。',
    );
  }

  return parseCredentials(await readFile(credentialPath, 'utf8'));
}

export class GoogleAccessTokenProvider {
  constructor({ credentials, fetchImpl = globalThis.fetch, now = () => Date.now() }) {
    this.credentials = credentials;
    this.fetch = fetchImpl;
    this.now = now;
    this.cachedToken = null;
  }

  async getToken() {
    if (this.cachedToken && this.cachedToken.expiresAt > this.now() + 60_000) {
      return this.cachedToken.value;
    }

    const issuedAt = Math.floor(this.now() / 1000);
    const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claims = base64url(
      JSON.stringify({
        iss: this.credentials.clientEmail,
        scope: SHEETS_SCOPE,
        aud: this.credentials.tokenUri,
        iat: issuedAt,
        exp: issuedAt + 3600,
      }),
    );
    const unsignedJwt = `${header}.${claims}`;
    const signer = createSign('RSA-SHA256');
    signer.update(unsignedJwt);
    signer.end();
    const signature = signer
      .sign(this.credentials.privateKey, 'base64')
      .replaceAll('+', '-')
      .replaceAll('/', '_')
      .replaceAll('=', '');

    const response = await this.fetch(this.credentials.tokenUri, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: `${unsignedJwt}.${signature}`,
      }),
    });

    if (!response.ok) {
      const details = await response.text();
      throw new Error(`Google OAuth 授權失敗（${response.status}）：${details.slice(0, 300)}`);
    }

    const token = await response.json();
    if (!token.access_token) throw new Error('Google OAuth 未回傳 access_token。');
    this.cachedToken = {
      value: token.access_token,
      expiresAt: this.now() + Number(token.expires_in || 3600) * 1000,
    };
    return this.cachedToken.value;
  }
}

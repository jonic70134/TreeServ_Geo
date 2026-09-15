import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import {
  GoogleSheetsDevlog,
  TRACKING_SHEETS,
} from '../mcp/google-sheets-devlog/sheets-client.mjs';

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

test('tracking sheets expose only the requested four columns', () => {
  assert.deepEqual(TRACKING_SHEETS.updates.headers, [
    '更新時間',
    '標題',
    '更新摘要',
    '影響範圍',
  ]);
  assert.deepEqual(TRACKING_SHEETS.bugs.headers, [
    '修復時間',
    '標題',
    '問題描述',
    '修復方式',
  ]);
});

test('ensureTrackingSheets adds only the two dedicated sheets and preserves existing sheets', async () => {
  const calls = [];
  let metadataCalls = 0;
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, init });
    if (url.includes('?fields=')) {
      metadataCalls += 1;
      if (metadataCalls === 1) {
        return jsonResponse({
          spreadsheetUrl: 'https://example.test/sheet',
          sheets: [{ properties: { sheetId: 1, title: '既有資料', index: 0 } }],
        });
      }
      return jsonResponse({
        spreadsheetUrl: 'https://example.test/sheet',
        sheets: [
          { properties: { sheetId: 1, title: '既有資料', index: 0 } },
          ...Object.values(TRACKING_SHEETS).map((sheet, index) => ({
            properties: {
              sheetId: index + 10,
              title: sheet.title,
              index: index + 1,
            },
          })),
        ],
      });
    }
    return jsonResponse({});
  };

  const client = new GoogleSheetsDevlog({
    spreadsheetId: 'sheet-id',
    tokenProvider: { getToken: async () => 'token' },
    fetchImpl,
  });
  const result = await client.ensureTrackingSheets();

  assert.deepEqual(
    result.createdSheets,
    Object.values(TRACKING_SHEETS).map((sheet) => sheet.title),
  );
  const addCall = calls.find((call) => call.url.endsWith(':batchUpdate'));
  const requests = JSON.parse(addCall.init.body).requests;
  assert.equal(requests.length, 2);
  assert.deepEqual(
    requests.map((request) => request.addSheet.properties.title),
    result.createdSheets,
  );
  assert.ok(!JSON.stringify(calls).includes('deleteSheet'));
  const formatCall = calls
    .filter((call) => call.url.endsWith(':batchUpdate'))
    .at(-1);
  const formatRequests = JSON.parse(formatCall.init.body).requests;
  assert.deepEqual(
    formatRequests
      .filter((request) => request.sortRange)
      .map((request) => request.sortRange.sortSpecs[0]),
    [
      { dimensionIndex: 0, sortOrder: 'DESCENDING' },
      { dimensionIndex: 0, sortOrder: 'DESCENDING' },
    ],
  );
});

test('append inserts a row in the configured tracking sheet', async () => {
  const calls = [];
  const allSheets = Object.values(TRACKING_SHEETS).map((sheet, index) => ({
    properties: { sheetId: index + 10, title: sheet.title, index },
  }));
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, init });
    if (url.includes('?fields=')) return jsonResponse({ sheets: allSheets });
    if (url.includes(':append'))
      return jsonResponse({
        updates: { updatedRange: `'${TRACKING_SHEETS.updates.title}'!A2:D2` },
      });
    return jsonResponse({});
  };

  const client = new GoogleSheetsDevlog({
    spreadsheetId: 'sheet-id',
    tokenProvider: { getToken: async () => 'token' },
    fetchImpl,
  });
  const row = ['UPD-1', '2026-09-10T00:00:00.000Z', '', '更新標題'];
  const result = await client.append('updates', row);

  const appendCall = calls.find((call) => call.url.includes(':append'));
  assert.ok(
    appendCall.url.includes(encodeURIComponent(TRACKING_SHEETS.updates.title)),
  );
  assert.deepEqual(JSON.parse(appendCall.init.body).values, [row]);
  assert.equal(result.sheet, TRACKING_SHEETS.updates.title);
  const appendIndex = calls.indexOf(appendCall);
  const sortCall = calls
    .slice(appendIndex + 1)
    .find((call) => call.url.endsWith(':batchUpdate'));
  assert.deepEqual(
    JSON.parse(sortCall.init.body).requests[0].sortRange.sortSpecs,
    [{ dimensionIndex: 0, sortOrder: 'DESCENDING' }],
  );
});

test('recent maps rows to headers and returns newest records first', async () => {
  const allSheets = Object.values(TRACKING_SHEETS).map((sheet, index) => ({
    properties: { sheetId: index + 10, title: sheet.title, index },
  }));
  const fetchImpl = async (url) => {
    if (url.includes('?fields=')) return jsonResponse({ sheets: allSheets });
    if (url.includes('/values/') && url.includes('majorDimension=ROWS')) {
      return jsonResponse({
        values: [
          ['更新時間', '標題'],
          ['2026-09-13 09:00:00', '較早更新'],
          ['2026-09-15 09:00:00', '最新更新'],
          ['2026-09-14 09:00:00', '中間更新'],
        ],
      });
    }
    return jsonResponse({});
  };
  const client = new GoogleSheetsDevlog({
    spreadsheetId: 'sheet-id',
    tokenProvider: { getToken: async () => 'token' },
    fetchImpl,
  });

  assert.deepEqual(await client.recent('updates', 2), [
    { 更新時間: '2026-09-15 09:00:00', 標題: '最新更新' },
    { 更新時間: '2026-09-14 09:00:00', 標題: '中間更新' },
  ]);
});

test('MCP server initializes and advertises the expected tools', async () => {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const credentials = {
    client_email: 'test-service-account@example.test',
    private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    token_uri: 'https://oauth2.example.test/token',
  };
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['mcp/google-sheets-devlog/server.mjs'],
    cwd: process.cwd(),
    env: {
      ...process.env,
      GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify(credentials),
    },
  });
  const client = new Client({ name: 'treeserv-devlog-test', version: '1.0.0' });

  try {
    await client.connect(transport);
    const result = await client.listTools();
    assert.deepEqual(result.tools.map((tool) => tool.name).sort(), [
      'list_recent_development_records',
      'record_bug_fix',
      'record_update',
      'setup_development_log',
    ]);
  } finally {
    await client.close();
  }
});

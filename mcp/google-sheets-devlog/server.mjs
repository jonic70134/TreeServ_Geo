#!/usr/bin/env node
import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import {
  GoogleAccessTokenProvider,
  loadServiceAccount,
} from './google-auth.mjs';
import {
  DEFAULT_SPREADSHEET_ID,
  GoogleSheetsDevlog,
} from './sheets-client.mjs';

let tokenProviderInstance;
const tokenProvider = {
  async getToken() {
    if (!tokenProviderInstance) {
      tokenProviderInstance = new GoogleAccessTokenProvider({
        credentials: await loadServiceAccount(),
      });
    }
    return tokenProviderInstance.getToken();
  },
};
const devlog = new GoogleSheetsDevlog({
  spreadsheetId:
    process.env.GOOGLE_SHEETS_SPREADSHEET_ID || DEFAULT_SPREADSHEET_ID,
  tokenProvider,
});

const server = new McpServer(
  { name: 'treeserv-google-sheets-devlog', version: '1.0.0' },
  {
    instructions:
      '將 TreeServ Geo 的開發更新與 Bug 修復寫入專用 Google Sheet。系統架構與技術棧維護於本地 docs/system-architecture.md。第一次使用先呼叫 setup_development_log；同一變更不要重複記錄。不得修改或刪除非本 MCP 建立的工作表。',
  },
);

const commonAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  openWorldHint: false,
};
const optionalText = z.string().trim().max(5000).optional().default('');
const requiredText = z.string().trim().min(1).max(5000);

function recordId(prefix) {
  const date = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  return `${prefix}-${date}-${randomUUID().slice(0, 8).toUpperCase()}`;
}

function timestamp(value) {
  return value || new Date().toISOString();
}

function success(message, data) {
  return {
    structuredContent: data,
    content: [{ type: 'text', text: message }],
  };
}

server.registerTool(
  'setup_development_log',
  {
    title: '建立開發紀錄工作表',
    description:
      '在指定的 TreeServ Geo Google 試算表中建立並格式化開發更新與 Bug 修復工作表；既有其他工作表保持不變。',
    inputSchema: {},
    annotations: commonAnnotations,
  },
  async () => {
    const result = await devlog.ensureTrackingSheets();
    const message = result.createdSheets.length
      ? `已建立 ${result.createdSheets.length} 張開發紀錄工作表。`
      : '兩張開發紀錄工作表已存在，未重複建立。';
    return success(message, result);
  },
);

server.registerTool(
  'record_update',
  {
    title: '記錄開發更新',
    description: '記錄版本、里程碑、開發進度或已完成的更新。',
    inputSchema: {
      title: requiredText,
      summary: requiredText,
      status: z.enum(['規劃中', '進行中', '已完成', '已暫停']),
      occurred_at: z.string().datetime().optional(),
      milestone: optionalText,
      scope: optionalText,
      owner: optionalText,
      link: optionalText,
      git_commit: optionalText,
    },
    annotations: commonAnnotations,
  },
  async (input) => {
    const id = recordId('UPD');
    const result = await devlog.append('updates', [
      input.title,
      input.summary,
      input.status,
      input.scope,
      input.owner,
      input.link,
      input.git_commit,
      new Date().toISOString(),
      id,
      timestamp(input.occurred_at),
      input.milestone,
    ]);
    return success(`已記錄開發更新：${input.title}`, { id, ...result });
  },
);

server.registerTool(
  'record_bug_fix',
  {
    title: '記錄 Bug 修復',
    description: '記錄 Bug 的症狀、根因、修復方式與驗證結果。',
    inputSchema: {
      title: requiredText,
      problem: requiredText,
      root_cause: requiredText,
      fix: requiredText,
      discovered_at: z.string().datetime().optional(),
      fixed_at: z.string().datetime().optional(),
      verification: optionalText,
    },
    annotations: commonAnnotations,
  },
  async (input) => {
    const id = recordId('BUG');
    const result = await devlog.append('bugs', [
      input.title,
      input.problem,
      input.root_cause,
      input.fix,
      input.verification,
      id,
      timestamp(input.discovered_at),
      input.fixed_at || '',
    ]);
    return success(`已記錄 Bug：${input.title}`, { id, ...result });
  },
);

server.registerTool(
  'list_recent_development_records',
  {
    title: '查看最近開發紀錄',
    description: '查看指定類別最近寫入的開發紀錄。',
    inputSchema: {
      kind: z.enum(['updates', 'bugs']),
      limit: z.number().int().min(1).max(100).optional().default(20),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  async ({ kind, limit }) => {
    const records = await devlog.recent(kind, limit);
    return success(`找到 ${records.length} 筆最近紀錄。`, { kind, records });
  },
);

await server.connect(new StdioServerTransport());

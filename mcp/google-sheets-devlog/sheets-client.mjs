const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';

export const DEFAULT_SPREADSHEET_ID =
  '1IfxbDmTGdZXtXQor_HG0ptvdml7IXzBtW2AEcLtI6Ak';

export const TRACKING_SHEETS = {
  updates: {
    title: '開發更新・TreeServ Geo',
    headers: [
      '標題',
      '更新摘要',
      '狀態',
      '影響範圍',
      '負責人',
      '相關連結',
      'Git Commit',
      '寫入時間',
      '紀錄 ID',
      '更新時間',
      '版本／里程碑',
    ],
    widths: [220, 420, 110, 200, 130, 260, 140, 165, 130, 165, 140],
  },
  bugs: {
    title: 'Bug 修復・TreeServ Geo',
    headers: [
      '標題',
      '問題描述',
      '根本原因',
      '修復方式',
      '驗證方式',
      '紀錄 ID',
      '發現時間',
      '修復時間',
    ],
    widths: [220, 360, 320, 360, 300, 130, 165, 165],
  },
};

function quoteSheetTitle(title) {
  return `'${title.replaceAll("'", "''")}'`;
}

function requestError(status, details) {
  if (status === 403) {
    return new Error(
      'Google Sheets 拒絕寫入。請確認已啟用 Sheets API，並將試算表分享給服務帳戶的 client_email。',
    );
  }
  if (status === 404)
    return new Error('找不到指定的 Google 試算表，或服務帳戶沒有存取權。');
  return new Error(
    `Google Sheets API 呼叫失敗（${status}）：${details.slice(0, 300)}`,
  );
}

export class GoogleSheetsDevlog {
  constructor({
    spreadsheetId = DEFAULT_SPREADSHEET_ID,
    tokenProvider,
    fetchImpl = globalThis.fetch,
  }) {
    if (!spreadsheetId) throw new Error('spreadsheetId 不可為空。');
    this.spreadsheetId = spreadsheetId;
    this.tokenProvider = tokenProvider;
    this.fetch = fetchImpl;
  }

  async request(path = '', init = {}) {
    const token = await this.tokenProvider.getToken();
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${token}`);
    if (init.body)
      headers.set('Content-Type', 'application/json; charset=UTF-8');
    const response = await this.fetch(
      `${SHEETS_API}/${this.spreadsheetId}${path}`,
      { ...init, headers },
    );
    if (!response.ok)
      throw requestError(response.status, await response.text());
    if (response.status === 204) return null;
    return response.json();
  }

  async metadata() {
    return this.request(
      '?fields=spreadsheetUrl,sheets.properties(sheetId,title,index)',
    );
  }

  async ensureTrackingSheets() {
    const before = await this.metadata();
    const existingTitles = new Set(
      (before.sheets || []).map((sheet) => sheet.properties.title),
    );
    const missing = Object.values(TRACKING_SHEETS).filter(
      (definition) => !existingTitles.has(definition.title),
    );

    if (missing.length) {
      await this.request(':batchUpdate', {
        method: 'POST',
        body: JSON.stringify({
          requests: missing.map((definition) => ({
            addSheet: {
              properties: {
                title: definition.title,
                gridProperties: {
                  rowCount: 1000,
                  columnCount: definition.headers.length,
                },
              },
            },
          })),
        }),
      });
    }

    const after = await this.metadata();
    const sheetsByTitle = new Map(
      (after.sheets || []).map((sheet) => [
        sheet.properties.title,
        sheet.properties,
      ]),
    );

    await this.request('/values:batchUpdate', {
      method: 'POST',
      body: JSON.stringify({
        valueInputOption: 'RAW',
        data: Object.values(TRACKING_SHEETS).map((definition) => ({
          range: `${quoteSheetTitle(definition.title)}!A1:${columnName(definition.headers.length)}1`,
          majorDimension: 'ROWS',
          values: [definition.headers],
        })),
      }),
    });

    const formattingRequests = [];
    for (const [key, definition] of Object.entries(TRACKING_SHEETS)) {
      const sheet = sheetsByTitle.get(definition.title);
      if (!sheet) throw new Error(`建立工作表失敗：${definition.title}`);
      formattingRequests.push(
        {
          updateSheetProperties: {
            properties: {
              sheetId: sheet.sheetId,
              gridProperties: { frozenRowCount: 1, hideGridlines: true },
            },
            fields:
              'gridProperties.frozenRowCount,gridProperties.hideGridlines',
          },
        },
        {
          repeatCell: {
            range: {
              sheetId: sheet.sheetId,
              startRowIndex: 0,
              endRowIndex: 1,
              startColumnIndex: 0,
              endColumnIndex: definition.headers.length,
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 0.11, green: 0.33, blue: 0.24 },
                textFormat: {
                  foregroundColor: { red: 1, green: 1, blue: 1 },
                  bold: true,
                  fontSize: 10,
                },
                horizontalAlignment: 'CENTER',
                verticalAlignment: 'MIDDLE',
                wrapStrategy: 'WRAP',
              },
            },
            fields: 'userEnteredFormat',
          },
        },
        {
          updateDimensionProperties: {
            range: {
              sheetId: sheet.sheetId,
              dimension: 'ROWS',
              startIndex: 0,
              endIndex: 1,
            },
            properties: { pixelSize: 42 },
            fields: 'pixelSize',
          },
        },
        {
          setBasicFilter: {
            filter: {
              range: {
                sheetId: sheet.sheetId,
                startRowIndex: 0,
                startColumnIndex: 0,
                endColumnIndex: definition.headers.length,
              },
            },
          },
        },
      );

      definition.widths.forEach((pixelSize, index) => {
        formattingRequests.push({
          updateDimensionProperties: {
            range: {
              sheetId: sheet.sheetId,
              dimension: 'COLUMNS',
              startIndex: index,
              endIndex: index + 1,
            },
            properties: { pixelSize },
            fields: 'pixelSize',
          },
        });
      });

      const validation = validationFor(key, sheet.sheetId);
      if (validation) formattingRequests.push(...validation);
    }

    await this.request(':batchUpdate', {
      method: 'POST',
      body: JSON.stringify({ requests: formattingRequests }),
    });

    return {
      spreadsheetUrl:
        after.spreadsheetUrl ||
        `https://docs.google.com/spreadsheets/d/${this.spreadsheetId}/edit`,
      createdSheets: missing.map((definition) => definition.title),
      trackingSheets: Object.fromEntries(
        Object.entries(TRACKING_SHEETS).map(([key, definition]) => [
          key,
          {
            title: definition.title,
            sheetId: sheetsByTitle.get(definition.title).sheetId,
          },
        ]),
      ),
    };
  }

  async append(kind, row) {
    const definition = TRACKING_SHEETS[kind];
    if (!definition) throw new Error(`不支援的紀錄類型：${kind}`);
    await this.ensureTrackingSheets();
    const range = encodeURIComponent(
      `${quoteSheetTitle(definition.title)}!A:${columnName(definition.headers.length)}`,
    );
    const result = await this.request(
      `/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
      {
        method: 'POST',
        body: JSON.stringify({ majorDimension: 'ROWS', values: [row] }),
      },
    );
    return {
      spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${this.spreadsheetId}/edit`,
      sheet: definition.title,
      updatedRange: result.updates?.updatedRange || '',
    };
  }

  async recent(kind, limit = 20) {
    const definition = TRACKING_SHEETS[kind];
    if (!definition) throw new Error(`不支援的紀錄類型：${kind}`);
    await this.ensureTrackingSheets();
    const range = encodeURIComponent(
      `${quoteSheetTitle(definition.title)}!A:${columnName(definition.headers.length)}`,
    );
    const data = await this.request(`/values/${range}?majorDimension=ROWS`);
    const rows = data.values || [];
    const headers = rows[0] || definition.headers;
    return rows
      .slice(1)
      .filter((row) => row.some((value) => value !== ''))
      .slice(-limit)
      .reverse()
      .map((row) =>
        Object.fromEntries(
          headers.map((header, index) => [header, row[index] ?? '']),
        ),
      );
  }
}

function columnName(count) {
  let value = count;
  let result = '';
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

function listValidation(sheetId, columnIndex, values) {
  return {
    setDataValidation: {
      range: {
        sheetId,
        startRowIndex: 1,
        endRowIndex: 1000,
        startColumnIndex: columnIndex,
        endColumnIndex: columnIndex + 1,
      },
      rule: {
        condition: {
          type: 'ONE_OF_LIST',
          values: values.map((userEnteredValue) => ({ userEnteredValue })),
        },
        strict: true,
        showCustomUi: true,
      },
    },
  };
}

function validationFor(kind, sheetId) {
  if (kind === 'updates')
    return [
      listValidation(sheetId, 2, ['規劃中', '進行中', '已完成', '已暫停']),
    ];
  return [];
}

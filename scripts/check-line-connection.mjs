import { existsSync } from 'node:fs';

// 僅驗證官方帳號身分，不發送訊息、不輸出憑證。
if (existsSync('.env.line.local')) process.loadEnvFile('.env.line.local');
const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const expectedBasicId = process.env.LINE_BOT_BASIC_ID;
if (!token || !process.env.LINE_CHANNEL_SECRET || !expectedBasicId || !process.env.LINE_CHANNEL_ID) {
  console.error('LINE 設定尚未填妥，請完成本機 .env.line.local。');
  process.exitCode = 1;
} else {
  try {
    const result = await fetch('https://api.line.me/v2/bot/info', {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!result.ok) throw new Error('verification_failed');
    const account = await result.json();
    if (account.basicId !== expectedBasicId) {
      console.error('Token 對應的官方帳號與預期不同，請檢查 LINE channel。');
      process.exitCode = 1;
    } else {
      console.log(`官方帳號 ${account.basicId} 的 Token 驗證成功；未發送訊息。Channel secret 仍需透過 LINE Webhook Verify 驗證。`);
    }
  } catch {
    console.error('無法驗證 LINE 帳號，請檢查 Token、網路及官方服務狀態。');
    process.exitCode = 1;
  }
}

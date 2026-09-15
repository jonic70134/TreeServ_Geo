import { handleLineWebhook } from '@/src/line/webhook';

export const dynamic = 'force-dynamic';

export function POST(request: Request) {
  return handleLineWebhook(request, {
    channelSecret: process.env.LINE_CHANNEL_SECRET,
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  });
}

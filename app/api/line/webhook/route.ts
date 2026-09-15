import { handleLineWebhook } from '@/src/line/webhook';
import { createBindingStore } from '@/src/line/firestore-rest';

export const dynamic = 'force-dynamic';

export function POST(request: Request) {
  return handleLineWebhook(request, {
    channelSecret: process.env.LINE_CHANNEL_SECRET,
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
    bindingStore: () => createBindingStore({
      projectId: process.env.VITE_FIREBASE_PROJECT_ID,
      apiKey: process.env.VITE_FIREBASE_API_KEY,
      refreshToken: process.env.LINE_FIREBASE_REFRESH_TOKEN,
    }),
  });
}

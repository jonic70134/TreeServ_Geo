import { handleDispatchRequest } from '@/src/line/dispatch-api';
import { createBindingStore } from '@/src/line/firestore-rest';

export const dynamic = 'force-dynamic';
export function POST(request: Request) {
  const config = {
    projectId: process.env.VITE_FIREBASE_PROJECT_ID,
    apiKey: process.env.VITE_FIREBASE_API_KEY,
    refreshToken: process.env.LINE_FIREBASE_REFRESH_TOKEN,
  };
  return handleDispatchRequest(request, {
    ...config,
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
    store: () => createBindingStore(config),
  });
}

const FIREBASE_AUTH_ORIGIN = 'https://treeserv-geo.firebaseapp.com';

const FORWARDED_REQUEST_HEADERS = [
  'accept',
  'accept-language',
  'content-type',
  'user-agent',
] as const;

function upstreamRequest(request: Request) {
  const incomingUrl = new URL(request.url);
  const upstreamUrl = new URL(`${incomingUrl.pathname}${incomingUrl.search}`, FIREBASE_AUTH_ORIGIN);
  const headers = new Headers();

  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }

  return new Request(upstreamUrl, {
    method: request.method,
    headers,
    body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
    redirect: 'manual',
  });
}

function rewriteResponse(response: Response, request: Request) {
  const headers = new Headers(response.headers);
  const location = headers.get('location');
  if (location) {
    const upstreamLocation = new URL(location, FIREBASE_AUTH_ORIGIN);
    if (upstreamLocation.origin === FIREBASE_AUTH_ORIGIN) {
      const publicOrigin = new URL(request.url).origin;
      headers.set('location', `${publicOrigin}${upstreamLocation.pathname}${upstreamLocation.search}${upstreamLocation.hash}`);
    }
  }

  // The proxy never needs application cookies. Avoid allowing an upstream
  // Domain attribute to escape back to the public Site host.
  headers.delete('set-cookie');
  headers.set('x-content-type-options', 'nosniff');

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function proxyFirebaseAuth(request: Request) {
  const response = await fetch(upstreamRequest(request));
  return rewriteResponse(response, request);
}

export const dynamic = 'force-dynamic';
export const GET = proxyFirebaseAuth;
export const POST = proxyFirebaseAuth;
export const HEAD = proxyFirebaseAuth;
export const OPTIONS = proxyFirebaseAuth;

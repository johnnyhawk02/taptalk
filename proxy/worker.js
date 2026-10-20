// TapTalk photo proxy — a Cloudflare Worker.
//
// Google Photos only hands out a photo when the request carries the user's
// sign-in token, and its image server won't accept that from a web page
// (CORS). This worker fetches the photo on the app's behalf and passes it back.
//
// Usage from the app:  GET https://<worker>/?url=<baseUrl>=w800-h800
//                      Authorization: Bearer <token>
//
// It only fetches from Google's photo servers and only answers the origins
// listed below, so it can't be used as an open proxy. It stores nothing.

const ALLOWED_ORIGINS = [
  'https://johnnyhawk02.github.io',
  'http://localhost:8642',
];

const ALLOWED_HOST = /(^|\.)googleusercontent\.com$/;

export default {
  async fetch(request) {
    const origin = request.headers.get('Origin') || '';
    const allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
    const cors = {
      'Access-Control-Allow-Origin': allowOrigin,
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin',
    };

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'GET') return new Response('Method not allowed', { status: 405, headers: cors });
    if (!ALLOWED_ORIGINS.includes(origin)) return new Response('Forbidden', { status: 403, headers: cors });

    let target;
    try {
      target = new URL(new URL(request.url).searchParams.get('url'));
    } catch {
      return new Response('Missing or bad url', { status: 400, headers: cors });
    }
    if (target.protocol !== 'https:' || !ALLOWED_HOST.test(target.hostname)) {
      return new Response('Host not allowed', { status: 400, headers: cors });
    }

    const auth = request.headers.get('Authorization');
    if (!auth?.startsWith('Bearer ')) return new Response('Missing token', { status: 401, headers: cors });

    const upstream = await fetch(target, { headers: { Authorization: auth } });
    const headers = new Headers(cors);
    headers.set('Content-Type', upstream.headers.get('Content-Type') || 'application/octet-stream');
    headers.set('Cache-Control', 'no-store');
    return new Response(upstream.body, { status: upstream.status, headers });
  },
};

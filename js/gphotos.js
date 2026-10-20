// Choose a photo straight from Google Photos, using Google's Photos Picker API.
//
// 1. Sign in with Google (full-page redirect: pop-ups are unreliable in an
//    iPad home-screen app). The token lasts about an hour.
// 2. Create a picker session and let the grown-up open Google Photos.
// 3. Poll until they've chosen, then download the photo through our proxy
//    (Google's image server won't hand photos to a web page directly).

import { GOOGLE_CLIENT_ID, PHOTO_PROXY_URL } from './config.js';

const SCOPE = 'https://www.googleapis.com/auth/photospicker.mediaitems.readonly';
const API = 'https://photospicker.googleapis.com/v1';
const TOKEN_KEY = 'taptalk.gtoken';
const RESUME_KEY = 'taptalk.gresume';
const PHOTO_SIZE = '=w800-h800';

export const enabled = Boolean(GOOGLE_CLIENT_ID && PHOTO_PROXY_URL);

function redirectUri() {
  return location.origin + location.pathname.replace(/index\.html$/, '');
}

function readJSON(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}

function token() {
  const t = readJSON(TOKEN_KEY);
  return t && t.exp > Date.now() + 60_000 ? t.value : '';
}

// Leaves the app for Google sign-in. `resume` is handed back by takeResume()
// when we return, so the app can reopen the editor where it was.
function signIn(resume) {
  const state = Math.random().toString(36).slice(2);
  localStorage.setItem(RESUME_KEY, JSON.stringify({ state, at: Date.now(), resume }));
  const p = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri(),
    response_type: 'token',
    scope: SCOPE,
    include_granted_scopes: 'true',
    state,
  });
  location.assign('https://accounts.google.com/o/oauth2/v2/auth?' + p);
}

// Call once at start-up. If we've just come back from Google sign-in, stores
// the token and returns what was passed to signIn(); otherwise null.
export function takeResume() {
  if (!location.hash.includes('access_token') && !location.hash.includes('error=')) return null;
  const p = new URLSearchParams(location.hash.slice(1));
  history.replaceState(null, '', redirectUri());
  const saved = readJSON(RESUME_KEY);
  localStorage.removeItem(RESUME_KEY);
  if (!saved || saved.state !== p.get('state') || Date.now() - saved.at > 30 * 60_000) return null;
  if (p.get('access_token')) {
    const exp = Date.now() + Number(p.get('expires_in') || 3600) * 1000;
    localStorage.setItem(TOKEN_KEY, JSON.stringify({ value: p.get('access_token'), exp }));
  }
  return { resume: saved.resume, ok: Boolean(p.get('access_token')), error: p.get('error') };
}

async function api(path, opts = {}) {
  const res = await fetch(API + path, {
    ...opts,
    headers: { Authorization: 'Bearer ' + token(), 'Content-Type': 'application/json', ...opts.headers },
  });
  if (res.status === 401) { localStorage.removeItem(TOKEN_KEY); throw Object.assign(new Error('signed out'), { auth: true }); }
  if (!res.ok) throw new Error(`Google Photos said ${res.status}`);
  return res.status === 204 ? null : res.json();
}

const seconds = (d, fallback) => (parseFloat(d) || fallback) * 1000;
// Waits `ms`, but wakes early on Cancel or when the grown-up switches back
// from Google Photos.
const sleep = (ms, signal) => new Promise((resolve) => {
  const done = () => {
    clearTimeout(t);
    signal.removeEventListener('abort', done);
    document.removeEventListener('visibilitychange', onVisible);
    resolve();
  };
  const onVisible = () => { if (document.visibilityState === 'visible') done(); };
  const t = setTimeout(done, ms);
  signal.addEventListener('abort', done);
  document.addEventListener('visibilitychange', onVisible);
});

/**
 * Runs the whole pick flow. `ui` gives:
 *   status(text)          show a message
 *   ready(pickerUri)      show the "Open Google Photos" link
 *   signal                AbortSignal for Cancel
 *   resume                state to restore if we must leave to sign in
 * Resolves with an image Blob, or null if cancelled.
 */
export async function pick(ui) {
  if (!token()) { signIn(ui.resume); return new Promise(() => {}); }

  let session;
  try {
    ui.status('Connecting to Google Photos…');
    session = await api('/sessions', { method: 'POST', body: JSON.stringify({ pickingConfig: { maxItemCount: '1' } }) });
  } catch (err) {
    if (err.auth) { signIn(ui.resume); return new Promise(() => {}); }
    throw err;
  }

  try {
    ui.ready(session.pickerUri.replace(/\/$/, '') + '/autoclose');
    ui.status('Tap “Open Google Photos”, choose one photo, tap Done, then come back here.');

    const interval = seconds(session.pollingConfig?.pollInterval, 3);
    const deadline = Date.now() + seconds(session.pollingConfig?.timeoutIn, 600);
    while (!session.mediaItemsSet) {
      if (ui.signal.aborted) return null;
      if (Date.now() > deadline) throw new Error('Took too long — please try again.');
      await sleep(interval, ui.signal);
      if (ui.signal.aborted) return null;
      session = await api('/sessions/' + session.id);
    }

    ui.status('Getting your photo…');
    const list = await api(`/mediaItems?sessionId=${encodeURIComponent(session.id)}&pageSize=1`);
    const item = list.mediaItems?.[0];
    if (!item?.mediaFile?.baseUrl) throw new Error('No photo was chosen.');

    const res = await fetch(PHOTO_PROXY_URL + '?url=' + encodeURIComponent(item.mediaFile.baseUrl + PHOTO_SIZE), {
      headers: { Authorization: 'Bearer ' + token() },
      signal: ui.signal,
    });
    if (!res.ok) throw new Error(`Could not download the photo (${res.status}).`);
    return await res.blob();
  } finally {
    api('/sessions/' + session.id, { method: 'DELETE' }).catch(() => {});
  }
}

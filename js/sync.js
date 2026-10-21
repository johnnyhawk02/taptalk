// Send the board from the editing computer to the tablet, through a private
// GitHub repository.
//
//   board.json        pages + settings (+ which photo file is which)
//   photos/<id>.<ext> each caregiver photo, uploaded once
//
// The computer needs a token that can write the repo's contents; the tablet
// only needs one that can read them. Tokens stay in this device's storage.

import * as photos from './photos.js';
import { SYNC_REPO } from './config.js';

const KEY = 'taptalk.sync';
const API = 'https://api.github.com/repos/';
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/svg+xml': 'svg' };
const TYPE = Object.fromEntries(Object.entries(EXT).map(([t, e]) => [e, t]));
// Settings that belong to a device rather than to Robyn's board.
const LOCAL_SETTINGS = ['voice'];

export function config() {
  let c = {};
  try { c = JSON.parse(localStorage.getItem(KEY)) || {}; } catch { /* use defaults */ }
  return { mode: 'off', repo: SYNC_REPO, token: '', lastSent: '', lastReceived: '', auto: true, ...c };
}

export function setConfig(patch) {
  localStorage.setItem(KEY, JSON.stringify({ ...config(), ...patch }));
}

async function gh(path, { method = 'GET', body, raw = false } = {}) {
  const { repo, token } = config();
  if (!repo || !token) throw new Error('Sync is not set up on this device.');
  const res = await fetch(API + repo + '/contents/' + path, {
    method,
    cache: 'no-store',
    headers: {
      Authorization: 'Bearer ' + token,
      Accept: raw ? 'application/vnd.github.raw' : 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(body && { 'Content-Type': 'application/json' }),
    },
    body: body && JSON.stringify(body),
  });
  if (res.status === 404 && method === 'GET') return null;
  if (res.status === 401) throw new Error('The GitHub token was refused. It may have expired; make a new one.');
  if (res.status === 403) throw new Error('The GitHub token is not allowed to do that. Check its permissions.');
  if (!res.ok) throw new Error(`GitHub said ${res.status}.`);
  return raw ? res : res.json();
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1]);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

const textToBase64 = (text) => blobToBase64(new Blob([text], { type: 'application/json' }));

function photoIds(pages) {
  const ids = new Set();
  for (const page of Object.values(pages)) {
    for (const item of page.items) if (item.sym?.startsWith('u:')) ids.add(item.sym.slice(2));
  }
  return ids;
}

/** Computer: upload new photos, then the board. `progress(text)` reports steps. */
export async function send({ pages, settings, stateVersion }, progress = () => {}) {
  progress('Checking what the tablet already has…');
  const remote = await gh('photos');
  const have = new Set((remote || []).map((f) => f.name.replace(/\.[^.]+$/, '')));

  const files = {};
  const ids = [...photoIds(pages)];
  let n = 0;
  for (const id of ids) {
    const blob = await photos.get(id);
    if (!blob) continue; // a photo that was lost on this device; the button keeps its word
    const ext = EXT[blob.type] || 'jpg';
    files[id] = `${id}.${ext}`;
    if (have.has(id)) continue;
    progress(`Sending photo ${++n}…`);
    await gh('photos/' + files[id], {
      method: 'PUT',
      body: { message: 'TapTalk: add photo', content: await blobToBase64(blob) },
    });
  }

  progress('Sending the board…');
  const shared = Object.fromEntries(Object.entries(settings).filter(([k]) => !LOCAL_SETTINGS.includes(k)));
  const board = { app: 'taptalk', kind: 'shared-board', stateVersion, updated: new Date().toISOString(), pages, settings: shared, photos: files };
  const existing = await gh('board.json');
  await gh('board.json', {
    method: 'PUT',
    body: { message: 'TapTalk: update board', content: await textToBase64(JSON.stringify(board)), ...(existing && { sha: existing.sha }) },
  });
  setConfig({ lastSent: board.updated });
  return board.updated;
}

/**
 * Tablet: fetch the board if it changed since last time. Returns
 * { board } with photos already stored locally, or null if nothing new.
 */
export async function fetchUpdate() {
  const res = await gh('board.json', { raw: true });
  if (!res) return null;
  const board = await res.json();
  if (board.app !== 'taptalk' || !board.pages?.home) throw new Error('board.json is not a TapTalk board.');
  if (board.updated === config().lastReceived) return null;

  for (const [id, file] of Object.entries(board.photos || {})) {
    if (await photos.get(id)) continue;
    const pic = await gh('photos/' + file, { raw: true });
    if (!pic) continue;
    const type = TYPE[file.split('.').pop()] || 'image/jpeg';
    await photos.put(id, new Blob([await pic.arrayBuffer()], { type }));
  }
  return { board };
}

export function markReceived(updated) {
  setConfig({ lastReceived: updated });
}

export { LOCAL_SETTINGS };

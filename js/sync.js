// Shares a board between devices through a private GitHub repository (optional:
// without it, the board stays on the device).
//
//   board.json        pages + settings (+ which photo file is which)
//   photos/<id>.<ext> each caregiver photo, uploaded once
//
// Boards are merged, never simply replaced (see merge.js), so the computer's
// edits and the school iPad's edits are both kept. A device that sends needs
// a token that can write the repo's contents; a device that only receives
// needs one that can read them. Tokens stay in this device's storage.

import * as photos from './photos.js';
import * as clips from './clips.js';
import { merge, fingerprint } from './merge.js';
import { SYNC_REPO } from './config.js';

const KEY = 'taptalk.sync';
const API = 'https://api.github.com/repos/';
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/svg+xml': 'svg' };
const TYPE = Object.fromEntries(Object.entries(EXT).map(([t, e]) => [e, t]));
// Settings that belong to a device rather than to Robyn's board.
const LOCAL_SETTINGS = ['voice', 'activeSet'];

export function config() {
  let c = {};
  try { c = JSON.parse(localStorage.getItem(KEY)) || {}; } catch { /* use defaults */ }
  // Devices linked before sharing became optional relied on SYNC_REPO as the
  // default; everyone else names their own private repository.
  if (c.token && !('repo' in c)) c.repo = SYNC_REPO;
  return { mode: 'off', repo: '', token: '', lastSent: '', lastReceived: '', auto: true, ...c };
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

/**
 * Fetch the shared board, merge it with this device's, store any new photos,
 * and (if `upload`) send the merged board back. Returns
 * { board, changedHere, sent } where `board` is the merged board to use here.
 */
export async function exchange(local, { upload = false, progress = () => {} } = {}, retry = true) {
  progress('Getting the latest board…');
  const res = await gh('board.json', { raw: true });
  const remote = res ? await res.json() : null;
  if (remote && (remote.app !== 'taptalk' || !remote.pages?.home)) throw new Error('board.json is not a TapTalk board.');

  // First link: start from one board rather than merging two unrelated ones
  // (their buttons wouldn't match up). The editing computer's board becomes
  // the shared one; an iPad takes the shared board. After that, always merge.
  const { mode, linked } = config();
  const own = { pages: local.pages, deleted: local.deleted || {}, settings: local.settings, settingsAt: local.settingsAt || 0 };
  let merged;
  const adopted = Boolean(remote && !linked && mode !== 'send');
  if (!remote || (!linked && mode === 'send')) merged = own;
  else if (!linked) merged = { pages: remote.pages, deleted: remote.deleted || {}, settings: { ...local.settings, ...remote.settings }, settingsAt: remote.settingsAt || 0 };
  else merged = merge(local, remote);
  const files = { ...(remote?.photos || {}) };

  // Photos the merged board uses that this device doesn't have yet.
  for (const id of photoIds(merged.pages)) {
    if (!files[id] || (await photos.get(id))) continue;
    const pic = await gh('photos/' + files[id], { raw: true });
    if (!pic) continue;
    const type = TYPE[files[id].split('.').pop()] || 'image/jpeg';
    await photos.put(id, new Blob([await pic.arrayBuffer()], { type }));
  }

  const changedHere = fingerprint(merged) !== fingerprint(local);
  const remoteSame = remote && fingerprint(merged) === fingerprint({ ...remote, settings: { ...merged.settings, ...remote.settings } })
    && [...photoIds(merged.pages)].every((id) => files[id]);
  if (!upload || remoteSame) {
    // The computer only counts as linked once it has sent its board (when the
    // grown-up presses Send); an iPad is linked once it has taken the board.
    if (remote) setConfig({ lastReceived: remote.updated, linked: linked || mode !== 'send' });
    return { board: merged, changedHere, sent: false, adopted };
  }

  // Upload photos the shared board doesn't have yet, then the board.
  const have = new Set(((await gh('photos')) || []).map((f) => f.name.replace(/\.[^.]+$/, '')));
  let n = 0;
  for (const id of photoIds(merged.pages)) {
    const blob = await photos.get(id);
    if (!blob) continue; // lost on this device; the button keeps its word
    files[id] ||= `${id}.${EXT[blob.type] || 'jpg'}`;
    if (have.has(id)) continue;
    progress(`Sending photo ${++n}…`);
    await gh('photos/' + files[id], { method: 'PUT', body: { message: 'TapTalk: add photo', content: await blobToBase64(blob) } });
  }

  progress('Sending the board…');
  const shared = Object.fromEntries(Object.entries(merged.settings).filter(([k]) => !LOCAL_SETTINGS.includes(k)));
  const board = {
    app: 'taptalk', kind: 'shared-board', stateVersion: local.stateVersion, updated: new Date().toISOString(),
    pages: merged.pages, deleted: merged.deleted, settings: shared, settingsAt: merged.settingsAt, photos: files,
  };
  const meta = await gh('board.json');
  try {
    await gh('board.json', {
      method: 'PUT',
      body: { message: 'TapTalk: update board', content: await textToBase64(JSON.stringify(board)), ...(meta && { sha: meta.sha }) },
    });
  } catch (err) {
    // Another device saved in the meantime: merge with theirs and try again.
    if (retry && /409|422/.test(err.message)) {
      setConfig({ linked: true });
      return exchange({ ...local, ...merged }, { upload, progress }, false);
    }
    throw err;
  }
  setConfig({ lastSent: board.updated, lastReceived: board.updated, linked: true });
  return { board: merged, changedHere, sent: true, adopted };
}

/**
 * Share the recorded voice: download the recordings of these words that this
 * device lacks, and (on a device that sends) upload the ones only it has.
 * Recordings never change, so there's nothing to merge. Returns counts.
 */
export async function syncClips(words, { progress = () => {} } = {}) {
  const { mode } = config();
  if (mode === 'off') return { got: 0, sent: 0 };
  const dir = 'clips/' + clips.VOICE.slice(4);
  const listing = await gh(dir);
  const remote = new Set((listing || []).map((f) => f.name));
  let got = 0;
  let sent = 0;
  for (const word of words) {
    const name = await clips.fileName(word);
    const here = await clips.has(clips.VOICE, word);
    if (await clips.isBundled(word)) continue; // built into TapTalk already
    if (!here && remote.has(name)) {
      const res = await gh(`${dir}/${name}`, { raw: true });
      if (res) { await clips.putData(clips.VOICE, word, await res.arrayBuffer()); got++; progress(got, sent); }
    } else if (here && !remote.has(name) && (mode === 'send' || mode === 'both')) {
      const data = await clips.getData(clips.VOICE, word);
      if (!data) continue;
      await gh(`${dir}/${name}`, { method: 'PUT', body: { message: `TapTalk: record "${word.slice(0, 40)}"`, content: await blobToBase64(new Blob([data])) } });
      remote.add(name);
      sent++;
      progress(got, sent);
    }
  }
  return { got, sent };
}

export function markReceived(updated) {
  setConfig({ lastReceived: updated });
}

export { LOCAL_SETTINGS };

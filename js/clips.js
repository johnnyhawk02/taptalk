// Recorded voice: each button's words are recorded once by OpenAI's AI voice
// and kept on this device, so a tap plays its recording and a sentence plays
// its words' recordings one after another. Nothing is synthesised on the iPad
// and, once recorded, it works offline. The OpenAI key is the one in
// Settings → Pictures (kept on this device only).

import * as ai from './aipics.js';

const DB = 'taptalk-clips';
const STORE = 'clips';
export const MODEL = 'gpt-4o-mini-tts';
export const STYLE = 'Speak in a warm, friendly, clear British English accent, as a gentle young woman helping a child to talk. '
  + 'Say only these words, naturally and calmly, with no extra sounds.';

// One recorded voice, shared by every device through the private board repo
// (clips/coral/), so a device without the OpenAI key still gets it.
export const VOICE = 'rec:coral';
export const VOICES = [{ id: VOICE, name: 'Coral', about: 'warm, British (recorded AI voice)' }];
export const isRec = (id) => typeof id === 'string' && id.startsWith('rec:');
const voiceName = (id) => id.slice(4);
const keyFor = (voice, text) => `${voice}|${text.trim().toLowerCase()}`;

// ---------- Storage (IndexedDB, as ArrayBuffers: some Safari sessions refuse Blobs) ----------

let dbp = null;
function db() {
  dbp ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}
async function tx(mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(STORE, mode);
    const out = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(out?.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

// The starting board's recordings ship with TapTalk (symbols/voice/coral/),
// so they work straight after install, offline too.
const BUNDLED = new URL('../symbols/voice/coral/', import.meta.url).href;
let bundled = null; // file names
async function bundledFiles() {
  bundled ??= fetch(BUNDLED + 'index.json').then((r) => (r.ok ? r.json() : [])).then((list) => new Set(list)).catch(() => new Set());
  return bundled;
}
export async function isBundled(text) { return (await bundledFiles()).has(await fileName(text)); }

let have = null; // keys of the recordings on this device
async function known() {
  if (!have) have = new Set(await tx('readonly', (s) => s.getAllKeys()).catch(() => []));
  return have;
}

/** The shared file name for a word's recording (same as tools/record-voice.mjs). */
export async function fileName(text) {
  const bytes = new TextEncoder().encode(text.trim().toLowerCase());
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-1', bytes));
  return [...hash].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 20) + '.mp3';
}

export async function has(voice, text) { return (await known()).has(keyFor(voice, text)); }
export async function getData(voice, text) { return (await tx('readonly', (s) => s.get(keyFor(voice, text))))?.data || null; }
export async function putData(voice, text, data) {
  const k = keyFor(voice, text);
  await tx('readwrite', (s) => s.put({ type: 'audio/mpeg', data }, k));
  (await known()).add(k);
  decoded.delete(k);
}

/** How many of these words are recorded in this voice. */
export async function count(voice, texts) {
  const k = await known();
  let n = 0;
  for (const t of texts) if (k.has(keyFor(voice, t)) || await isBundled(t)) n++;
  return n;
}

/** Record one word or phrase (needs the internet and the OpenAI key). */
export async function record(voice, text, signal) {
  const key = ai.key();
  if (!key) throw new Error('Add the OpenAI key in ⚙ Settings → Pictures first.');
  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    signal,
    headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, voice: voiceName(voice), input: text.trim(), instructions: STYLE, response_format: 'mp3' }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg = body.error?.message || '';
    if (res.status === 401) throw new Error('The OpenAI key was refused. Check it in ⚙ Settings → Pictures.');
    if (/credit|billing|quota/i.test(msg)) throw new Error('No OpenAI credit left. Add some at platform.openai.com.');
    throw new Error(msg || `OpenAI said ${res.status}.`);
  }
  const data = await res.arrayBuffer();
  const k = keyFor(voice, text);
  await tx('readwrite', (s) => s.put({ type: 'audio/mpeg', data }, k));
  (await known()).add(k);
  decoded.delete(k);
}

/** Record every word not yet recorded, a few at a time. */
export async function recordAll(voice, texts, progress = () => {}, signal) {
  const k = await known();
  const todo = [];
  for (const t of new Set(texts.map((x) => x.trim()).filter(Boolean))) if (!k.has(keyFor(voice, t)) && !await isBundled(t)) todo.push(t);
  let done = 0;
  let failed = 0;
  let firstError = '';
  const next = async () => {
    while (todo.length && !signal?.aborted) {
      const t = todo.shift();
      try { await record(voice, t, signal); done++; } catch (err) {
        if (signal?.aborted) return;
        failed++;
        firstError ||= err.message;
        if (/key|credit|verif/i.test(err.message)) { todo.length = 0; return; } // no point carrying on
      }
      progress(done, failed);
    }
  };
  await Promise.all([next(), next(), next()]);
  return { done, failed, firstError };
}

// ---------- Playback ----------

let ctx = null;
let waking = null;
let playing = [];
let playNo = 0;
const decoded = new Map(); // key -> AudioBuffer, trimmed of silence

/** Call during a tap: iPads only let sound start from one. */
export function unlock() {
  if (!ctx) {
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch { /* older iPadOS */ }
    ctx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (ctx.state !== 'running' && !waking) waking = ctx.resume().catch(() => {}).finally(() => { waking = null; });
}

export function stop() {
  playNo++;
  for (const src of playing) { try { src.stop(); } catch { /* already done */ } }
  playing = [];
}

// Recordings have a little silence at each end; cut it so a sentence's words
// run on naturally.
function trimSilence(buf) {
  const data = buf.getChannelData(0);
  let peak = 0;
  for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]));
  const t = peak * 0.02;
  let a = 0;
  let b = data.length - 1;
  while (a < b && Math.abs(data[a]) < t) a++;
  while (b > a && Math.abs(data[b]) < t) b--;
  const pad = Math.round(buf.sampleRate * 0.02);
  a = Math.max(0, a - pad);
  b = Math.min(data.length - 1, b + pad);
  const out = ctx.createBuffer(buf.numberOfChannels, b - a + 1, buf.sampleRate);
  for (let c = 0; c < buf.numberOfChannels; c++) out.copyToChannel(buf.getChannelData(c).slice(a, b + 1), c);
  return out;
}

async function bufferFor(voice, text, { record: canRecord = true } = {}) {
  const k = keyFor(voice, text);
  if (decoded.has(k)) return decoded.get(k);
  let data = null;
  if ((await known()).has(k)) data = (await tx('readonly', (s) => s.get(k)))?.data || null;
  else if (await isBundled(text)) {
    const res = await fetch(BUNDLED + await fileName(text)).catch(() => null);
    if (res?.ok) data = await res.arrayBuffer();
  }
  if (!data) {
    if (!canRecord || !navigator.onLine || !ai.key()) return null;
    try { await record(voice, text); } catch { return null; }
    data = (await tx('readonly', (s) => s.get(k)))?.data || null;
    if (!data) return null;
  }
  const buf = trimSilence(await ctx.decodeAudioData(data.slice(0)));
  decoded.set(k, buf);
  return buf;
}

/**
 * Play the recordings of these words, one after another. Resolves true when
 * played, false if any word has no recording (and can't get one now), so
 * the caller can use another voice.
 */
export async function speak(voice, words) {
  unlock();
  stop();
  const mine = playNo;
  const bufs = [];
  for (const w of words) {
    const b = await bufferFor(voice, w);
    if (!b) return false;
    bufs.push(b);
  }
  if (mine !== playNo) return true; // something newer was said meanwhile
  if (waking) await waking;
  let at = ctx.currentTime + 0.12; // a moment for the iPad's speaker to wake
  const gap = 0.08;
  let last = null;
  for (const b of bufs) {
    const src = ctx.createBufferSource();
    src.buffer = b;
    src.connect(ctx.destination);
    src.start(at);
    playing.push(src);
    at += b.duration + gap;
    last = src;
  }
  await new Promise((resolve) => { last.onended = resolve; });
  return true;
}

/** Decode words ahead of time so taps play instantly. */
export function warm(voice, words) {
  if (!ctx) return;
  for (const w of new Set(words)) if (w) bufferFor(voice, w, { record: false }).catch(() => {});
}

// Natural-sounding voices (Piper) that run on the device itself. iPads don't
// let web apps use the voices downloaded in iPad Settings, so TapTalk carries
// its own. A voice is downloaded once into the 'taptalk-voices' cache (the
// engine, ~31 MB, the first time, plus ~63 MB per voice) and then works offline.
// The speech is made in piper-worker.js and played here with Web Audio.

const CACHE = 'taptalk-voices';
const HF = 'https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_GB/';
const ENGINE = new URL('../vendor/piper/', import.meta.url).href;
const ENGINE_FILES = {
  'ort.wasm.bundle.min.mjs': 72812,
  'ort-wasm-simd-threaded.wasm': 12361745,
  'piper_phonemize.js': 120714,
  'piper_phonemize.wasm': 635212,
  'piper_phonemize.data': 18077249,
};
const VOICE_BYTES = 63.2e6; // medium voices; others say their own size

export const VOICES = [
  { id: 'piper:jenny', name: 'Jenny', about: 'woman, southern English', path: 'jenny_dioco/medium/en_GB-jenny_dioco-medium' },
  { id: 'piper:cori', name: 'Cori', about: 'woman, calm and clear', path: 'cori/medium/en_GB-cori-medium' },
  { id: 'piper:cori-hd', name: 'Cori HD', about: 'clearest, bigger download', path: 'cori/high/en_GB-cori-high', bytes: 114.2e6 },
  { id: 'piper:alba', name: 'Alba', about: 'woman, Scottish', path: 'alba/medium/en_GB-alba-medium' },
  { id: 'piper:southern', name: 'Southern English woman', about: 'brighter', path: 'southern_english_female/low/en_GB-southern_english_female-low' },
  { id: 'piper:alan', name: 'Alan', about: 'man', path: 'alan/medium/en_GB-alan-medium' },
  { id: 'piper:northern', name: 'Northern English man', about: 'Yorkshire', path: 'northern_english_male/medium/en_GB-northern_english_male-medium' },
];

export const isPiper = (id) => typeof id === 'string' && id.startsWith('piper:');
const voiceOf = (id) => VOICES.find((v) => v.id === id);
const engineUrls = () => Object.keys(ENGINE_FILES).map((f) => ENGINE + f);
const voiceUrls = (v) => [HF + v.path + '.onnx.json', HF + v.path + '.onnx'];

async function missing(urls) {
  const cache = await caches.open(CACHE);
  const out = [];
  for (const url of urls) if (!(await cache.match(url))) out.push(url);
  return out;
}

/** Whether a voice (and the engine) is on this device. */
export async function downloaded(id) {
  const v = voiceOf(id);
  if (!v || !('caches' in window)) return false;
  return (await missing([...engineUrls(), ...voiceUrls(v)])).length === 0;
}

const bytesOf = (url) => ENGINE_FILES[url.slice(ENGINE.length)] ?? (url.endsWith('.onnx') ? (VOICES.find((v) => url.endsWith(v.path + '.onnx'))?.bytes || VOICE_BYTES) : 5000);

/** Megabytes still to download for this voice. */
export async function downloadSize(id) {
  const todo = await missing([...engineUrls(), ...voiceUrls(voiceOf(id))]);
  return Math.round(todo.reduce((n, url) => n + bytesOf(url), 0) / 1e6);
}

/** Download a voice; progress(fraction) is called as it goes. */
export async function download(id, progress = () => {}) {
  navigator.storage?.persist?.().catch(() => {});
  const cache = await caches.open(CACHE);
  const todo = await missing([...engineUrls(), ...voiceUrls(voiceOf(id))]);
  const total = todo.reduce((n, url) => n + bytesOf(url), 0);
  let got = 0;
  for (const url of todo) {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`The download stopped (${res.status}). Try again on Wi-Fi.`);
    const reader = res.body.getReader();
    const chunks = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      got += value.length;
      progress(Math.min(0.99, got / total));
    }
    const type = res.headers.get('Content-Type') || 'application/octet-stream';
    await cache.put(url, new Response(new Blob(chunks, { type }), { headers: { 'Content-Type': type } }));
  }
  progress(1);
}

// ---------- The worker: one job at a time, spoken words before warm-ups ----------

let worker = null;
let busy = null;
const pending = [];
let jobNo = 0;
let readyId = null;
let loading = null; // { id, promise }

function startWorker() {
  worker = new Worker(new URL('./piper-worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = ({ data }) => {
    const job = busy;
    busy = null;
    if (data.type === 'error') job?.reject(new Error(data.message));
    else job?.resolve(data);
    pump();
  };
  worker.onerror = (e) => {
    e.preventDefault?.();
    for (const job of [busy, ...pending.splice(0)]) job?.reject(new Error('The voice stopped working.'));
    busy = null;
    worker.terminate();
    worker = null;
    readyId = null;
    loading = null;
  };
}

function post(msg, urgent) {
  return new Promise((resolve, reject) => {
    const job = { msg: { ...msg, n: ++jobNo }, urgent, resolve, reject };
    const at = urgent ? pending.findIndex((j) => !j.urgent) : -1;
    if (at === -1) pending.push(job); else pending.splice(at, 0, job);
    pump();
  });
}

function pump() {
  if (busy || !pending.length) return;
  if (!worker) startWorker();
  busy = pending.shift();
  worker.postMessage(busy.msg);
}

/** True once the voice is loaded and can speak straight away. */
export const isReady = (id) => readyId === id;

/** Load a downloaded voice so it is ready to speak (takes a few seconds). */
export function prepare(id) {
  if (readyId === id) return Promise.resolve();
  if (loading?.id === id) return loading.promise;
  const v = voiceOf(id);
  const promise = post({ type: 'load', engine: ENGINE, voice: { key: id, base: HF + v.path } }, true)
    .then(() => { readyId = id; memo.clear(); })
    .finally(() => { if (loading?.promise === promise) loading = null; });
  loading = { id, promise };
  return promise;
}

// ---------- Speech, remembered so a button's word plays instantly next time ----------

const memo = new Map();
const making = new Map(); // words being made now, so each is only made once
const MEMO_MAX = 400;

// A word on its own comes out rushed and a little wobbly, so it is said as a
// finished sentence, slower and steadier (chosen by ear for Robyn).
function shape(text, lengthScale) {
  text = text.trim();
  if (/\s/.test(text)) return { text, lengthScale, noise: 1 };
  return { text: /[.!?]$/.test(text) ? text : text + '.', lengthScale: lengthScale * 1.3, noise: 0.5, single: true };
}

// After a short word, some voices (Cori especially) sometimes keep going with
// a few seconds of babble. A word is one burst of sound, so cut at the first
// real pause after it, with a short fade, and never play more than 2.5 s.
function trimAfterWord(pcm, sampleRate) {
  const frame = Math.round(sampleRate * 0.01);
  const n = Math.floor(pcm.length / frame);
  const rms = new Float32Array(n);
  let peak = 0;
  for (let f = 0; f < n; f++) {
    let sum = 0;
    for (let i = f * frame; i < (f + 1) * frame; i++) sum += pcm[i] * pcm[i];
    rms[f] = Math.sqrt(sum / frame);
    peak = Math.max(peak, rms[f]);
  }
  const loud = Math.max(peak * 0.06, 0.004);
  let started = false;
  let lastLoud = 0;
  let quiet = 0;
  let end = n;
  for (let f = 0; f < n; f++) {
    if (rms[f] >= loud) { started = true; lastLoud = f; quiet = 0; } else if (started && ++quiet >= 25) { end = lastLoud + 6; break; }
  }
  end = Math.min(end * frame, pcm.length, Math.round(sampleRate * 2.5));
  const out = pcm.slice(0, end);
  const fade = Math.min(Math.round(sampleRate * 0.04), out.length);
  for (let i = 0; i < fade; i++) out[out.length - fade + i] *= 1 - i / fade;
  return out;
}

async function synth(id, text, lengthScale, urgent) {
  const job = shape(text, lengthScale);
  const key = `${job.lengthScale}|${job.noise}|${job.text}`;
  const hit = memo.get(key);
  if (hit) { memo.delete(key); memo.set(key, hit); return hit; }
  const already = making.get(key);
  if (already) { if (urgent) promote(key); return already; }
  const made = prepare(id).then(() => post({ type: 'say', ...job, key }, urgent)).then((raw) => {
    const audio = job.single ? { ...raw, pcm: trimAfterWord(raw.pcm, raw.sampleRate) } : raw;
    memo.set(key, audio);
    if (memo.size > MEMO_MAX) memo.delete(memo.keys().next().value);
    return audio;
  }).finally(() => making.delete(key));
  making.set(key, made);
  return made;
}

// A word being warmed up was tapped: make it next.
function promote(key) {
  const i = pending.findIndex((j) => j.msg.key === key);
  if (i < 0 || pending[i].urgent) return;
  const [job] = pending.splice(i, 1);
  job.urgent = true;
  const at = pending.findIndex((j) => !j.urgent);
  if (at === -1) pending.push(job); else pending.splice(at, 0, job);
}

// The speed and pitch sliders were made for the iPad voices (1 = normal).
// Pitch is raised by playing faster, so the speech is made slower to match.
const pitchFactor = (pitch) => 1 + (pitch - 1) * 0.5;
const scaleFor = ({ rate, pitch }) => Math.round((pitchFactor(pitch) / rate) * 100) / 100;

let ctx = null;
let playing = null;
let speakNo = 0;

/** Call during a tap: iPads only allow sound to start from one. */
let waking = null; // the resume() in progress, if the audio was asleep

export function unlock() {
  if (!ctx) {
    // Play like a media app, so the iPad's silent mode doesn't mute Robyn.
    // Set once: changing it again can make the iPad re-route its sound.
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch { /* older iPadOS */ }
    ctx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (ctx.state !== 'running' && !waking) {
    waking = ctx.resume().catch(() => {}).finally(() => { waking = null; });
  }
}

// iPads switch their speaker on a moment after sound starts, which clips the
// start of a short word, so every word is given a little silence first.
const LEAD_IN = 0.12; // seconds

export function stop() {
  speakNo++;
  try { playing?.stop(); } catch { /* already finished */ }
  playing = null;
}

/** Speak text in a Piper voice. Resolves when it has finished. */
export async function speak(id, text, opts) {
  unlock();
  stop();
  const mine = speakNo;
  const { pcm, sampleRate } = await synth(id, text, scaleFor(opts), true);
  if (mine !== speakNo) return; // something newer was said meanwhile
  if (waking) await waking; // the audio was asleep: let it wake fully first
  if (mine !== speakNo) return;
  const lead = Math.round(LEAD_IN * sampleRate);
  const buf = ctx.createBuffer(1, pcm.length + lead, sampleRate);
  buf.copyToChannel(pcm, 0, lead);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = pitchFactor(opts.pitch);
  src.connect(ctx.destination);
  await new Promise((resolve) => {
    src.onended = resolve;
    playing = src;
    src.start();
  });
  if (playing === src) playing = null;
}

/** Make words ahead of time (e.g. a page's buttons) so taps play instantly. */
export function warm(id, texts, opts) {
  if (readyId !== id) return;
  const ls = scaleFor(opts);
  for (const text of new Set(texts)) {
    if (text?.trim()) synth(id, text, ls, false).catch(() => {});
  }
}

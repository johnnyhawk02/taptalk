// Turns text into speech with a Piper voice, off the main thread so taps stay
// smooth. Every file comes from the 'taptalk-voices' cache that piper.js
// fills when a voice is downloaded, so this works offline.
//
//   in:  { type: 'load', engine, voice }            -> { type: 'loaded' }
//        { type: 'say', n, text, lengthScale, noise? } -> { type: 'audio', n, pcm, sampleRate }
//   out on failure: { type: 'error', n?, message }

const CACHE = 'taptalk-voices';

let ort = null;
let phonemizer = null;
let printed = null;
let loaded = null; // { key, session, config }

async function file(url) {
  const hit = await (await caches.open(CACHE)).match(url);
  const res = hit || await fetch(url);
  if (!res.ok) throw new Error('Missing voice file: ' + url);
  return res;
}

async function loadEngine(engine) {
  if (phonemizer) return;
  const [ortCode, ortWasm, phonCode, phonWasm, phonData] = await Promise.all([
    file(engine + 'ort.wasm.bundle.min.mjs').then((r) => r.blob()),
    file(engine + 'ort-wasm-simd-threaded.wasm').then((r) => r.arrayBuffer()),
    file(engine + 'piper_phonemize.js').then((r) => r.text()),
    file(engine + 'piper_phonemize.wasm').then((r) => r.arrayBuffer()),
    file(engine + 'piper_phonemize.data').then((r) => r.arrayBuffer()),
  ]);
  const ortUrl = URL.createObjectURL(new Blob([ortCode], { type: 'text/javascript' }));
  ort = await import(ortUrl);
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.wasmBinary = ortWasm;

  // The phonemizer is a classic Emscripten script; it can run many times once
  // started (noInitialRun), which keeps each word fast.
  const create = new Function(phonCode + '\nreturn createPiperPhonemize;')();
  phonemizer = await create({
    noInitialRun: true,
    wasmBinary: phonWasm,
    getPreloadedPackage: () => phonData,
    print: (line) => { printed = line; },
    printErr: () => {},
  });
}

async function loadVoice(voice) {
  if (loaded?.key === voice.key) return;
  const config = await (await file(voice.base + '.onnx.json')).json();
  const model = await (await file(voice.base + '.onnx')).arrayBuffer();
  const session = await ort.InferenceSession.create(model, { executionProviders: ['wasm'] });
  loaded = { key: voice.key, session, config };
}

function phonemeIds(text) {
  printed = null;
  phonemizer.callMain(['-l', loaded.config.espeak.voice, '--input', JSON.stringify([{ text }]), '--espeak_data', '/espeak-ng-data']);
  if (!printed) throw new Error('Could not read: ' + text);
  return JSON.parse(printed).phoneme_ids;
}

async function say(text, lengthScale, noise = 1) {
  const ids = phonemeIds(text);
  const { inference } = loaded.config;
  const feeds = {
    input: new ort.Tensor('int64', BigInt64Array.from(ids, BigInt), [1, ids.length]),
    input_lengths: new ort.Tensor('int64', BigInt64Array.from([BigInt(ids.length)]), [1]),
    scales: new ort.Tensor('float32', Float32Array.from([inference.noise_scale * noise, inference.length_scale * lengthScale, inference.noise_w * noise]), [3]),
  };
  if (Object.keys(loaded.config.speaker_id_map || {}).length) {
    feeds.sid = new ort.Tensor('int64', BigInt64Array.from([0n]), [1]);
  }
  const out = await loaded.session.run(feeds);
  return Float32Array.from(out.output.data);
}

// One job at a time, in order: the page only sends the next when this one is done.
self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'load') {
      await loadEngine(data.engine);
      await loadVoice(data.voice);
      self.postMessage({ type: 'loaded', key: data.voice.key });
    } else if (data.type === 'say') {
      const pcm = await say(data.text, data.lengthScale, data.noise);
      self.postMessage({ type: 'audio', n: data.n, pcm, sampleRate: loaded.config.audio.sample_rate }, [pcm.buffer]);
    }
  } catch (err) {
    self.postMessage({ type: 'error', n: data.n, message: String(err?.message || err) });
  }
};

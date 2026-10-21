// Makes test pictures for board words with OpenAI's image model (transparent
// PNGs), then writes a review page to mark the bad ones.
//
//   node tools/make-pictures.mjs               20 test words
//   node tools/make-pictures.mjs apple swing   just these words
//
// Asks for the OpenAI API key without showing it (or reads OPENAI_API_KEY).
// Nothing is saved except the pictures, in ../taptalk-pictures/ (outside this
// public repository). Options: QUALITY=low|medium|high (default low),
// MODEL=gpt-image-1 (default).

import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DEFAULT_PAGES } from '../js/board.js';

const OUT = resolve(import.meta.dirname, '../../taptalk-pictures');
const MODEL = process.env.MODEL || 'gpt-image-1';
const QUALITY = process.env.QUALITY || 'low';
const AT_ONCE = 4;
const DRY = process.env.DRY_RUN === '1';

const TEST_WORDS = [
  'apple', 'trampoline', 'bubbles', 'scooter', 'teddy', 'my cup', 'toilet',
  'mum', 'teacher', 'happy', 'sad', 'scared', 'tired',
  'eat', 'jump', 'wash hands', 'brush teeth', 'more', 'all done', 'stop',
];

const STYLE = 'A simple AAC communication symbol for a young child. Bold dark outline, flat bright colours, '
  + 'no shading or texture, no text, letters or numbers. Centred, filling most of the square. '
  + 'Clear and instantly recognisable even when small, in the style of a pictogram. Transparent background.';

// The board's own word list: type (for the prompt and tile colour) and its ARASAAC picture.
const words = new Map();
for (const page of Object.values(DEFAULT_PAGES)) {
  for (const [label, sym, type] of page.items) {
    if (type !== 'folder' && !words.has(label.toLowerCase())) words.set(label.toLowerCase(), { label, sym, type });
  }
}

function subject({ label, type }) {
  if (type === 'noun') return `Subject: ${label}.`;
  if (type === 'pron') return `Subject: ${label}, shown as a friendly simple person.`;
  if (type === 'verb') return `Subject: a simple child figure showing the action "${label}".`;
  if (type === 'desc') return `Subject: the idea "${label}", shown with a simple child figure or object.`;
  return `Subject: the idea "${label}", shown as simply as possible.`;
}

async function askKey() {
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY.trim();
  process.stdout.write('OpenAI API key (hidden, press Return when done): ');
  process.stdin.setRawMode?.(true);
  process.stdin.resume();
  let key = '';
  for await (const chunk of process.stdin) {
    for (const ch of chunk.toString()) {
      if (ch === '\r' || ch === '\n') { process.stdin.setRawMode?.(false); process.stdin.pause(); process.stdout.write('\n'); return key.trim(); }
      if (ch === '\u0003') process.exit(1); // Ctrl-C
      if (ch === '\u007f') key = key.slice(0, -1); else key += ch;
    }
  }
  return key.trim();
}

async function makeOne(key, word) {
  if (DRY) return Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL, prompt: `${STYLE}\n${subject(word)}`, n: 1, size: '1024x1024',
      quality: QUALITY, background: 'transparent', output_format: 'png',
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error?.message || `OpenAI said ${res.status}`);
  return Buffer.from(body.data[0].b64_json, 'base64');
}

const file = (label) => label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '.png';

const wanted = (process.argv.slice(2).length ? process.argv.slice(2) : TEST_WORDS)
  .map((w) => words.get(w.toLowerCase()) || { label: w, sym: '', type: 'noun' });
const key = DRY ? '' : await askKey();
if (!DRY && !key) { console.error('No key given.'); process.exit(1); }

mkdirSync(OUT, { recursive: true });
const metaFile = resolve(OUT, 'pictures.json');
const meta = existsSync(metaFile) ? JSON.parse(readFileSync(metaFile, 'utf8')) : {};
const queue = [...wanted];
let done = 0;
let failed = 0;
await Promise.all(Array.from({ length: AT_ONCE }, async () => {
  for (let w = queue.shift(); w; w = queue.shift()) {
    try {
      writeFileSync(resolve(OUT, file(w.label)), await makeOne(key, w));
      meta[w.label] = { file: file(w.label), type: w.type, sym: w.sym, model: MODEL, quality: QUALITY, prompt: subject(w) };
      console.log(`✓ ${++done}/${wanted.length} ${w.label}`);
    } catch (err) {
      failed++;
      console.log(`✗ ${w.label}: ${err.message}`);
      if (/billing|quota|invalid api key|incorrect api key|verified/i.test(err.message)) { queue.length = 0; }
    }
  }
}));
writeFileSync(metaFile, JSON.stringify(meta, null, 1));

// The review page: each picture on its button colour, next to today's ARASAAC one.
const pictures = Object.entries(meta).map(([label, m]) => ({ label, ...m, arasaac: m.sym?.startsWith('a:') ? `../taptalk/symbols/arasaac/${m.sym.slice(2)}.png` : '' }));
writeFileSync(resolve(OUT, 'review.html'), readFileSync(resolve(import.meta.dirname, 'review-pictures.html'), 'utf8').replace('/*PICTURES*/[]', JSON.stringify(pictures)));
console.log(`\n${done} made, ${failed} failed. Open the review page:\n  ${resolve(OUT, 'review.html')}`);

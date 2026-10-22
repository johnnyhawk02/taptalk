// Records every word on Robyn's board (and the starting board) in the shared
// recorded voice, and puts the recordings in the private board repo
// (clips/coral/), where every TapTalk device picks them up when it syncs.
//
//   node tools/record-voice.mjs            Robyn's board -> private repo
//   node tools/record-voice.mjs --bundle   starting-board words -> built into
//                                          TapTalk (symbols/voice/coral/)
//
// Asks for the OpenAI key without showing it (or reads OPENAI_API_KEY). Uses
// the GitHub CLI (gh), already signed in, to read the board and push the
// recordings in one commit. Words already recorded are skipped, so it's safe
// to run again after adding buttons.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { DEFAULT_PAGES } from '../js/board.js';
import { MODEL, STYLE, VOICE } from '../js/clips.js';
import { SYNC_REPO } from '../js/config.js';

const voice = VOICE.slice(4);
const BUNDLE = process.argv.includes('--bundle');
const fileName = (text) => createHash('sha1').update(text.trim().toLowerCase()).digest('hex').slice(0, 20) + '.mp3';
const gh = (...args) => execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 64 << 20 });

async function askKey() {
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY.trim();
  process.stdout.write('OpenAI API key (hidden, press Return when done): ');
  process.stdin.setRawMode?.(true);
  process.stdin.resume();
  let key = '';
  for await (const chunk of process.stdin) {
    for (const ch of chunk.toString()) {
      if (ch === '\r' || ch === '\n') { process.stdin.setRawMode?.(false); process.stdin.pause(); process.stdout.write('\n'); return key.trim(); }
      if (ch === '\u0003') process.exit(1);
      if (ch === '\u007f') key = key.slice(0, -1); else key += ch;
    }
  }
  return key.trim();
}

// Every word or phrase a button says.
const words = new Set();
const add = (label, say) => { const t = (say || label || '').trim(); if (t) words.add(t); };
for (const page of Object.values(DEFAULT_PAGES)) for (const [label, , type, extra] of page.items) if (type !== 'folder') add(label, extra?.say);
let board = null;
if (!BUNDLE) try { board = JSON.parse(gh('api', `repos/${SYNC_REPO}/contents/board.json`, '-H', 'Accept: application/vnd.github.raw')); } catch { console.log('(Could not read the shared board; recording the starting board only.)'); }
if (board) for (const page of Object.values(board.pages)) for (const it of page.items) if (it.type !== 'folder') add(it.label, it.say);
// Test voice phrase in Settings.
words.add('Hello! I want to play.');

// --bundle: into this checkout of TapTalk; otherwise into a copy of the board repo.
const dir = BUNDLE ? resolve(import.meta.dirname, '..') : mkdtempSync(join(tmpdir(), 'taptalk-voice-'));
if (!BUNDLE) {
  console.log(`Getting the board repo…`);
  gh('repo', 'clone', SYNC_REPO, dir, '--', '--depth', '1', '--quiet');
}
const clipDir = BUNDLE ? join(dir, 'symbols', 'voice', voice) : join(dir, 'clips', voice);
mkdirSync(clipDir, { recursive: true });
const todo = [...words].filter((w) => !existsSync(join(clipDir, fileName(w))));
console.log(`${words.size} words; ${words.size - todo.length} already recorded; ${todo.length} to record in "${voice}".`);
if (!todo.length) { if (!BUNDLE) rmSync(dir, { recursive: true, force: true }); process.exit(0); }

const key = await askKey();
if (!key) { console.error('No key given.'); process.exit(1); }
let done = 0;
let failed = 0;
const queue = [...todo];
await Promise.all(Array.from({ length: 4 }, async () => {
  for (let w = queue.shift(); w; w = queue.shift()) {
    try {
      const res = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: MODEL, voice, input: w, instructions: STYLE, response_format: 'mp3' }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error?.message || `OpenAI said ${res.status}`);
      writeFileSync(join(clipDir, fileName(w)), Buffer.from(await res.arrayBuffer()));
      done++;
      if (done % 20 === 0 || done === todo.length) console.log(`  recorded ${done} of ${todo.length}`);
    } catch (err) {
      failed++;
      console.log(`  ✗ "${w}": ${err.message}`);
      if (/key|credit|quota|billing/i.test(err.message)) queue.length = 0;
    }
  }
}));

if (BUNDLE) {
  // The list TapTalk reads to know which recordings are built in.
  writeFileSync(join(clipDir, 'index.json'), JSON.stringify(readdirSync(clipDir).filter((f) => f.endsWith('.mp3')).sort()));
  console.log(`\nDone: ${done} recorded${failed ? `, ${failed} failed` : ''}, built into TapTalk. Run node tools/build-precache.mjs and publish.`);
  process.exit(0);
}
if (done) {
  const git = (...a) => execFileSync('git', ['-C', dir, ...a], { stdio: 'inherit' });
  git('add', 'clips');
  git('commit', '-q', '-m', `TapTalk: record ${done} words (${voice})`);
  console.log('Sending the recordings to GitHub…');
  git('push', '-q');
}
rmSync(dir, { recursive: true, force: true });
console.log(`\nDone: ${done} recorded${failed ? `, ${failed} failed` : ''}. TapTalk devices pick them up the next time they sync.`);

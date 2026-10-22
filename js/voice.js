// Keeping every button's words recorded in the built-in voice.
import * as clips from './clips.js';
import * as ai from './aipics.js';
import { $ } from './util.js';
import { state, homeId, ui } from './state.js';
import { stripItems } from './interaction.js';
import { shareRecordings } from './sharing.js';

export async function showVoiceStatus() {
  const text = $('voiceStatusText');
  const btn = $('voiceDownload');
  btn.hidden = true;
  if (recording) { text.textContent = `Recording new words… ${recording.done} of ${recording.total}`; return; }
  const words = boardWords();
  const n = await clips.count(clips.VOICE, words);
  if (recording) return;
  const left = words.length - n;
  const problem = clips.lastProblem ? ` Last problem: ${clips.lastProblem}.` : '';
  if (!left) { text.textContent = `Coral, a recorded AI voice. All ${n} words ready, offline too.${problem}`; return; }
  text.textContent = `Coral, a recorded AI voice. ${left} new word${left === 1 ? '' : 's'} still to record`
    + (ai.key() ? (recordError ? `: ${recordError}` : '.') : ': they come from the other device, or add the OpenAI key (Pictures tab) to record here.')
    + problem;
  btn.textContent = 'Record now';
  btn.hidden = !ai.key();
}

// Every word or phrase a button says, across the whole board.
export function boardWords() {
  const out = new Set();
  for (const page of Object.values(state.pages)) {
    for (const it of page.items) if (it.type !== 'folder' && (it.say || it.label)) out.add((it.say || it.label).trim());
  }
  return [...out];
}

// Words without a recording (new buttons) are recorded on a device that has
// the OpenAI key, and shared with the board.
let recording = null; // { done, total } while recording
let recordError = '';
export async function recordWords() {
  if (recording || !ai.key() || !navigator.onLine) return;
  const words = boardWords();
  const missing = words.length - await clips.count(clips.VOICE, words);
  if (!missing) return;
  recording = { done: 0, total: missing };
  recordError = '';
  showVoiceStatus();
  const result = await clips.recordAll(clips.VOICE, words, (done) => { recording.done = done; if ($('settings').open) showVoiceStatus(); });
  recording = null;
  if (result.firstError) recordError = result.firstError;
  if (result.done) shareRecordings();
  showVoiceStatus();
  warmPage();
}

// New or changed buttons get recorded a moment after editing (when online).
let recordTimer = 0;
export function recordNewWords() {
  clearTimeout(recordTimer);
  recordTimer = setTimeout(recordWords, 3000);
}

// Get the words on screen ready ahead of time, so taps play instantly.
export function warmPage() {
  const page = state.pages[ui.pageId] || state.pages[homeId()];
  clips.warm(clips.VOICE, [...page.items, ...stripItems().map(({ it }) => it)].filter((it) => !it.hidden && it.type !== 'folder').map((it) => it.say || it.label));
}

export function init() {
  $('voiceDownload').addEventListener('click', () => recordWords());
}

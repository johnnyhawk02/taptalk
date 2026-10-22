// Making a picture for a button with AI (the OpenAI side is in aipics.js).
import { openSheet } from './sheet.js';
import * as ai from './aipics.js';
import { $ } from './util.js';
import { touchSettings, state, save } from './state.js';
import { markChanged } from './sharing.js';
import { draft, photoStatus, usePhoto } from './editor.js';

// One picture at a time: Redo makes another (change the words first if you
// like), Use this sends it to the picture editor with its see-through
// background kept.

let makerRun = null;   // AbortController for the picture being made
let made = null;       // { blob, url } of the picture on show

function openMaker() {
  if (!ai.key()) { photoStatus('To make pictures, add an OpenAI key in ⚙ Settings → Pictures.'); return; }
  $('makerSubject').value = $('edLabel').value.trim();
  showMade(null);
  $('makerStatus').textContent = '';
  openSheet($('maker'));
  if ($('makerSubject').value) makeOne(); else $('makerSubject').focus();
}

function showMade(state, text = '') {
  const slot = $('makerSlot');
  slot.className = `maker-slot t-${draft.type === 'folder' ? 'noun' : draft.type}` + (state === 'loading' ? ' loading' : '');
  slot.replaceChildren();
  if (state === 'ready') {
    const img = document.createElement('img');
    img.src = made.url;
    img.alt = 'The picture made';
    slot.append(img);
  } else if (text) slot.textContent = text;
  $('makerUse').disabled = state !== 'ready';
  $('makerRedo').disabled = state === 'loading';
}

async function makeOne() {
  const text = $('makerSubject').value.trim();
  if (!text) { $('makerStatus').textContent = 'Type what the picture should show.'; $('makerSubject').focus(); return; }
  makerRun?.abort();
  const run = makerRun = new AbortController();
  if (made) URL.revokeObjectURL(made.url);
  made = null;
  const quality = state.settings.aiQuality || 'low';
  showMade('loading');
  $('makerStatus').textContent = `Making a picture (about ${ai.PENCE[quality]}p)…`;
  try {
    const blob = await ai.make(`${state.settings.aiPrompt || ai.DEFAULT_PROMPT}\n${ai.subjectFor(text, draft.type)}`, { quality, signal: run.signal });
    if (run !== makerRun) return;
    made = { blob, url: URL.createObjectURL(blob) };
    showMade('ready');
    $('makerStatus').textContent = 'Happy with it? Not quite right? Change the words if you like, then Redo.';
  } catch (err) {
    if (run.signal.aborted) return;
    showMade('failed', "Couldn't make this one");
    $('makerStatus').textContent = err.message;
  }
}

function useMade() {
  if (!made) return;
  const { blob } = made;
  closeMaker();
  usePhoto(blob, { fit: true, shape: 'square', bg: 'none' });
}

function closeMaker() {
  makerRun?.abort();
  makerRun = null;
  if ($('maker').open) $('maker').close();
}

export function init() {
  $('makePicture').addEventListener('click', openMaker);
  $('makerRedo').addEventListener('click', makeOne);
  $('makerUse').addEventListener('click', useMade);
  $('makerClose').addEventListener('click', closeMaker);
  $('maker').addEventListener('cancel', () => { makerRun?.abort(); makerRun = null; });
  $('makerSubject').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); makeOne(); } });

  $('aiKey').addEventListener('change', (e) => ai.setKey(e.target.value));
  $('aiQuality').addEventListener('change', (e) => { state.settings.aiQuality = e.target.value; touchSettings(); markChanged(); save(); });
  $('aiPrompt').addEventListener('change', (e) => {
    const text = e.target.value.trim();
    // Blank means the original style (stored as '' so it syncs).
    state.settings.aiPrompt = text === ai.DEFAULT_PROMPT ? '' : text;
    e.target.value = text || ai.DEFAULT_PROMPT;
    touchSettings(); markChanged(); save();
  });
  $('aiPromptReset').addEventListener('click', () => {
    state.settings.aiPrompt = '';
    $('aiPrompt').value = ai.DEFAULT_PROMPT;
    touchSettings(); markChanged(); save();
  });
}

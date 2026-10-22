// What a tap does: going to a page and back, choosing a word, the core
// words strip, and holding the page name to start editing.
import { HOME } from './board.js';
import * as sync from './sync.js';
import { $ } from './util.js';
import { state, homeId, ui } from './state.js';
import { stopSpeaking, speak } from './speech.js';
import { grid, render, openVideo, tileFor, sizeRows, renderStrip } from './render.js';
import { dragJustEnded } from './drag.js';
import { setEditing } from './editmode.js';
import { applyPendingBoard } from './sharing.js';
import { openEditor } from './editor.js';

const HOLD_MS = 1500;
let lastTap = 0;

export function goTo(id, { fromNav = false } = {}) {
  const home = homeId();
  const next = state.pages[id] ? id : home;
  if (next === home) ui.trail = [];
  else if (fromNav) ui.trail = [home];
  else if (next !== ui.pageId) ui.trail.push(ui.pageId);
  ui.pageId = next;
  grid.scrollTop = 0;
  render();
}

export function goBack() {
  const prev = ui.trail.pop();
  ui.pageId = prev && state.pages[prev] ? prev : homeId();
  if (ui.pageId === homeId()) ui.trail = [];
  grid.scrollTop = 0;
  render();
}

function flash(el) {
  el.classList.add('pressed');
  setTimeout(() => el.classList.remove('pressed'), 140);
}

// A word or page button was tapped (on the grid, or in the core strip).
function chooseItem(item, tile, { fromStrip = false } = {}) {
  const t = Date.now();
  if (state.settings.debounce && t - lastTap < state.settings.debounce) return;
  lastTap = t;
  flash(tile);

  if (item.type === 'folder') {
    goTo(item.link);
    return;
  }

  ui.sentence.push({ label: item.label, say: item.say || item.label, sym: item.sym, type: item.type });
  renderStrip();
  if (state.settings.speakOnTap) speak(item.say || item.label);
  if (item.video) { openVideo(item.video); return; }
  // Place pages (School, Park…) stay open: you often want several words
  // there; core strip words never jump away from the page either.
  if (!fromStrip && state.settings.autoHome && ui.pageId !== homeId() && !state.pages[ui.pageId].stay) goTo(homeId());
}

// The buttons marked "Show in core strip" (Home's first), on every page.

const coreBar = $('coreBar');

export function stripItems() {
  const ids = [HOME, ...Object.keys(state.pages).filter((id) => id !== HOME)];
  return ids.flatMap((id) => (state.pages[id]?.items || []).filter((it) => it.strip && !it.hidden).map((it) => ({ it, page: id }))).slice(0, 10);
}

export function renderCoreBar() {
  // Not on Home: the core words are already on screen there.
  const items = state.settings.coreStrip && ui.pageId !== HOME ? stripItems() : [];
  coreBar.hidden = !items.length;
  coreBar.style.setProperty('--n', items.length || 1);
  coreBar.replaceChildren(...items.map(({ it, page }) => {
    const b = tileFor(it);
    b.classList.add('core-tile');
    b.dataset.page = page;
    return b;
  }));
}

function findItem(id) {
  return state.pages[ui.pageId]?.items.find((it) => it.id === id);
}

// Press and hold to start editing, so the child can't by accident. The secret
// spot is the page name at the top (the old circle button still works too).
function holdToEdit(el, skip = () => false) {
  let timer = 0;
  el.style.setProperty('--hold-ms', HOLD_MS + 'ms');
  const cancel = () => { clearTimeout(timer); el.classList.remove('holding'); };
  el.addEventListener('pointerdown', (e) => {
    if (ui.editing || skip()) return;
    e.preventDefault();
    el.classList.add('holding');
    // Holding goes straight into editing; ⚙ Settings in the edit bar has the rest.
    timer = setTimeout(() => { cancel(); setEditing(true); }, HOLD_MS);
  });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => el.addEventListener(ev, cancel));
  el.addEventListener('contextmenu', (e) => e.preventDefault());
}
// For now one tap on the page name starts editing on Robyn's linked devices.
// Everyone else (and Robyn's devices, once this is false) presses and holds.
const TITLE_SINGLE_TAP = true;
const singleTapTitle = () => TITLE_SINGLE_TAP && sync.config().mode !== 'off';

export function init() {
  grid.addEventListener('click', (e) => {
    const tile = e.target.closest('.tile');
    if (!tile) return;

    if (tile.dataset.action === 'back') { goBack(); return; }
    if (tile.dataset.action === 'add') { openEditor(null); return; }

    if (dragJustEnded) return;
    const item = findItem(tile.dataset.id);
    if (!item) return;
    if (ui.editing) { openEditor(item); return; }
    chooseItem(item, tile);
  });

  coreBar.addEventListener('click', (e) => {
    const tile = e.target.closest('.tile');
    if (!tile) return;
    const item = state.pages[tile.dataset.page]?.items.find((it) => it.id === tile.dataset.id);
    if (!item) return;
    if (ui.editing) { openEditor(item, false, tile.dataset.page); return; }
    chooseItem(item, tile, { fromStrip: true });
  });

  $('strip').addEventListener('click', async () => {
    if (!ui.sentence.length) return;
    const strip = $('strip');
    strip.classList.add('speaking');
    await speak(ui.sentence.map((w) => w.say));
    strip.classList.remove('speaking');
  });

  $('backspaceBtn').addEventListener('click', () => { ui.sentence.pop(); renderStrip(); });
  $('clearBtn').addEventListener('click', () => { ui.sentence = []; renderStrip(); stopSpeaking(); applyPendingBoard(); });
  $('homeBtn').addEventListener('click', () => goTo(homeId()));
  $('pageTitle').addEventListener('click', () => { if (!ui.editing && singleTapTitle()) setEditing(true); });
  holdToEdit($('pageTitle'), singleTapTitle);
  holdToEdit($('lockBtn'));

  // Block pinch-zoom and double-tap zoom on iPad Safari, which ignores user-scalable.
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });

  new ResizeObserver(sizeRows).observe(grid);
}

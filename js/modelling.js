// Modelling: a grown-up taps words to show Robyn how to say something. The
// taps speak and the button lights up, but nothing goes into her sentence
// (or anything that keeps her words), so what she says stays her own.
import { $ } from './util.js';
import { ui } from './state.js';
import { render } from './render.js';

// If the iPad is handed back still modelling, it stops by itself.
const MODEL_IDLE_MS = 5 * 60_000;
let idleTimer = 0;

export function setModelling(on) {
  ui.modelling = on;
  if (on) ui.editing = false; // the two never run together
  clearTimeout(idleTimer);
  if (on) armIdle();
  render();
}

function armIdle() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => setModelling(false), MODEL_IDLE_MS);
}

export function init() {
  ['pointerdown', 'keydown'].forEach((ev) => document.addEventListener(ev, () => { if (ui.modelling) armIdle(); }, true));
  $('startModelling').addEventListener('click', () => { $('settings').close(); setModelling(true); });
  $('modelFromBanner').addEventListener('click', () => setModelling(true));
  $('doneModelling').addEventListener('click', () => setModelling(false));
}

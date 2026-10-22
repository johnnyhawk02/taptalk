// The Undo bar, and recently deleted buttons.
import { HOME } from './board.js';
import { $, now } from './util.js';
import { state, save } from './state.js';
import { render } from './render.js';
import { markChanged, shareIfUnsent } from './sharing.js';

// No "are you sure?" pop-ups: every change can be undone straight away, and
// deleted buttons can be restored later from Settings.

const TRASH_KEY = 'taptalk.trash';
const TRASH_MAX = 30;
let undoAction = null;
let undoTimer = 0;

export function readTrash() {
  try { return JSON.parse(localStorage.getItem(TRASH_KEY)) || []; } catch { return []; }
}
export function writeTrash(list) {
  try { localStorage.setItem(TRASH_KEY, JSON.stringify(list.slice(0, TRASH_MAX))); } catch { /* full: not vital */ }
}

export function offerUndo(text, undo) {
  undoAction = undo;
  // Show it on top of any open pop-up (e.g. the Page manager), not behind it.
  // Checked again just after, as a pop-up being saved (the editor) closes then.
  const place = () => {
    const host = [...document.querySelectorAll('dialog[open]')].pop() || $('app');
    if ($('undoBar').parentElement !== host) host.append($('undoBar'));
  };
  place();
  setTimeout(place, 0);
  $('undoText').textContent = text;
  $('undoBtn').hidden = !undo; // some notes are just a heads-up
  $('undoBar').hidden = false;
  clearTimeout(undoTimer);
  undoTimer = setTimeout(() => { $('undoBar').hidden = true; undoAction = null; }, 8000);
}

// After an undo or restore: save, show it, and share it like any edit.
export function afterRestore() {
  markChanged();
  save();
  render();
  shareIfUnsent();
}

// Puts a deleted button back. Marking it as just edited makes it win over
// its deletion on the other device too.
export function restoreButton(entry) {
  const page = state.pages[entry.pageId] || state.pages[HOME];
  if (!page.items.some((it) => it.id === entry.item.id)) {
    page.items.splice(Math.min(entry.index, page.items.length), 0, { ...entry.item, updatedAt: now() });
  }
  writeTrash(readTrash().filter((t) => t.item.id !== entry.item.id));
  afterRestore();
}

export function init() {
  $('undoBtn').addEventListener('click', () => {
    const undo = undoAction;
    undoAction = null;
    $('undoBar').hidden = true;
    undo?.();
  });
}

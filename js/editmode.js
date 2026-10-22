// Turning editing on and off, and off again after 3 minutes untouched.
import * as sync from './sync.js';
import { $ } from './util.js';
import { ui } from './state.js';
import { render, COMPACT_KEY, compactPref } from './render.js';
import { openSettings } from './settings.js';
import { applyPendingBoard, shareIfUnsent } from './sharing.js';
import { clearClip } from './clipboard.js';

// The editing computer remembers edit mode across page reloads.
export const EDIT_KEY = 'taptalk.editing';
export function setEditing(on) {
  ui.editing = on;
  try { sessionStorage.setItem(EDIT_KEY, on ? '1' : ''); } catch { /* not important */ }
  if (!on) clearClip();
  render();
  if (on) armEditTimeout(); else { clearTimeout(editIdleTimer); applyPendingBoard(); shareIfUnsent(); }
}

// If a grown-up hands the iPad back still in edit mode, it switches off by
// itself after a few minutes untouched (as if they'd tapped Done).
const EDIT_IDLE_MS = 3 * 60_000;
let editIdleTimer = 0;
function armEditTimeout() {
  clearTimeout(editIdleTimer);
  if (!ui.editing || sync.config().mode === 'send') return; // not on the editing computer
  editIdleTimer = setTimeout(() => {
    if (document.querySelector('dialog[open]')) armEditTimeout(); // mid-edit: wait
    else setEditing(false);
  }, EDIT_IDLE_MS);
}

export function init() {
  ['pointerdown', 'keydown'].forEach((ev) => document.addEventListener(ev, () => { if (ui.editing) armEditTimeout(); }, true));

  $('startEditing').addEventListener('click', () => { $('settings').close(); setEditing(true); });
  $('doneEditing').addEventListener('click', () => setEditing(false));
  $('settingsFromBanner').addEventListener('click', openSettings);

  // On the editing computer (never seen by Robyn) there's an Edit button in the
  // top bar and a keyboard shortcut: E to start or finish, Esc to finish.
  $('editToggle').addEventListener('click', () => setEditing(!ui.editing));
  $('compactToggle').addEventListener('click', () => {
    try { localStorage.setItem(COMPACT_KEY, compactPref() ? 'off' : 'on'); } catch { /* not important */ }
    render();
  });
  document.addEventListener('keydown', (e) => {
    if (sync.config().mode !== 'send' || e.metaKey || e.ctrlKey || e.altKey) return;
    if (document.querySelector('dialog[open]') || e.target.closest?.('input, textarea, select, [contenteditable]')) return;
    if (e.key === 'e' || e.key === 'E') { e.preventDefault(); setEditing(!ui.editing); }
    else if (e.key === 'Escape' && ui.editing) setEditing(false);
  });
}

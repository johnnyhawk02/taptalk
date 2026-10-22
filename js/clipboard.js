// Copying, cutting and pasting buttons.
import { $, uid, now } from './util.js';
import { state, save, ui } from './state.js';
import { setSymbol } from './symbols.js';
import { render } from './render.js';
import { markChanged } from './sharing.js';
import { offerUndo, afterRestore } from './undo.js';

// Copy or Cut in the button editor; then, on any page, tap Paste here in the
// bar at the bottom (or press Cmd/Ctrl+V on the computer). Copy can be pasted many times; Cut
// moves the button when it's pasted. Kept until editing ends.

const CLIP_KEY = 'taptalk.clip';

export function readClip() {
  try { return JSON.parse(sessionStorage.getItem(CLIP_KEY)); } catch { return null; }
}
export function clearClip() {
  try { sessionStorage.removeItem(CLIP_KEY); } catch { /* not important */ }
}
export function setClip(clip) {
  try { sessionStorage.setItem(CLIP_KEY, JSON.stringify(clip)); } catch { /* not important */ }
  render();
  offerUndo(`Now go to a page and tap ${clip.cut ? 'Move here' : 'Paste here'}`, null);
}

// The bar at the bottom while a copied or cut button waits to be pasted.
export function showClipBar(clip) {
  $('clipBar').hidden = !clip;
  document.body.classList.toggle('has-clip', Boolean(clip));
  if (!clip) return;
  const img = $('clipImg');
  if (clip.item.sym) { img.hidden = false; setSymbol(img, clip.item.sym); } else img.hidden = true;
  $('clipText').textContent = `${clip.cut ? 'Moving' : 'Copied'} “${clip.item.label}”`;
  $('clipPaste').textContent = clip.cut ? 'Move here' : 'Paste here';
}

function pasteClip() {
  const clip = readClip();
  const page = state.pages[ui.pageId];
  if (!clip || !page) return;
  const at = now();
  const source = state.pages[clip.page];
  const from = clip.cut && source ? source.items.findIndex((it) => it.id === clip.item.id) : -1;
  if (clip.cut && from < 0) { clearClip(); render(); return; } // already gone
  const original = from >= 0 ? source.items[from] : null;
  // A pasted button is a new one, so both copies can be changed separately.
  const copy = { ...(original || clip.item), id: uid(), updatedAt: at };
  if (!clip.cut) delete copy.strip; // the core strip keeps just the original
  if (original) {
    source.items.splice(from, 1);
    source.orderAt = at;
    state.deleted[original.id] = at;
    clearClip();
  }
  page.items.push(copy);
  page.orderAt = at;
  markChanged();
  save();
  render();
  const where = ui.pageId;
  offerUndo(original ? `Moved “${copy.label}” here` : `Pasted “${copy.label}”`, () => {
    const list = state.pages[where]?.items;
    const i = list ? list.findIndex((it) => it.id === copy.id) : -1;
    if (i >= 0) { list.splice(i, 1); state.deleted[copy.id] = now(); }
    if (original && state.pages[clip.page]) {
      state.pages[clip.page].items.splice(Math.min(from, state.pages[clip.page].items.length), 0, { ...original, updatedAt: now() });
      state.pages[clip.page].orderAt = now();
    }
    afterRestore();
  });
}

export function init() {
  $('clipPaste').addEventListener('click', () => pasteClip());
  $('clipClear').addEventListener('click', () => { clearClip(); render(); });

  document.addEventListener('keydown', (e) => {
    if (!ui.editing || !(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'v') return;
    if (document.querySelector('dialog[open]') || /input|textarea|select/i.test(e.target.tagName) || !readClip()) return;
    e.preventDefault();
    pasteClip();
  });
}

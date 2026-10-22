// The button editor: words, colour, page link and picture (symbols, photos,
// pasting, Google Photos), moving, deleting and saving a button.
import { HOME } from './board.js';
import * as photos from './photos.js';
import * as gphotos from './gphotos.js';
import * as sync from './sync.js';
import { editPicture } from './cropper.js';
import { openSheet } from './sheet.js';
import { $, uid, now } from './util.js';
import { state, save, ui } from './state.js';
import { render, videoId, videoUrl, tileFor } from './render.js';
import { goTo } from './interaction.js';
import { markChanged } from './sharing.js';
import { setClip } from './clipboard.js';
import { readTrash, writeTrash, offerUndo, afterRestore, restoreButton } from './undo.js';
import { openPicker } from './picker.js';

const TYPES = [
  ['pron', 'People'], ['verb', 'Doing'], ['desc', 'Describing'], ['noun', 'Things'],
  ['social', 'Social'], ['neg', 'No / stop'], ['q', 'Question'], ['folder', 'Page'],
];

export let draft = null;     // copy of item being edited
let draftIsNew = false;

let editPage = HOME; // the page the button being edited lives on

export function openEditor(item, isNew = !item, onPage = ui.pageId) {
  editPage = state.pages[onPage] ? onPage : ui.pageId;
  draftIsNew = isNew;
  draft = item ? { ...item } : { id: uid(), label: '', say: '', sym: '', type: 'noun', link: '', hidden: false };
  $('editorTitle').textContent = draftIsNew ? 'Add button' : 'Edit button';
  photoStatus('');
  $('edLabel').value = draft.label;
  $('edSay').value = draft.say;
  $('edVideo').value = draft.video ? videoUrl(draft.video) : '';
  $('videoRow').hidden = draft.type === 'folder';
  $('edHidden').checked = draft.hidden;
  $('edStrip').checked = Boolean(draft.strip);
  $('deleteBtn').hidden = draftIsNew;
  $('clipCopy').hidden = draftIsNew;
  $('clipCut').hidden = draftIsNew;
  $('moveRow').hidden = draftIsNew;
  fillLinkSelect();
  renderTypePicker();
  renderPreview();
  openSheet($('editor'));
}

function fillLinkSelect() {
  const sel = $('edLink');
  const opts = Object.entries(state.pages)
    .filter(([id]) => id !== HOME)
    .map(([id, p]) => new Option(p.name, id, false, id === draft.link));
  sel.replaceChildren(...opts, new Option('➕ New page', '__new', false, !draft.link));
  $('folderRow').hidden = draft.type !== 'folder';
  let open = $('openPageBtn');
  if (!open) {
    open = document.createElement('button');
    open.type = 'button';
    open.id = 'openPageBtn';
    open.className = 'pill';
    open.textContent = 'Open page';
    open.addEventListener('click', () => { $('editor').close(); goTo(draft.link); });
    $('folderRow').append(open);
  }
  open.hidden = !draft.link || draftIsNew;
}

function renderTypePicker() {
  $('typePicker').replaceChildren(...TYPES.map(([t, name]) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `type-chip t-${t}`;
    b.textContent = name;
    b.setAttribute('aria-pressed', String(draft.type === t));
    b.addEventListener('click', () => {
      draft.type = t;
      renderTypePicker();
      renderPreview();
      $('folderRow').hidden = t !== 'folder';
      $('videoRow').hidden = t === 'folder';
    });
    return b;
  }));
}

export function renderPreview() {
  draft.label = $('edLabel').value;
  $('editPicture').hidden = !draft.sym?.startsWith('u:');
  const t = tileFor({ ...draft, label: draft.label || 'word', hidden: false });
  t.classList.add('preview-tile');
  t.disabled = true;
  $('previewTile').replaceWith(t);
  t.id = 'previewTile';
}

export const photoStatus = (text) => { $('photoStatus').textContent = text; };

// New photos open in the picture editor first, so they fit the button neatly.
export async function usePhoto(blob, cropOpts) {
  if (!blob) return;
  try {
    const original = await photos.shrink(blob, 1400);
    await storeEdited(original, await editPicture(original, cropOpts));
  } catch (err) {
    photoStatus('Could not use that photo: ' + err.message);
  }
}

// Saves an edited picture (and the photo it came from, for re-editing) as a
// new photo, so buttons already using the old one are unaffected.
async function storeEdited(original, edited) {
  if (!edited) { photoStatus('Picture not changed.'); return; }
  const id = await photos.addBlob(edited);
  await photos.put(id + photos.ORIGINAL, original);
  draft.sym = 'u:' + id;
  renderPreview();
  photoStatus('Picture ready. Tap Save to keep it.');
}

const LINK_ONLY = 'That copied a link, not the picture itself. Press and hold the picture and tap "Copy" '
  + '(or save it to your photos and use "Take or pick photo").';

// Copying from a web page often puts HTML or a web address on the clipboard
// instead of the picture. Try to fetch the picture it points to; many sites
// don't allow that, in which case we explain instead.
async function imageFromSource(src) {
  if (!src) return null;
  try {
    const res = await fetch(src, { mode: 'cors' });
    const blob = res.ok ? await res.blob() : null;
    return blob?.type.startsWith('image/') ? blob : null;
  } catch {
    return null;
  }
}

function imgSrcFromHtml(html) {
  return new DOMParser().parseFromString(html, 'text/html').querySelector('img')?.getAttribute('src') || '';
}

const looksLikeUrl = (text) => /^(https?:|data:image\/)\S+$/i.test(text.trim());

// Works for both the Paste button (async clipboard) and paste events.
async function pasteFrom({ files = [], html = '', text = '' }) {
  const file = files.find((f) => f.type.startsWith('image/'));
  if (file) { await usePhoto(file); return; }
  const src = imgSrcFromHtml(html) || (looksLikeUrl(text) ? text.trim() : '');
  if (src) {
    photoStatus('Getting the picture…');
    const blob = await imageFromSource(src);
    if (blob) await usePhoto(blob); else photoStatus(LINK_ONLY);
    return;
  }
  photoStatus(text || html
    ? 'That was text, not a photo. Copy the photo itself and try again.'
    : 'There is no photo to paste. Copy a photo first (in Google Photos: Share → Copy).');
}

// Straight from Google Photos (only when js/config.js is filled in).
// Google Photos only works for accounts the Google project lets in, so it shows
// only on devices linked to a shared board (the developer's own family).
export function googlePhotosReady() { return gphotos.enabled && sync.config().mode !== 'off'; }

export async function pickFromGoogle() {
  const dlg = $('gpDialog');
  const ctrl = new AbortController();
  const open = $('gpOpen');
  open.hidden = true;
  $('gpCancel').onclick = () => { ctrl.abort(); dlg.close(); };
  // Typing in the editor may not have been saved into the draft yet.
  draft.label = $('edLabel').value;
  draft.say = $('edSay').value;
  draft.hidden = $('edHidden').checked;
  openSheet(dlg);
  try {
    const blob = await gphotos.pick({
      signal: ctrl.signal,
      resume: { pageId: ui.pageId, draft, draftIsNew },
      status: (text) => { $('gpStatus').textContent = text; },
      ready: (uri) => { open.href = uri; open.hidden = false; },
    });
    if (blob) await usePhoto(blob);
    dlg.close();
  } catch (err) {
    open.hidden = true;
    $('gpStatus').textContent = 'Something went wrong: ' + err.message;
  }
}

const editorEl = $('editor');

// The paste box only exists to get the device's own Paste menu; never let
// anything be typed or dropped into it.
const PASTE_BOX_HTML = $('pasteBox').innerHTML;

function moveItem(dir) {
  const items = state.pages[editPage].items;
  const i = items.findIndex((it) => it.id === draft.id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= items.length) return;
  [items[i], items[j]] = [items[j], items[i]];
  state.pages[editPage].orderAt = now();
  markChanged();
  save();
  render();
}

export function init() {
  $('edLabel').addEventListener('input', renderPreview);

  $('pickSymbol').addEventListener('click', () => openPicker($('edLabel').value));

  $('editPicture').addEventListener('click', async () => {
    const id = draft.sym?.startsWith('u:') && draft.sym.slice(2);
    if (!id) return;
    const original = (await photos.get(id + photos.ORIGINAL)) || (await photos.get(id));
    if (!original) { photoStatus('That picture is not on this device.'); return; }
    try {
      await storeEdited(original, await editPicture(original));
    } catch (err) {
      photoStatus('Could not edit that picture: ' + err.message);
    }
  });

  $('photoFile').addEventListener('change', (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    usePhoto(file);
  });

  // Google Photos (and most other apps) can copy a photo to the clipboard.
  // On iPad a small "Paste" bubble appears first; it must be tapped.
  $('pastePhoto').addEventListener('click', async () => {
    if (!navigator.clipboard?.read) {
      photoStatus('This browser can\'t paste with the button. Press and hold the box below, then tap Paste.');
      return;
    }
    photoStatus('Tap "Paste" if a bubble appears…');
    try {
      const files = [];
      let html = '';
      let text = '';
      for (const item of await navigator.clipboard.read()) {
        const type = item.types.find((t) => t.startsWith('image/'));
        if (type) files.push(new File([await item.getType(type)], 'pasted', { type }));
        else if (item.types.includes('text/html')) html = await (await item.getType('text/html')).text();
        else if (item.types.includes('text/plain')) text = await (await item.getType('text/plain')).text();
      }
      await pasteFrom({ files, html, text });
    } catch (err) {
      photoStatus(err.name === 'NotAllowedError'
        ? 'The photo couldn\'t be read from the clipboard. Press and hold the box below, then tap Paste.'
        : 'Could not paste: ' + err.message);
    }
  });
  $('googlePhotos').hidden = !googlePhotosReady();
  $('googlePhotos').addEventListener('click', pickFromGoogle);
  document.addEventListener('paste', (e) => {
    if (!editorEl.open) return;
    const cd = e.clipboardData;
    const inBox = e.target.closest?.('#pasteBox');
    const files = [...(cd?.files || [])];
    // Leave normal text pasting into the word fields alone.
    if (!inBox && !files.some((f) => f.type.startsWith('image/'))) return;
    e.preventDefault();
    if ($('picker').open) $('picker').close();
    pasteFrom({ files, html: cd?.getData('text/html') || '', text: cd?.getData('text/plain') || '' });
  });

  // ⌘V / Ctrl+V anywhere in the button editor: some browsers only fire a paste
  // event inside something editable, so steer it into the paste box first.
  document.addEventListener('keydown', (e) => {
    if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'v' || !editorEl.open || $('picker').open || $('cropper').open) return;
    if (e.target.closest?.('input, textarea, select, [contenteditable]')) return;
    $('pasteBox').focus();
  });
  $('pasteBox').addEventListener('input', () => { $('pasteBox').innerHTML = PASTE_BOX_HTML; });
  $('pasteBox').addEventListener('beforeinput', (e) => { if (e.inputType !== 'insertFromPaste') e.preventDefault(); });
  editorEl.addEventListener('dragover', (e) => e.preventDefault());
  editorEl.addEventListener('drop', (e) => {
    const file = [...(e.dataTransfer?.files || [])].find((f) => f.type.startsWith('image/'));
    if (file) { e.preventDefault(); usePhoto(file); }
  });

  $('moveBack').addEventListener('click', () => moveItem(-1));
  $('moveFwd').addEventListener('click', () => moveItem(1));

  $('deleteBtn').addEventListener('click', () => {
    const page = state.pages[editPage];
    const index = page.items.findIndex((it) => it.id === draft.id);
    if (index < 0) return;
    const [item] = page.items.splice(index, 1);
    const entry = { item, pageId: editPage, index, at: now() };
    state.deleted[item.id] = entry.at;
    writeTrash([entry, ...readTrash().filter((t) => t.item.id !== item.id)]);
    markChanged();
    save();
    $('editor').close();
    render();
    offerUndo(`Deleted “${item.label}”`, () => restoreButton(entry));
  });

  $('editorForm').addEventListener('submit', (e) => {
    const act = e.submitter?.value; // save, or copy / cut (which save first)
    if (!['save', 'copy', 'cut'].includes(act)) return;
    draft.label = $('edLabel').value.trim();
    draft.say = $('edSay').value.trim();
    draft.hidden = $('edHidden').checked;
    if (!draft.label) { e.preventDefault(); return; }
    const link = $('edVideo').value.trim();
    const vid = draft.type === 'folder' ? '' : videoId(link);
    if (link && !vid && draft.type !== 'folder') {
      e.preventDefault();
      photoStatus("That doesn't look like a YouTube link. Copy it from YouTube's Share button.");
      $('edVideo').focus();
      return;
    }
    if (vid) draft.video = vid; else delete draft.video;

    if (draft.type === 'folder') {
      let link = $('edLink').value;
      if (link === '__new' || !state.pages[link]) {
        link = 'p' + uid();
        state.pages[link] = { name: draft.label, items: [], updatedAt: now() };
      }
      draft.link = link;
    } else {
      draft.link = '';
    }

    draft.strip = $('edStrip').checked || undefined;
    draft.updatedAt = now();
    const items = state.pages[editPage].items;
    const i = items.findIndex((it) => it.id === draft.id);
    const before = i >= 0 ? { ...items[i] } : null;
    const where = editPage;
    const saved = draft;
    const changed = !before || JSON.stringify({ ...before, updatedAt: 0 }) !== JSON.stringify({ ...saved, updatedAt: 0 });
    if (changed) {
      if (i >= 0) items[i] = draft; else items.push(draft);
      markChanged();
      save();
    }
    if (act !== 'save') { setClip({ item: changed ? saved : before, page: where, cut: act === 'cut' }); return; }
    render();
    if (!changed) return;
    offerUndo(before ? `Changed “${before.label}”` : `Added “${saved.label}”`, () => {
      const list = state.pages[where]?.items;
      const at = list ? list.findIndex((it) => it.id === saved.id) : -1;
      if (at < 0) return;
      if (before) list[at] = { ...before, updatedAt: now() };
      else { list.splice(at, 1); state.deleted[saved.id] = now(); }
      afterRestore();
    });
  });
}

import { DEFAULT_PAGES } from './board.js';
import * as photos from './photos.js';
import * as gphotos from './gphotos.js';
import { TO_ARASAAC } from './migrate.js';

const STORE_KEY = 'taptalk.v1';
const STATE_VERSION = 4; // 2 = ARASAAC pictures, 3 = place pages, 4 = Fun page
const DEFAULT_SKIN = '#ffeec8';
const SKIN_TONES = ['#ffeec8', '#f6d2a9', '#e0ac7e', '#c08654', '#8d5a33', '#5c3a21'];
// The ARASAAC server re-draws pictures in these skin tones (names are theirs).
const ARASAAC_SKIN = { '#f6d2a9': 'assian', '#e0ac7e': 'mulatto', '#c08654': 'aztec', '#8d5a33': 'black', '#5c3a21': 'black' };
const HOLD_MS = 1500;
const HOME = 'home';

const TYPES = [
  ['pron', 'People'], ['verb', 'Doing'], ['desc', 'Describing'], ['noun', 'Things'],
  ['social', 'Social'], ['neg', 'No / stop'], ['q', 'Question'], ['folder', 'Page'],
];

const DEFAULT_SETTINGS = {
  cols: 6,
  labels: true,
  autoHome: true,
  debounce: 0,
  speakOnTap: true,
  voice: '',
  rate: 0.9,
  pitch: 1.1,
  skin: DEFAULT_SKIN,
};

const $ = (id) => document.getElementById(id);
const uid = () => 'i' + Math.random().toString(36).slice(2, 10);

// ---------- State ----------

function buildDefaultPages() {
  const pages = {};
  for (const [pageId, page] of Object.entries(DEFAULT_PAGES)) {
    pages[pageId] = {
      name: page.name,
      ...(page.stay && { stay: true }),
      items: page.items.map(([label, sym, type, extra = {}]) => ({
        id: uid(), label, sym, type, say: extra.say || '', link: extra.link || '', hidden: false,
      })),
    };
  }
  return pages;
}

function loadState() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY));
    if (raw && raw.pages && raw.pages[HOME]) {
      upgradePages(raw.pages, raw.version || 1);
      return { pages: raw.pages, settings: { ...DEFAULT_SETTINGS, ...raw.settings }, upgraded: (raw.version || 1) < STATE_VERSION };
    }
  } catch { /* fall through to defaults */ }
  return { pages: buildDefaultPages(), settings: { ...DEFAULT_SETTINGS } };
}

// Older boards (and backups) used Mulberry pictures. Swap the ones nobody has
// changed for their ARASAAC versions; leave edited buttons alone.
function upgradePages(pages, version) {
  if (version < 2) {
    for (const page of Object.values(pages)) {
      for (const item of page.items) {
        const to = TO_ARASAAC[item.label + '|' + item.sym];
        if (to) item.sym = to;
      }
    }
  }
  if (version < 4) addMissingPages(pages);
}

// New starting pages (e.g. School, Bedtime) get added to saved boards, with
// their buttons put at the front of the page that opens them.
function addMissingPages(pages) {
  const defaults = buildDefaultPages();
  const added = Object.keys(defaults).filter((id) => !pages[id]);
  for (const id of added) pages[id] = defaults[id];
  for (const [parentId, parent] of Object.entries(defaults)) {
    if (!pages[parentId] || added.includes(parentId)) continue;
    const links = parent.items.filter((it) => it.type === 'folder' && added.includes(it.link)
      && !pages[parentId].items.some((mine) => mine.link === it.link));
    pages[parentId].items.unshift(...links);
  }
}

const state = loadState();
let pageId = HOME;
let editing = false;
let sentence = []; // [{label, say, sym, type}]
let lastTap = 0;

function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ version: STATE_VERSION, pages: state.pages, settings: state.settings }));
  } catch (err) {
    alert('Could not save changes: ' + err.message);
  }
}
if (state.upgraded) { delete state.upgraded; save(); }

// ---------- Symbols ----------

const skinCache = new Map(); // "tone|url" -> blob URL

function rawSymbolUrl(sym) {
  const [kind, name] = splitSym(sym);
  if (kind === 'm') return 'symbols/mulberry/' + encodeURIComponent(name) + '.svg';
  if (kind === 'c') return 'symbols/custom/' + encodeURIComponent(name) + '.svg';
  if (kind === 'a') return 'symbols/arasaac/' + encodeURIComponent(name) + '.png';
  return '';
}

function arasaacToned(id, skin) {
  return `https://api.arasaac.org/v1/pictograms/${encodeURIComponent(id)}?skin=${skin}&resolution=500&download=false`;
}

function splitSym(sym = '') {
  const i = sym.indexOf(':');
  return i < 0 ? ['', ''] : [sym.slice(0, i), sym.slice(i + 1)];
}

// Sets an <img> to show a symbol, re-colouring skin when a tone is chosen.
async function setSymbol(img, sym) {
  img.alt = '';
  img.decoding = 'async';
  const [kind, name] = splitSym(sym);
  if (!kind) { img.removeAttribute('src'); return; }
  if (kind === 'u') {
    img.src = (await photos.url(name)) || '';
    return;
  }
  const url = rawSymbolUrl(sym);
  const tone = state.settings.skin;
  if (!tone || tone === DEFAULT_SKIN) { img.src = url; return; }

  const key = tone + '|' + url;
  if (!skinCache.has(key)) skinCache.set(key, tonedUrl(kind, name, url, tone));
  const want = key;
  img.dataset.want = want;
  const src = await skinCache.get(key);
  if (img.dataset.want === want) img.src = src;
}

// Blob URL of a symbol in another skin tone, or the plain URL if that fails
// (e.g. an ARASAAC picture offline before it was ever fetched in this tone).
async function tonedUrl(kind, name, url, tone) {
  try {
    if (kind === 'a') {
      const res = await fetch(arasaacToned(name, ARASAAC_SKIN[tone] || 'white'));
      if (!res.ok) throw new Error(res.status);
      return URL.createObjectURL(await res.blob());
    }
    const svg = await fetch(url).then((r) => r.text());
    return URL.createObjectURL(new Blob([svg.replace(/#ffeec8/gi, tone)], { type: 'image/svg+xml' }));
  } catch {
    return url;
  }
}

// After a skin tone change, fetch every ARASAAC picture on the board in that
// tone so the service worker has them for offline use.
function prefetchToned() {
  const tone = state.settings.skin;
  if (!ARASAAC_SKIN[tone] || !navigator.onLine) return;
  const ids = new Set();
  for (const page of Object.values(state.pages)) {
    for (const item of page.items) if (item.sym?.startsWith('a:')) ids.add(item.sym.slice(2));
  }
  let i = 0;
  const list = [...ids];
  const next = () => {
    if (i >= list.length || state.settings.skin !== tone) return;
    fetch(arasaacToned(list[i++], ARASAAC_SKIN[tone])).catch(() => {}).finally(next);
  };
  for (let k = 0; k < 4; k++) next();
}

// ---------- Speech ----------

let voices = [];

function loadVoices() {
  if (!('speechSynthesis' in window)) return;
  voices = speechSynthesis.getVoices().filter((v) => v.lang.startsWith('en'));
  voices.sort((a, b) => scoreVoice(b) - scoreVoice(a) || a.name.localeCompare(b.name));
  fillVoiceSelect();
}

function scoreVoice(v) {
  let s = 0;
  if (v.lang === 'en-GB' || v.lang === 'en_GB') s += 4;
  if (v.localService) s += 2;
  if (/enhanced|premium|natural/i.test(v.name)) s += 1;
  return s;
}

function currentVoice() {
  return voices.find((v) => v.voiceURI === state.settings.voice) || voices[0] || null;
}

function speak(text) {
  if (!text || !('speechSynthesis' in window)) return Promise.resolve();
  speechSynthesis.cancel();
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    const v = currentVoice();
    if (v) { u.voice = v; u.lang = v.lang; } else { u.lang = 'en-GB'; }
    u.rate = state.settings.rate;
    u.pitch = state.settings.pitch;
    u.onend = u.onerror = () => resolve();
    speechSynthesis.speak(u);
  });
}

// ---------- Rendering ----------

const grid = $('grid');

function render() {
  const page = state.pages[pageId] || state.pages[HOME];
  document.documentElement.classList.toggle('no-labels', !state.settings.labels);
  document.body.classList.toggle('editing', editing);
  $('editBanner').hidden = !editing;
  $('pageTitle').textContent = page.name;
  grid.style.setProperty('--cols', state.settings.cols);

  const frag = document.createDocumentFragment();
  if (pageId !== HOME) frag.append(backTile());
  // Hidden buttons keep their space so nothing else moves (motor planning).
  for (const item of page.items) frag.append(item.hidden && !editing ? gapTile() : tileFor(item));
  if (editing) frag.append(addTile());

  grid.replaceChildren(frag);
  sizeRows();
}

function tileFor(item) {
  const b = document.createElement('button');
  b.className = `tile t-${item.type}` + (item.type === 'folder' ? ' folder' : '') + (item.hidden ? ' hidden-item' : '');
  b.dataset.id = item.id;
  b.setAttribute('aria-label', item.type === 'folder' ? `${item.label} page` : item.label);
  const img = document.createElement('img');
  if (item.sym) setSymbol(img, item.sym); else img.hidden = true;
  const label = document.createElement('span');
  label.className = 'label';
  label.textContent = item.label;
  b.append(img, label);
  return b;
}

function gapTile() {
  const d = document.createElement('div');
  d.className = 'tile-gap';
  d.setAttribute('aria-hidden', 'true');
  return d;
}

function backTile() {
  const b = document.createElement('button');
  b.className = 'tile back';
  b.dataset.action = 'back';
  b.setAttribute('aria-label', 'Back');
  b.innerHTML = '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M30 10 16 24l14 14"/></svg><span class="label">back</span>';
  return b;
}

function addTile() {
  const b = document.createElement('button');
  b.className = 'tile add-tile';
  b.dataset.action = 'add';
  b.innerHTML = '<span class="plus">+</span><span class="label">Add button</span>';
  return b;
}

function sizeRows() {
  const count = grid.children.length;
  const cols = state.settings.cols;
  const rows = Math.max(1, Math.ceil(count / cols));
  const gap = parseFloat(getComputedStyle(grid).rowGap) || 10;
  const avail = grid.clientHeight;
  const colW = (grid.clientWidth - gap * (cols - 1)) / cols;
  // Fill the screen when everything fits; otherwise keep buttons big enough
  // to hit and let the page scroll.
  const fit = (avail - gap * (rows - 1)) / rows;
  const min = Math.min(colW * 0.8, 110);
  const rowH = Math.max(min, Math.min(fit, colW * 1.15));
  grid.style.setProperty('--row-h', Math.floor(rowH) + 'px');
}

function renderStrip() {
  const wrap = $('stripWords');
  wrap.replaceChildren(...sentence.map((w) => {
    const d = document.createElement('div');
    d.className = `strip-word t-${w.type}`;
    const img = document.createElement('img');
    setSymbol(img, w.sym);
    const s = document.createElement('span');
    s.textContent = w.label;
    d.append(img, s);
    return d;
  }));
  const strip = $('strip');
  strip.scrollLeft = strip.scrollWidth;
}

// ---------- Interaction ----------

// Pages opened from other pages remember the way back, so "back" on School
// returns to Places rather than Home.
let trail = [];

function goTo(id) {
  const next = state.pages[id] ? id : HOME;
  if (next === HOME) trail = [];
  else if (next !== pageId) trail.push(pageId);
  pageId = next;
  grid.scrollTop = 0;
  render();
}

function goBack() {
  const prev = trail.pop();
  pageId = prev && state.pages[prev] ? prev : HOME;
  if (pageId === HOME) trail = [];
  grid.scrollTop = 0;
  render();
}

function flash(el) {
  el.classList.add('pressed');
  setTimeout(() => el.classList.remove('pressed'), 140);
}

grid.addEventListener('click', (e) => {
  const tile = e.target.closest('.tile');
  if (!tile) return;

  if (tile.dataset.action === 'back') { goBack(); return; }
  if (tile.dataset.action === 'add') { openEditor(null); return; }

  const item = findItem(tile.dataset.id);
  if (!item) return;

  if (editing) { openEditor(item); return; }

  const now = Date.now();
  if (state.settings.debounce && now - lastTap < state.settings.debounce) return;
  lastTap = now;
  flash(tile);

  if (item.type === 'folder') {
    goTo(item.link);
    return;
  }

  sentence.push({ label: item.label, say: item.say || item.label, sym: item.sym, type: item.type });
  renderStrip();
  if (state.settings.speakOnTap) speak(item.say || item.label);
  // Place pages (School, Park…) stay open: you often want several words there.
  if (state.settings.autoHome && pageId !== HOME && !state.pages[pageId].stay) goTo(HOME);
});

function findItem(id) {
  return state.pages[pageId]?.items.find((it) => it.id === id);
}

$('strip').addEventListener('click', async () => {
  if (!sentence.length) return;
  const strip = $('strip');
  strip.classList.add('speaking');
  await speak(sentence.map((w) => w.say).join(' '));
  strip.classList.remove('speaking');
});

$('backspaceBtn').addEventListener('click', () => { sentence.pop(); renderStrip(); });
$('clearBtn').addEventListener('click', () => { sentence = []; renderStrip(); speechSynthesis?.cancel(); });
$('homeBtn').addEventListener('click', () => goTo(HOME));

// Press and hold to open grown-up settings, so the child can't open it by accident.
(() => {
  const btn = $('lockBtn');
  let timer = 0;
  btn.style.setProperty('--hold-ms', HOLD_MS + 'ms');
  const cancel = () => { clearTimeout(timer); btn.classList.remove('holding'); };
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    btn.classList.add('holding');
    timer = setTimeout(() => { cancel(); openSettings(); }, HOLD_MS);
  });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => btn.addEventListener(ev, cancel));
  btn.addEventListener('contextmenu', (e) => e.preventDefault());
})();

// Block pinch-zoom and double-tap zoom on iPad Safari, which ignores user-scalable.
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });

new ResizeObserver(sizeRows).observe(grid);

// ---------- Settings ----------

function openSettings() {
  const s = state.settings;
  $('setCols').value = String(s.cols);
  $('setLabels').checked = s.labels;
  $('setAutoHome').checked = s.autoHome;
  $('setDebounce').value = String(s.debounce);
  $('setSpeakTap').checked = s.speakOnTap;
  $('setRate').value = s.rate;
  $('setPitch').value = s.pitch;
  fillVoiceSelect();
  renderSwatches();
  $('installHint').textContent = isStandalone()
    ? 'Installed on this device — works offline.'
    : 'To install on iPad: open in Safari, tap Share, then "Add to Home Screen".';
  $('settings').showModal();
}

function fillVoiceSelect() {
  const sel = $('setVoice');
  const cur = currentVoice();
  sel.replaceChildren(...voices.map((v) => new Option(`${v.name} (${v.lang})`, v.voiceURI, false, v === cur)));
  if (!voices.length) sel.append(new Option('Default voice', ''));
}

function renderSwatches() {
  $('skinSwatches').replaceChildren(...SKIN_TONES.map((tone) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'swatch';
    b.style.background = tone;
    b.setAttribute('aria-label', 'Skin colour');
    b.setAttribute('aria-pressed', String(tone === state.settings.skin));
    b.addEventListener('click', () => { state.settings.skin = tone; save(); renderSwatches(); render(); renderStrip(); prefetchToned(); });
    return b;
  }));
}

function bindSetting(id, key, read) {
  $(id).addEventListener('change', (e) => { state.settings[key] = read(e.target); save(); render(); });
}
bindSetting('setCols', 'cols', (el) => Number(el.value));
bindSetting('setLabels', 'labels', (el) => el.checked);
bindSetting('setAutoHome', 'autoHome', (el) => el.checked);
bindSetting('setDebounce', 'debounce', (el) => Number(el.value));
bindSetting('setSpeakTap', 'speakOnTap', (el) => el.checked);
bindSetting('setVoice', 'voice', (el) => el.value);
bindSetting('setRate', 'rate', (el) => Number(el.value));
bindSetting('setPitch', 'pitch', (el) => Number(el.value));

$('testVoice').addEventListener('click', () => speak('Hello! I want to play.'));

$('startEditing').addEventListener('click', () => { $('settings').close(); editing = true; render(); });
$('doneEditing').addEventListener('click', () => { editing = false; render(); });

$('resetBtn').addEventListener('click', async () => {
  if (!confirm('Reset to the starting board? Your changes and photos will be removed.')) return;
  state.pages = buildDefaultPages();
  state.settings = { ...DEFAULT_SETTINGS };
  await photos.clear();
  save();
  sentence = [];
  renderStrip();
  $('settings').close();
  goTo(HOME);
});

$('exportBtn').addEventListener('click', async () => {
  const data = {
    app: 'taptalk', version: 1, stateVersion: STATE_VERSION, saved: new Date().toISOString(),
    pages: state.pages, settings: state.settings, photos: await photos.exportAll(),
  };
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const name = `taptalk-backup-${new Date().toISOString().slice(0, 10)}.json`;
  const file = new File([blob], name, { type: 'application/json' });
  // iPad: the share sheet lets you save to Files, AirDrop or email it.
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'TapTalk backup' }); return; } catch (err) { if (err.name === 'AbortError') return; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
});

$('importFile').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (data.app !== 'taptalk' || !data.pages?.[HOME]) throw new Error('This is not a TapTalk backup.');
    if (!confirm('Replace this board with the backup?')) return;
    await photos.clear();
    await photos.importAll(data.photos || {});
    upgradePages(data.pages, data.stateVersion || 1);
    state.pages = data.pages;
    state.settings = { ...DEFAULT_SETTINGS, ...data.settings };
    save();
    $('settings').close();
    goTo(HOME);
  } catch (err) {
    alert('Could not load backup: ' + err.message);
  }
});

// ---------- Button editor ----------

let draft = null;     // copy of item being edited
let draftIsNew = false;

function openEditor(item, isNew = !item) {
  draftIsNew = isNew;
  draft = item ? { ...item } : { id: uid(), label: '', say: '', sym: '', type: 'noun', link: '', hidden: false };
  $('editorTitle').textContent = draftIsNew ? 'Add button' : 'Edit button';
  photoStatus('');
  $('edLabel').value = draft.label;
  $('edSay').value = draft.say;
  $('edHidden').checked = draft.hidden;
  $('deleteBtn').hidden = draftIsNew;
  $('moveRow').hidden = draftIsNew;
  fillLinkSelect();
  renderTypePicker();
  renderPreview();
  $('editor').showModal();
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
    });
    return b;
  }));
}

function renderPreview() {
  draft.label = $('edLabel').value;
  const t = tileFor({ ...draft, label: draft.label || 'word', hidden: false });
  t.classList.add('preview-tile');
  t.disabled = true;
  $('previewTile').replaceWith(t);
  t.id = 'previewTile';
}

$('edLabel').addEventListener('input', renderPreview);

$('pickSymbol').addEventListener('click', () => openPicker($('edLabel').value));

const photoStatus = (text) => { $('photoStatus').textContent = text; };

async function usePhoto(blob) {
  if (!blob) return;
  try {
    const id = await photos.addFromFile(blob);
    draft.sym = 'u:' + id;
    renderPreview();
    photoStatus('Photo added. Tap Save to keep it.');
  } catch (err) {
    photoStatus('Could not use that photo: ' + err.message);
  }
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

// Straight from Google Photos (only when js/config.js is filled in).
$('googlePhotos').hidden = !gphotos.enabled;
$('googlePhotos').addEventListener('click', pickFromGoogle);

async function pickFromGoogle() {
  const dlg = $('gpDialog');
  const ctrl = new AbortController();
  const open = $('gpOpen');
  open.hidden = true;
  $('gpCancel').onclick = () => { ctrl.abort(); dlg.close(); };
  // Typing in the editor may not have been saved into the draft yet.
  draft.label = $('edLabel').value;
  draft.say = $('edSay').value;
  draft.hidden = $('edHidden').checked;
  dlg.showModal();
  try {
    const blob = await gphotos.pick({
      signal: ctrl.signal,
      resume: { pageId, draft, draftIsNew },
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
document.addEventListener('paste', (e) => {
  if (!editorEl.open) return;
  const cd = e.clipboardData;
  const inBox = e.target.closest?.('#pasteBox');
  const files = [...(cd?.files || [])];
  // Leave normal text pasting into the word fields alone.
  if (!inBox && !files.some((f) => f.type.startsWith('image/'))) return;
  e.preventDefault();
  pasteFrom({ files, html: cd?.getData('text/html') || '', text: cd?.getData('text/plain') || '' });
});

// The paste box only exists to get the device's own Paste menu; never let
// anything be typed or dropped into it.
const PASTE_BOX_HTML = $('pasteBox').innerHTML;
$('pasteBox').addEventListener('input', () => { $('pasteBox').innerHTML = PASTE_BOX_HTML; });
$('pasteBox').addEventListener('beforeinput', (e) => { if (e.inputType !== 'insertFromPaste') e.preventDefault(); });
editorEl.addEventListener('dragover', (e) => e.preventDefault());
editorEl.addEventListener('drop', (e) => {
  const file = [...(e.dataTransfer?.files || [])].find((f) => f.type.startsWith('image/'));
  if (file) { e.preventDefault(); usePhoto(file); }
});

$('moveBack').addEventListener('click', () => moveItem(-1));
$('moveFwd').addEventListener('click', () => moveItem(1));

function moveItem(dir) {
  const items = state.pages[pageId].items;
  const i = items.findIndex((it) => it.id === draft.id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= items.length) return;
  [items[i], items[j]] = [items[j], items[i]];
  save();
  render();
}

$('deleteBtn').addEventListener('click', () => {
  if (!confirm(`Delete "${draft.label}"? Tip: you can hide it instead.`)) return;
  const page = state.pages[pageId];
  page.items = page.items.filter((it) => it.id !== draft.id);
  save();
  $('editor').close();
  render();
});

$('editorForm').addEventListener('submit', (e) => {
  if (e.submitter?.value !== 'save') return;
  draft.label = $('edLabel').value.trim();
  draft.say = $('edSay').value.trim();
  draft.hidden = $('edHidden').checked;
  if (!draft.label) { e.preventDefault(); return; }

  if (draft.type === 'folder') {
    let link = $('edLink').value;
    if (link === '__new' || !state.pages[link]) {
      link = 'p' + uid();
      state.pages[link] = { name: draft.label, items: [] };
    }
    draft.link = link;
  } else {
    draft.link = '';
  }

  const items = state.pages[pageId].items;
  const i = items.findIndex((it) => it.id === draft.id);
  if (i >= 0) items[i] = draft; else items.push(draft);
  save();
  render();
});

// ---------- Symbol picker ----------

let symbolIndex = null;

async function getIndex() {
  if (!symbolIndex) {
    const rows = await fetch('symbols/index.json').then((r) => r.json());
    symbolIndex = rows.map(([name, cat, tags]) => ({
      name,
      words: name.replace(/_,_to$/, '').replace(/_\d+[a-z]?$/, '').replace(/[_,-]+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase(),
      hay: `${cat} ${tags}`.toLowerCase(),
    }));
    // Custom symbols first so they show up for their words.
    for (const name of ['I', 'you', 'stop', 'please', 'thank_you', 'again']) {
      symbolIndex.unshift({ name, custom: true, words: name.replace(/_/g, ' ').toLowerCase(), hay: 'taptalk' });
    }
  }
  return symbolIndex;
}

function searchSymbols(index, q) {
  q = q.trim().toLowerCase();
  if (!q) return index.slice(0, 150);
  const terms = q.split(/\s+/);
  const scored = [];
  for (const s of index) {
    let score = 0;
    if (s.words === q) score = 100;
    else if (s.words.startsWith(q)) score = 60;
    else if (terms.every((t) => (' ' + s.words).includes(' ' + t))) score = 40;
    else if (terms.every((t) => s.words.includes(t))) score = 25;
    else if (terms.every((t) => s.hay.includes(t))) score = 10;
    if (score) scored.push([score - s.words.length / 100, s]);
  }
  return scored.sort((a, b) => b[0] - a[0]).slice(0, 150).map(([, s]) => s);
}

async function openPicker(query) {
  $('pickerSearch').value = query || '';
  $('picker').showModal();
  await renderPicker();
}

// ARASAAC (arasaac.org) has ~13,000 child-friendly pictograms and a free,
// open search API. Results need a connection; a chosen picture is saved on
// the device like a photo, so it works offline and goes into backups.
const ARASAAC_API = 'https://api.arasaac.org/v1/pictograms/en/search/';
const arasaacImg = (id, size) => `https://static.arasaac.org/pictograms/${id}/${id}_${size}.png`;
let pickerRun = 0;

async function searchArasaac(q) {
  q = q.trim();
  if (!q || !navigator.onLine) return [];
  const res = await fetch(ARASAAC_API + encodeURIComponent(q));
  if (res.status === 404) return []; // no matches
  if (!res.ok) throw new Error('ARASAAC ' + res.status);
  return (await res.json()).slice(0, 60).map((p) => ({ id: p._id, words: p.keywords?.[0]?.keyword || q }));
}

function pickButton(src, words, onPick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'pick';
  const img = document.createElement('img');
  img.loading = 'lazy';
  img.src = src;
  img.alt = '';
  const span = document.createElement('span');
  span.textContent = words;
  b.append(img, span);
  b.addEventListener('click', async () => {
    try {
      draft.sym = await onPick();
    } catch {
      alert('Could not get that picture. Check the internet connection and try again.');
      return;
    }
    if (!$('edLabel').value) $('edLabel').value = words;
    renderPreview();
    $('picker').close();
  });
  return b;
}

function pickerHeading(text) {
  const h = document.createElement('h4');
  h.className = 'picker-heading';
  h.textContent = text;
  return h;
}

async function renderPicker() {
  const run = ++pickerRun;
  const q = $('pickerSearch').value;
  const index = await getIndex();
  const mulberry = searchSymbols(index, q).slice(0, q.trim() ? 60 : 150);
  const g = $('pickerGrid');

  const arasaacBox = document.createElement('div');
  arasaacBox.className = 'picker-section';
  // ARASAAC first (the board's own style), then Mulberry, which also works offline.
  const parts = q.trim() ? [arasaacBox] : [];
  if (mulberry.length) {
    parts.push(pickerHeading('Mulberry'), ...mulberry.map((s) => {
      const sym = (s.custom ? 'c:' : 'm:') + s.name;
      return pickButton(rawSymbolUrl(sym), s.words, async () => sym);
    }));
  }
  g.replaceChildren(...parts);
  g.scrollTop = 0;
  if (!q.trim()) return;

  arasaacBox.replaceChildren(pickerHeading('ARASAAC'), Object.assign(document.createElement('p'), { className: 'picker-empty', textContent: 'Searching…' }));
  let found = [];
  let note = '';
  try {
    found = await searchArasaac(q);
    if (!navigator.onLine) note = 'Connect to the internet to see ARASAAC pictures.';
  } catch {
    note = 'ARASAAC pictures could not be loaded right now.';
  }
  if (run !== pickerRun) return; // a newer search has started

  if (!found.length && !mulberry.length && !note) note = 'No pictures found. Try another word, or use a photo.';
  else if (!found.length && !note) note = 'No ARASAAC pictures for this word.';
  arasaacBox.replaceChildren(
    pickerHeading('ARASAAC'),
    ...found.map((p) => pickButton(arasaacImg(p.id, 300), p.words, async () => {
      const res = await fetch(arasaacImg(p.id, 500));
      if (!res.ok) throw new Error(res.status);
      return 'u:' + await photos.addBlob(await res.blob());
    })),
    ...(note ? [Object.assign(document.createElement('p'), { className: 'picker-empty', textContent: note })] : []),
  );
}

let searchTimer = 0;
$('pickerSearch').addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(renderPicker, 150); });
$('pickerClose').addEventListener('click', () => $('picker').close());

// ---------- Start up ----------

function isStandalone() {
  return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
}

if ('speechSynthesis' in window) {
  loadVoices();
  speechSynthesis.addEventListener?.('voiceschanged', loadVoices);
}

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
navigator.storage?.persist?.();

render();
renderStrip();

// Back from Google sign-in: reopen the editor where we left it and carry on.
const back = gphotos.takeResume();
if (back?.resume?.draft) {
  const { resume } = back;
  pageId = state.pages[resume.pageId] ? resume.pageId : HOME;
  editing = true;
  render();
  openEditor(resume.draft, resume.draftIsNew);
  if (back.ok) pickFromGoogle();
  else if (back.error !== 'access_denied') alert('Google sign-in did not work: ' + back.error);
}

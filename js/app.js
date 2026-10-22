import { DEFAULT_PAGES, DEFAULT_NAV, DEFAULT_SETS, HOME } from './board.js';
import { STATE_VERSION, buildDefaultPages, upgradeStored, upgradePages, upgradeLook, upgradeSettingsToNav, addV10Nav, addV11Nav } from './upgrades.js';
import * as photos from './photos.js';
import * as gphotos from './gphotos.js';
import * as sync from './sync.js';
import { editPicture, initCropper } from './cropper.js';
import { openSheet } from './sheet.js';
import { merge, fingerprint } from './merge.js';
import * as clips from './clips.js';
import { VERSION, BUILT } from './version.js';
import * as ai from './aipics.js';

const STORE_KEY = 'taptalk.v1';
// When this device last saved a backup and last changed the board (see backupDue).
const BACKUP_KEY = 'taptalk.lastBackup';
const EDIT_AT_KEY = 'taptalk.lastEdit';
const BACKUP_EVERY = 30 * 24 * 60 * 60 * 1000;
const DEFAULT_SKIN = '#ffeec8';
const SKIN_TONES = ['#ffeec8', '#f6d2a9', '#e0ac7e', '#c08654', '#8d5a33', '#5c3a21'];
// The ARASAAC server re-draws pictures in these skin tones (names are theirs).
const ARASAAC_SKIN = { '#f6d2a9': 'assian', '#e0ac7e': 'mulatto', '#c08654': 'aztec', '#8d5a33': 'black', '#5c3a21': 'black' };
const HOLD_MS = 1500;

const TYPES = [
  ['pron', 'People'], ['verb', 'Doing'], ['desc', 'Describing'], ['noun', 'Things'],
  ['social', 'Social'], ['neg', 'No / stop'], ['q', 'Question'], ['folder', 'Page'],
];

const DEFAULT_SETTINGS = {
  cols: 5,
  rows: 4,          // rows on screen; pages with more buttons scroll
  sidebar: true,    // left-hand column of page buttons
  coreStrip: true,  // core words strip on every page
  nav: [...DEFAULT_NAV], // the column before page sets (kept for older copies of TapTalk)
  activeSet: '',    // which page set this device shows (not shared)
  labels: true,
  autoHome: true,
  debounce: 0,
  speakOnTap: true,
  voice: '',
  childName: '',    // put into the starting words that use {name} (About me)
  rate: 0.9,
  pitch: 1.1,
  skin: DEFAULT_SKIN,
  corners: 8,       // button corner radius, px
  outline: 0,       // button outline thickness, px
};

const $ = (id) => document.getElementById(id);
const uid = () => 'i' + Math.random().toString(36).slice(2, 10);

// ---------- State ----------

// Puts the child's name into the button(s) made from {name} words, adding
// them if they aren't there yet (e.g. a name given after the board was made).
function applyChildName(name) {
  const at = now();
  for (const [pageId, page] of Object.entries(buildDefaultPages(name || ' '))) {
    const mine = state.pages[pageId];
    if (!mine) continue;
    DEFAULT_PAGES[pageId].items.forEach(([label], i) => {
      if (!label.includes('{name}')) return;
      const want = page.items[i];
      const have = mine.items.find((it) => it.id === want.id);
      if (!name) { if (have) { mine.items = mine.items.filter((it) => it !== have); state.deleted[have.id] = at; } return; }
      if (have) Object.assign(have, { label: want.label, say: want.say, updatedAt: at });
      else { mine.items.splice(i, 0, { ...want, updatedAt: at }); delete state.deleted[want.id]; mine.orderAt = at; }
    });
  }
}

function loadState() {
  try {
    const saved = upgradeStored(JSON.parse(localStorage.getItem(STORE_KEY)));
    if (saved) return { ...saved, settings: { ...DEFAULT_SETTINGS, ...saved.settings } };
  } catch { /* fall through to defaults */ }
  return { pages: buildDefaultPages(), settings: { ...DEFAULT_SETTINGS }, deleted: {}, settingsAt: 0, fresh: true };
}

// Edit times let two devices' boards be merged (see merge.js).
const now = () => Date.now();
const touchSettings = () => { state.settingsAt = now(); };

// Replace the whole board (reset / load backup) in a way that also wins when
// merged with other devices: old buttons and pages become deletions, and
// everything new counts as just edited.
function replaceBoard(pages, settings) {
  const at = now();
  const keep = new Set(Object.values(pages).flatMap((p) => p.items.map((it) => it.id)));
  for (const [id, page] of Object.entries(state.pages)) {
    if (!pages[id]) state.deleted['page:' + id] = at;
    for (const it of page.items) if (!keep.has(it.id)) state.deleted[it.id] = at;
  }
  for (const page of Object.values(pages)) {
    page.updatedAt = at;
    page.orderAt = at;
    for (const it of page.items) it.updatedAt = at;
  }
  state.pages = pages;
  state.settings = settings;
  state.settingsAt = at;
}

const state = loadState();

// While TapTalk is being developed, show which version is running.
$('appVersion').textContent = `v ${VERSION} · ${BUILT}`;
$('aboutVersion').textContent = `TapTalk version ${VERSION} (${BUILT}).`;

// ---------- Page sets ----------
// A set is a named list of pages for the left-hand column, with its own Home
// page (e.g. "Everyday", "School"). Sets are shared between devices; which
// set is showing is chosen on each device. Boards from before sets get one
// set, "Everyday", holding their column (same id everywhere, so devices agree).
function ensureSets(settings) {
  if (Array.isArray(settings.sets) && settings.sets.length) return;
  const nav = Array.isArray(settings.nav) ? settings.nav : DEFAULT_NAV;
  // The starting board gets the starting sets; a board with its own column keeps it as Everyday.
  settings.sets = nav.join() === DEFAULT_NAV.join()
    ? DEFAULT_SETS.map((x) => ({ ...x, nav: x.nav.filter((id) => state.pages[id]) })).filter((x) => state.pages[x.home])
    : [{ id: 's-everyday', name: 'Everyday', nav: [...nav], home: HOME }];
}
function allSets() { ensureSets(state.settings); return state.settings.sets; }
// Which set this device shows is kept apart from the board, so sharing the
// board with another device can never change it.
const SET_KEY = 'taptalk.activeSet';
function showingSetId() {
  try { return localStorage.getItem(SET_KEY) || state.settings.activeSet || ''; } catch { return state.settings.activeSet || ''; }
}
function activeSet() {
  const sets = allSets();
  return sets.find((x) => x.id === showingSetId()) || sets[0];
}
const navIds = () => activeSet().nav;
// This set's Home page (the house button, Back from the first page, …).
function homeId() {
  const h = activeSet().home;
  return h && state.pages[h] ? h : HOME;
}

let pageId = homeId();
let editing = false;
let sentence = []; // [{label, say, sym, type}]
let lastTap = 0;

function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({
      version: STATE_VERSION, pages: state.pages, settings: state.settings, deleted: state.deleted, settingsAt: state.settingsAt,
    }));
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
    const [src, fill] = await Promise.all([photos.url(name), photos.fills(name)]);
    img.src = src || '';
    img.closest('.tile')?.classList.toggle('fill', Boolean(src && fill));
    return;
  }
  img.closest('.tile')?.classList.remove('fill');
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
// TapTalk has one voice, built in: Coral, a recorded AI voice. Every button's
// words are recordings (the starting board's ship with the app; others come
// with the shared board), and a sentence plays its words' recordings in turn.
// The iPad's own voice is only a backup, for a brand-new word not yet recorded.

let voices = [];

function loadVoices() {
  if (!('speechSynthesis' in window)) return;
  voices = speechSynthesis.getVoices().filter((v) => v.lang.startsWith('en'));
  // The backup: a British English voice on the iPad, the best quality first.
  const score = (v) => (/GB/.test(v.lang) ? 4 : 0) + (v.localService ? 2 : 0) + (/premium|enhanced/i.test(v.voiceURI) ? 1 : 0);
  voices.sort((a, b) => score(b) - score(a));
}
const backupVoice = () => voices[0] || null;

function stopSpeaking() {
  clips.stop();
  if ('speechSynthesis' in window) speechSynthesis.cancel();
}

// text: what to say, or a sentence's words (each word's recording in turn).
function speak(textOrWords) {
  const words = (Array.isArray(textOrWords) ? textOrWords : [textOrWords]).filter(Boolean);
  const text = words.join(' ');
  if (!text) return Promise.resolve();
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  // A word with no recording yet (offline) falls back to the iPad voice.
  return clips.speak(clips.VOICE, words).then((ok) => (ok ? undefined : speakOnDevice(text))).catch(() => speakOnDevice(text));
}

function speakOnDevice(text) {
  clips.stop();
  if (!('speechSynthesis' in window)) return Promise.resolve();
  speechSynthesis.cancel();
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    const v = backupVoice();
    if (v) { u.voice = v; u.lang = v.lang; } else { u.lang = 'en-GB'; }
    u.rate = 0.9;
    u.onend = u.onerror = () => resolve();
    speechSynthesis.speak(u);
  });
}

// ---------- Rendering ----------

const grid = $('grid');

function render() {
  const page = state.pages[pageId] || state.pages[homeId()];
  document.documentElement.classList.toggle('no-labels', !state.settings.labels);
  document.documentElement.style.setProperty('--btn-radius', state.settings.corners + 'px');
  document.documentElement.style.setProperty('--btn-line', state.settings.outline + 'px');
  document.documentElement.classList.toggle('compact', isCompact());
  document.body.classList.toggle('editing', editing);
  $('editBanner').hidden = !editing;
  const syncMode = sync.config().mode;
  $('appVersion').hidden = syncMode === 'off'; // shown in Settings → About for everyone else
  $('googlePhotos').hidden = !googlePhotosReady();
  const manualSend = syncMode === 'send' || (syncMode === 'both' && !autoSend());
  $('sendFromBanner').hidden = !manualSend;
  $('backupFromBanner').hidden = !backupDue();
  if (!$('sendFromBanner').disabled) $('sendFromBanner').textContent = sendLabel();
  $('compactToggle').hidden = syncMode !== 'send';
  $('compactToggle').textContent = compactPref() ? 'Full-size view' : 'Smaller view';
  $('editToggle').hidden = syncMode !== 'send';
  $('editToggle').setAttribute('aria-pressed', String(editing));
  $('editToggleText').textContent = editing ? 'Done' : 'Edit';
  // "Editing" always shows; the explanation is hidden on narrower screens.
  $('editDetail').textContent = syncMode === 'receive' ? 'changes stay on this iPad'
    : syncMode === 'both' ? (autoSend() ? 'shared when you tap Done' : 'tap Send changes to share')
    : syncMode === 'send' ? 'press E when done'
    : 'tap a button to change it';
  $('pageTitle').textContent = page.name;
  $('bannerSet').textContent = allSets().length > 1 ? activeSet().name : 'Pages';
  grid.style.setProperty('--cols', state.settings.cols);

  renderSidebar();
  renderCoreBar();
  const frag = document.createDocumentFragment();
  if (pageId !== homeId() && !state.settings.sidebar) frag.append(backTile());
  // Hidden buttons keep their space so nothing else moves (motor planning).
  for (const item of page.items) frag.append(item.hidden && !editing ? gapTile() : tileFor(item));
  if (editing) frag.append(addTile());
  const clip = editing && readClip();
  showClipBar(clip);
  if (clip?.cut) frag.querySelector(`.tile[data-id="${clip.item.id}"]`)?.classList.add('cut-pending');

  grid.replaceChildren(frag);
  sizeRows();
  if (!editing) warmPage();
}

// ---------- Video buttons ----------
// A button can play a YouTube video (e.g. Mr Tumble): tapping it says the word
// and opens the video full screen, with a big Close.

// The video's id from any YouTube link (or an id on its own), else ''.
function videoId(text) {
  const t = (text || '').trim();
  if (/^[\w-]{11}$/.test(t)) return t;
  try {
    const u = new URL(t);
    const host = u.hostname.replace(/^(www|m|music)\./, '');
    if (host === 'youtu.be') return /^[\w-]{11}$/.test(u.pathname.slice(1, 12)) ? u.pathname.slice(1, 12) : '';
    if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
      const v = u.searchParams.get('v') || (u.pathname.match(/^\/(?:embed|shorts|live|v)\/([\w-]{11})/) || [])[1];
      return v && /^[\w-]{11}$/.test(v) ? v : '';
    }
  } catch { /* not a link */ }
  return '';
}
const videoUrl = (id) => 'https://youtu.be/' + id;

function openVideo(id) {
  const frame = $('videoFrame');
  frame.replaceChildren();
  $('videoOpenYT').href = videoUrl(id);
  if (!navigator.onLine) {
    frame.innerHTML = '<p class="video-msg">Videos need the internet.</p>';
  } else {
    const f = document.createElement('iframe');
    f.src = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&playsinline=1&rel=0&modestbranding=1`;
    f.title = 'Video';
    f.allow = 'autoplay; encrypted-media; fullscreen; picture-in-picture';
    f.allowFullscreen = true;
    frame.append(f);
  }
  openSheet($('videoPlayer'));
}

function closeVideo() {
  $('videoFrame').replaceChildren(); // stops the video
  if ($('videoPlayer').open) $('videoPlayer').close();
}
$('videoClose').addEventListener('click', closeVideo);
$('videoPlayer').addEventListener('close', () => $('videoFrame').replaceChildren());

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
  if (item.type === 'folder') {
    const arrow = document.createElement('span');
    arrow.className = 'page-badge';
    arrow.setAttribute('aria-hidden', 'true');
    arrow.innerHTML = '<svg viewBox="0 0 24 24"><path d="M5 12h13M12.5 6l6 6-6 6"/></svg>';
    b.append(arrow);
  }
  if (item.video) {
    const play = document.createElement('span');
    play.className = 'play-badge';
    play.setAttribute('aria-hidden', 'true');
    b.append(play);
    b.setAttribute('aria-label', `${item.label} (video)`);
  }
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
  b.innerHTML = '<span class="plus">+</span><span class="label">Add</span>';
  return b;
}

// Editing on the computer uses a smaller view by default (toggle in the edit bar).
const COMPACT_KEY = 'taptalk.compact';
function compactPref() {
  try { return localStorage.getItem(COMPACT_KEY) !== 'off'; } catch { return true; }
}
function isCompact() {
  return editing && compactPref() && sync.config().mode === 'send';
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
  // A fixed number of rows fills the screen (5 × 5 by default); pages with
  // more buttons scroll. The compact editing view on the computer fits more.
  const onScreen = Math.max(1, state.settings.rows || 4);
  const rowH = isCompact()
    ? Math.max(64, Math.min((avail - gap * (rows - 1)) / rows, colW * 0.85, 120))
    : Math.max(56, (avail - gap * (onScreen - 1)) / onScreen);
  grid.style.setProperty('--row-h', Math.floor(rowH) + 'px');
  grid.style.setProperty('--col-w', Math.floor(colW) + 'px');
  sizeSidebar(rowH);
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

// ---------- Left-hand column ----------
// Back, then the pages that are always one tap away (like a menu down the
// side). In edit mode each page has a × to take it out, and + Add puts any
// page in.

const sidebar = $('sidebar');

function navIcon(id) {
  const page = state.pages[id];
  if (page?.icon) return page.icon;
  for (const p of Object.values(state.pages)) {
    const link = p.items.find((it) => it.type === 'folder' && it.link === id);
    if (link) return link.sym;
  }
  return '';
}

function navButton(label, sym, cls) {
  const b = document.createElement('button');
  b.className = 'nav-btn ' + cls;
  const img = document.createElement('img');
  if (sym) setSymbol(img, sym); else img.hidden = true;
  const span = document.createElement('span');
  span.textContent = label;
  b.append(img, span);
  return b;
}

function renderSidebar() {
  const on = state.settings.sidebar;
  sidebar.hidden = !on;
  document.body.classList.toggle('with-sidebar', on);
  if (!on) return;
  const parts = [];
  const back = navButton('Back', '', 'nav-back');
  back.insertAdjacentHTML('afterbegin', '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M30 10 16 24l14 14"/></svg>');
  back.disabled = pageId === homeId();
  back.addEventListener('click', goBack);
  parts.push(back);
  for (const id of navIds()) {
    const page = state.pages[id];
    if (!page) continue;
    const b = navButton(page.name, navIcon(id), 'nav-page');
    if (id === pageId) b.setAttribute('aria-current', 'page');
    b.addEventListener('click', () => goTo(id, { fromNav: true }));
    if (editing) {
      const x = document.createElement('span');
      x.className = 'nav-remove';
      x.textContent = '×';
      x.setAttribute('role', 'button');
      x.setAttribute('aria-label', `Take ${page.name} out of the column`);
      x.addEventListener('click', (e) => { e.stopPropagation(); setNav(navIds().filter((n) => n !== id), `Took “${page.name}” out of the column`); });
      b.append(x);
    }
    parts.push(b);
  }
  if (editing) {
    const add = navButton('+ Add', '', 'nav-add');
    add.addEventListener('click', openNavPicker);
    parts.push(add);
  }
  sidebar.replaceChildren(...parts);
}

function sizeSidebar(rowH) {
  if (!state.settings.sidebar) return;
  const count = sidebar.children.length || 1;
  // Every page stays on screen: a long column packs closer, and one too long
  // for a single line of comfortable buttons splits into two side by side
  // (Back across the top).
  sidebar.classList.remove('crowded', 'two-col');
  const gap = parseFloat(getComputedStyle(sidebar).rowGap) || 10;
  const pad = getComputedStyle(sidebar);
  const height = sidebar.clientHeight - parseFloat(pad.paddingTop) - parseFloat(pad.paddingBottom);
  const single = (height - gap * (count - 1)) / count;
  let rows = count;
  if (single < 52) {
    sidebar.classList.add('two-col');
    rows = 1 + Math.ceil((count - 1) / 2);
  } else if (count > 9) {
    sidebar.classList.add('crowded');
  }
  const g = parseFloat(getComputedStyle(sidebar).rowGap) || gap;
  const fit = (height - g * (rows - 1)) / rows;
  sidebar.style.setProperty('--nav-h', Math.floor(Math.max(44, Math.min(fit, rowH))) + 'px');
}

function setNav(nav, undoText) {
  const set = activeSet();
  const before = set.nav;
  set.nav = nav;
  touchSettings();
  markChanged();
  save();
  render();
  if (undoText) {
    offerUndo(undoText, () => { set.nav = before; touchSettings(); afterRestore(); });
  }
}

function openNavPicker() {
  const list = $('navList');
  const inNav = new Set(navIds());
  const choices = Object.entries(state.pages).filter(([id]) => id !== HOME && !inNav.has(id));
  list.replaceChildren(...choices.map(([id, page]) => {
    const b = navButton(page.name, navIcon(id), 'nav-page');
    b.type = 'button';
    b.addEventListener('click', () => { $('navPicker').close(); setNav([...navIds(), id]); });
    return b;
  }));
  if (!choices.length) list.innerHTML = '<p class="hint">Every page is already in the column.</p>';
  openSheet($('navPicker'));
}
$('navPickerClose').addEventListener('click', () => $('navPicker').close());

// ---------- Make a page from words ----------
// "The Gruffalo, gruffalo, mouse, fox": the first is the page's name, the rest
// become its buttons, each with the best ARASAAC picture TapTalk can find.

function parseWords(text) {
  const parts = text.split(/[,\n]+/).map((w) => w.trim()).filter(Boolean);
  const seen = new Set();
  const words = parts.slice(1).filter((w) => !seen.has(w.toLowerCase()) && seen.add(w.toLowerCase())).slice(0, 48);
  return { name: parts[0] || '', words };
}

function showPagePreview() {
  const { name, words } = parseWords($('pageWords').value);
  const out = $('pagePreview');
  out.replaceChildren();
  $('pageMake').disabled = !name || !words.length;
  if (!name) return;
  const b = document.createElement('b');
  b.textContent = name;
  out.append('Page ', b, words.length ? `: ${words.length} button${words.length > 1 ? 's' : ''} (${words.join(', ')})` : ': now add some words after a comma');
}

// The best picture for a word: an ARASAAC picture whose keyword is the word,
// else ARASAAC's first match, else a Mulberry picture on this device.
async function pictureFor(word) {
  try {
    const found = await searchArasaac(word);
    const exact = found.find((p) => p.words.toLowerCase() === word.toLowerCase());
    const pick = exact || found[0];
    if (pick) {
      const res = await fetch(arasaacImg(pick.id, 500));
      if (res.ok) return 'u:' + await photos.addBlob(await res.blob());
    }
  } catch { /* offline or ARASAAC unavailable: try Mulberry */ }
  const hit = searchSymbols(await getIndex(), word).find((s) => !s.custom && s.words === word.toLowerCase());
  return hit ? 'm:' + hit.name : '';
}

async function makePage() {
  const { name, words } = parseWords($('pageWords').value);
  if (!name || !words.length) return;
  const btn = $('pageMake');
  btn.disabled = true;
  const syms = [];
  for (const [i, word] of words.entries()) {
    btn.textContent = `Finding pictures ${i + 1} of ${words.length}…`;
    syms.push(await pictureFor(word));
  }
  const at = now();
  const id = 'p' + uid();
  const items = words.map((label, i) => ({ id: uid(), label, say: '', sym: syms[i], type: 'noun', link: '', hidden: false, updatedAt: at }));
  // A story or topic page stays open while Robyn picks several words.
  state.pages[id] = { name, items, icon: syms.find(Boolean) || '', stay: true, updatedAt: at, orderAt: at };
  let link = null;
  if (state.settings.sidebar) {
    const set = activeSet();
    set.nav = [...set.nav, id];
    touchSettings();
  } else {
    link = { id: uid(), label: name, say: '', sym: syms.find(Boolean) || '', type: 'folder', link: id, hidden: false, updatedAt: at };
    state.pages[HOME].items.push(link);
    state.pages[HOME].orderAt = at;
  }
  markChanged();
  save();
  btn.textContent = 'Make page';
  $('pageMaker').close();
  goTo(id, { fromNav: true });
  const missing = syms.filter((s) => !s).length;
  offerUndo(`Made “${name}”${missing ? `: ${missing} without a picture yet` : ''}`, () => {
    delete state.pages[id];
    state.deleted['page:' + id] = now();
    for (const it of items) state.deleted[it.id] = now();
    if (link) {
      state.pages[HOME].items = state.pages[HOME].items.filter((it) => it.id !== link.id);
      state.deleted[link.id] = now();
    }
    for (const x of allSets()) x.nav = x.nav.filter((n) => n !== id);
    touchSettings();
    goTo(homeId());
    afterRestore();
  });
}

function openPageMaker() {
  if ($('navPicker').open) $('navPicker').close();
  $('pageWords').value = '';
  $('pageMake').textContent = 'Make page';
  showPagePreview();
  openSheet($('pageMaker'));
  $('pageWords').focus();
}

$('openPageMaker').addEventListener('click', openPageMaker);
$('pageWords').addEventListener('input', showPagePreview);
$('pageMake').addEventListener('click', makePage);
$('pageMakerClose').addEventListener('click', () => $('pageMaker').close());

// ---------- Page manager ----------
// Page sets (which pages the left-hand column shows, and each set's Home) and
// every page on the board: rename, change picture, copy, delete. Grown-ups
// switch sets here; the choice is kept on this device only.

let pmTab = 'sets';
let pmSetId = null;     // the set being looked at
let pmAdding = false;   // the page list was opened to add pages to that set
let pmRenaming = null;  // the page whose name is being typed

const pmSet = () => allSets().find((x) => x.id === pmSetId) || activeSet();
const pageName = (id) => state.pages[id]?.name || 'Home';

function h(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'on') for (const [ev, fn] of Object.entries(v)) e.addEventListener(ev, fn);
    else if (k in e) e[k] = v;
    else e.setAttribute(k, v);
  }
  e.append(...kids.filter((x) => x !== null && x !== undefined && x !== false));
  return e;
}
const pill = (text, onClick, extra = {}) => h('button', { type: 'button', className: 'pill', on: { click: onClick }, ...extra }, text);

function pageIcon(id) {
  const img = h('img', { alt: '' });
  const sym = navIcon(id) || state.pages[id]?.items.find((it) => it.sym)?.sym;
  if (sym) setSymbol(img, sym); else img.style.visibility = 'hidden';
  return img;
}

function openPageManager(tab = 'sets') {
  pmTab = tab;
  pmSetId = activeSet().id;
  pmAdding = false;
  pmRenaming = null;
  renderPM();
  openSheet($('pageManager'));
}

function renderPM() {
  for (const t of document.querySelectorAll('#pageManager [data-pm]')) t.setAttribute('aria-selected', String(t.dataset.pm === pmTab));
  $('pmBody').replaceChildren(...(pmTab === 'sets' ? pmSetsView() : [pmLibraryView()]));
}

// After changing sets (shared with the other device).
function commitSets() {
  touchSettings();
  markChanged();
  save();
  render();
  renderPM();
}
// After changing pages.
function commitPages() {
  markChanged();
  save();
  render();
  if ($('pageManager').open) renderPM();
}

function switchSet(id, { quiet = false } = {}) {
  try { localStorage.setItem(SET_KEY, id); } catch { /* storage full: keep it for now */ }
  state.settings.activeSet = id; // this device only (not shared)
  save();
  if (!quiet) offerUndo(`Now showing “${activeSet().name}” on this device`, null);
  pageId = homeId();
  trail = [];
  grid.scrollTop = 0;
  render();
  if ($('pageManager').open) renderPM();
}

function pmSetsView() {
  const sets = allSets();
  const showing = activeSet().id;
  const list = h('div', { className: 'pm-sets', role: 'list' },
    ...sets.map((x) => h('div', { className: 'pm-set-card' },
      h('button', {
        type: 'button', className: 'pm-set', 'aria-selected': String(x.id === pmSetId),
        on: { click: () => { pmSetId = x.id; renderPM(); } },
      }, h('b', {}, x.name), h('small', {}, `${x.nav.length} page${x.nav.length === 1 ? '' : 's'} · Home: ${pageName(x.home)}`)),
      x.id === showing
        ? h('span', { className: 'pm-showing' }, '✓ Showing')
        : pill('Show', () => { pmSetId = x.id; switchSet(x.id); }, { className: 'pill primary-pill pm-show' }))),
    pill('+ New set', () => {
      const x = { id: 's' + uid(), name: 'New set', nav: [], home: HOME };
      allSets().push(x);
      pmSetId = x.id;
      commitSets();
      $('pmSetName')?.select();
    }));

  const set = pmSet();
  const name = h('input', { type: 'text', id: 'pmSetName', value: set.name, autocomplete: 'off', 'aria-label': 'Set name',
    on: { change: (e) => { set.name = e.target.value.trim() || set.name; commitSets(); } } });
  const showBtn = set.id === showing
    ? h('span', { className: 'pm-showing' }, 'Showing on this device')
    : pill('Show on this device', () => switchSet(set.id), { className: 'pill primary-pill' });

  const homeSel = h('select', { 'aria-label': 'Home page', on: { change: (e) => { set.home = e.target.value; commitSets(); if (set.id === activeSet().id) switchSet(set.id, { quiet: true }); } } },
    ...[HOME, ...Object.keys(state.pages).filter((id) => id !== HOME).sort((a, b) => pageName(a).localeCompare(pageName(b)))]
      .map((id) => new Option(pageName(id), id, false, id === (set.home || HOME))));

  const move = (i, d) => {
    const nav = [...set.nav];
    const j = i + d;
    if (j < 0 || j >= nav.length) return;
    [nav[i], nav[j]] = [nav[j], nav[i]];
    set.nav = nav;
    commitSets();
  };
  const rows = set.nav.filter((id) => state.pages[id]).map((id, i, all) => h('div', { className: 'pm-row' },
    pageIcon(id),
    h('div', { className: 'pm-name' }, h('b', {}, pageName(id))),
    pill('↑', () => move(set.nav.indexOf(id), -1), { className: 'pill pm-icon-btn', disabled: i === 0, 'aria-label': `Move ${pageName(id)} up` }),
    pill('↓', () => move(set.nav.indexOf(id), 1), { className: 'pill pm-icon-btn', disabled: i === all.length - 1, 'aria-label': `Move ${pageName(id)} down` }),
    pill('×', () => { set.nav = set.nav.filter((n) => n !== id); commitSets(); }, { className: 'pill pm-icon-btn', 'aria-label': `Take ${pageName(id)} out of this set` })));

  const detail = h('div', { className: 'pm-detail' },
    h('div', { className: 'pm-head' }, name, showBtn),
    h('div', { className: 'pm-home' }, h('span', { className: 'pm-label' }, 'Home page'), homeSel),
    h('div', { className: 'pm-label' }, 'Left-hand column, top to bottom'),
    ...(rows.length ? rows : [h('p', { className: 'pm-hint' }, 'No pages yet. Tap + Add pages.')]),
    h('div', { className: 'pm-actions' },
      pill('+ Add pages', () => { pmTab = 'library'; pmAdding = true; renderPM(); }),
      pill('Copy this set', () => {
        const x = { ...set, id: 's' + uid(), name: `${set.name} (copy)`, nav: [...set.nav] };
        allSets().push(x);
        pmSetId = x.id;
        commitSets();
      }),
      allSets().length > 1 ? pill('Delete set', () => deleteSet(set.id), { className: 'pill danger-pill' }) : null));
  return [list, detail];
}

function deleteSet(id) {
  const before = JSON.parse(JSON.stringify(allSets()));
  const wasShowing = activeSet().id;
  const gone = before.find((x) => x.id === id);
  state.settings.sets = allSets().filter((x) => x.id !== id);
  pmSetId = state.settings.sets[0].id;
  commitSets();
  if (wasShowing === id) switchSet(activeSet().id, { quiet: true });
  offerUndo(`Deleted the “${gone.name}” set`, () => {
    state.settings.sets = before;
    touchSettings();
    afterRestore();
    if (wasShowing === id) switchSet(id, { quiet: true });
  });
}

// Where a page is used: in which sets' columns, as which set's Home, and
// whether any page button opens it.
function pageUses(id) {
  const homes = [];
  const sets = [];
  for (const x of allSets()) {
    if ((x.home || HOME) === id) homes.push(x.name);
    else if (x.nav.includes(id)) sets.push(x.name);
  }
  const linked = Object.values(state.pages).some((p) => p.items.some((it) => it.type === 'folder' && it.link === id));
  const uses = [...(homes.length ? [`Home of ${homes.join(', ')}`] : []), ...(sets.length ? [`in ${sets.join(', ')}`] : [])];
  return { uses, linked };
}

function pmLibraryView() {
  const set = pmSet();
  const ids = [HOME, ...Object.keys(state.pages).filter((id) => id !== HOME).sort((a, b) => pageName(a).localeCompare(pageName(b)))];
  const top = pmAdding
    ? h('div', { className: 'pm-actions' }, h('p', { className: 'pm-hint' }, `Tap Add to put a page in “${set.name}”.`),
      pill('Done', () => { pmTab = 'sets'; pmAdding = false; renderPM(); }))
    : h('div', { className: 'pm-actions' },
      pill('+ New page', () => {
        const id = 'p' + uid();
        const at = now();
        state.pages[id] = { name: 'New page', items: [], updatedAt: at, orderAt: at };
        const showing = activeSet();
        showing.nav = [...showing.nav, id];
        touchSettings();
        pmRenaming = id;
        commitPages();
      }),
      pill('✨ Make a page from words', () => { $('pageManager').close(); openPageMaker(); }));

  const rows = ids.map((id) => {
    const page = state.pages[id];
    const { uses, linked } = pageUses(id);
    const unused = id !== HOME && !uses.length && !linked;
    const info = `${page.items.length} button${page.items.length === 1 ? '' : 's'} · ${unused ? 'Not used anywhere' : uses.length ? uses.join(' · ') : 'opened from a page button'}`;
    let nameBox;
    if (pmRenaming === id) {
      const input = h('input', { type: 'text', value: page.name, 'aria-label': 'Page name' });
      const done = (keep) => {
        if (pmRenaming !== id) return;
        pmRenaming = null;
        const v = input.value.trim();
        if (keep && v && v !== page.name) { page.name = v; page.updatedAt = now(); commitPages(); } else renderPM();
      };
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') done(true); if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); done(false); } });
      input.addEventListener('blur', () => done(true));
      setTimeout(() => { input.focus(); input.select(); });
      nameBox = h('div', { className: 'pm-name' }, input, h('small', {}, info));
    } else {
      nameBox = h('div', { className: 'pm-name' }, h('b', {}, page.name), h('small', {}, info));
    }
    const inSet = set.nav.includes(id);
    const buttons = pmAdding
      ? [id === HOME ? null : pill(inSet ? '✓ In set' : 'Add', () => { set.nav = inSet ? set.nav.filter((n) => n !== id) : [...set.nav, id]; commitSets(); })]
      : [
        pill('Open', () => { $('pageManager').close(); goTo(id); }),
        pill('Rename', () => { pmRenaming = id; renderPM(); }),
        pill('Picture', () => openPicker(page.name, (sym) => { page.icon = sym; page.updatedAt = now(); commitPages(); })),
        pill('Copy', () => duplicatePage(id)),
        id === HOME ? null : pill('Delete', () => deletePage(id), { className: 'pill danger-pill' }),
      ];
    return h('div', { className: 'pm-row' + (unused ? ' unused' : '') }, pageIcon(id), nameBox, ...buttons);
  });
  return h('div', { className: 'pm-library' }, top, ...rows);
}

function duplicatePage(id) {
  const src = state.pages[id];
  const at = now();
  const copyId = 'p' + uid();
  state.pages[copyId] = {
    ...JSON.parse(JSON.stringify(src)),
    name: `${src.name} (copy)`,
    items: src.items.map((it) => { const c = { ...it, id: uid(), updatedAt: at }; delete c.strip; return c; }),
    updatedAt: at, orderAt: at,
  };
  // Next to the original in this device's column, if it's there.
  const showing = activeSet();
  const i = showing.nav.indexOf(id);
  if (i >= 0) { showing.nav = [...showing.nav.slice(0, i + 1), copyId, ...showing.nav.slice(i + 1)]; touchSettings(); }
  pmRenaming = copyId;
  commitPages();
}

// Deleting a page also takes it out of every set and removes the page buttons
// that opened it. Undo puts all of that back.
function deletePage(id) {
  const page = state.pages[id];
  if (!page || id === HOME) return;
  const at = now();
  const setsBefore = JSON.parse(JSON.stringify(allSets()));
  const links = [];
  for (const [pid, p] of Object.entries(state.pages)) {
    p.items.forEach((it, i) => { if (it.type === 'folder' && it.link === id) links.push({ pid, i, it }); });
  }
  for (const { pid, it } of links) {
    state.pages[pid].items = state.pages[pid].items.filter((x) => x !== it);
    state.pages[pid].orderAt = at;
    state.deleted[it.id] = at;
  }
  delete state.pages[id];
  state.deleted['page:' + id] = at;
  for (const x of allSets()) {
    x.nav = x.nav.filter((n) => n !== id);
    if (x.home === id) x.home = HOME;
  }
  touchSettings();
  trail = trail.filter((t) => t !== id);
  if (pageId === id) pageId = homeId();
  commitPages();
  offerUndo(`Deleted the “${page.name}” page`, () => {
    state.pages[id] = { ...page, updatedAt: now() };
    for (const { pid, i, it } of links) {
      const list = state.pages[pid]?.items;
      if (!list) continue;
      list.splice(Math.min(i, list.length), 0, { ...it, updatedAt: now() });
      state.pages[pid].orderAt = now();
    }
    state.settings.sets = setsBefore;
    touchSettings();
    afterRestore();
    if ($('pageManager').open) renderPM();
  });
}

$('pagesFromBanner').addEventListener('click', () => openPageManager());
$('pmClose').addEventListener('click', () => $('pageManager').close());
for (const t of document.querySelectorAll('#pageManager [data-pm]')) {
  t.addEventListener('click', () => { pmTab = t.dataset.pm; pmAdding = false; pmRenaming = null; renderPM(); });
}

// ---------- Interaction ----------

// Pages opened from other pages remember the way back, so "back" on School
// returns to Places rather than Home.
let trail = [];

function goTo(id, { fromNav = false } = {}) {
  const home = homeId();
  const next = state.pages[id] ? id : home;
  if (next === home) trail = [];
  else if (fromNav) trail = [home];
  else if (next !== pageId) trail.push(pageId);
  pageId = next;
  grid.scrollTop = 0;
  render();
}

function goBack() {
  const prev = trail.pop();
  pageId = prev && state.pages[prev] ? prev : homeId();
  if (pageId === homeId()) trail = [];
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

  if (dragJustEnded) return;
  const item = findItem(tile.dataset.id);
  if (!item) return;
  if (editing) { openEditor(item); return; }
  chooseItem(item, tile);
});

// ---------- Drag buttons to reorder (while editing) ----------
// Mouse: just drag. Touch: hold a moment, then drag, so a quick swipe still
// scrolls a long page and a tap still opens the editor. The other buttons
// slide out of the way as it moves; Undo puts the old order back.

const DRAG_HOLD_MS = 250;
const DRAG_SLOP = 8;
let drag = null;
let dragJustEnded = false;

const dragTiles = () => [...grid.querySelectorAll('.tile[data-id]')];

grid.addEventListener('pointerdown', (e) => {
  if (!editing || drag || (e.pointerType === 'mouse' && e.button !== 0)) return;
  const tile = e.target.closest('.tile[data-id]');
  if (!tile) return;
  drag = { tile, id: tile.dataset.id, pointerId: e.pointerId, touch: e.pointerType !== 'mouse', x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, live: false };
  if (drag.touch) drag.holdTimer = setTimeout(() => startDrag(), DRAG_HOLD_MS);
});

function startDrag() {
  const d = drag;
  if (!d || d.live) return;
  d.live = true;
  d.before = dragTiles().map((t) => t.dataset.id);
  const r = d.tile.getBoundingClientRect();
  d.dx = d.x0 - r.left;
  d.dy = d.y0 - r.top;
  const ghost = d.tile.cloneNode(true);
  ghost.classList.add('drag-ghost');
  ghost.style.width = r.width + 'px';
  ghost.style.height = r.height + 'px';
  document.body.append(ghost);
  d.ghost = ghost;
  d.tile.classList.add('drag-source');
  moveGhost();
}

function moveGhost() {
  const d = drag;
  d.ghost.style.transform = `translate(${d.x - d.dx}px, ${d.y - d.dy}px) scale(1.06)`;
}

// Which button slot the finger is over, from the grid's rows and columns
// rather than from the buttons themselves: they are mid-slide, and chasing
// them made neighbours flip back and forth. Near a slot's edge (or in the gap
// between slots) nothing changes, so it can't jitter on a boundary either.
function slotAt(x, y) {
  const r = grid.getBoundingClientRect();
  const cs = getComputedStyle(grid);
  const cols = state.settings.cols;
  const gapX = parseFloat(cs.columnGap) || 0;
  const gapY = parseFloat(cs.rowGap) || 0;
  const left = r.left + parseFloat(cs.paddingLeft);
  const top = r.top + parseFloat(cs.paddingTop) - grid.scrollTop;
  const colW = (grid.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - gapX * (cols - 1)) / cols;
  const rowH = parseFloat(grid.style.getPropertyValue('--row-h')) || colW;
  const cx = (x - left) / (colW + gapX);
  const cy = (y - top) / (rowH + gapY);
  const col = Math.floor(cx);
  const row = Math.floor(cy);
  const inX = (cx - col) * (colW + gapX) / colW;
  const inY = (cy - row) * (rowH + gapY) / rowH;
  if (col < 0 || col >= cols || row < 0 || inX < 0.15 || inX > 0.85 || inY < 0.15 || inY > 0.85) return -1;
  const offset = grid.querySelector('.tile.back') ? 1 : 0;
  return row * cols + col - offset;
}

// Move the dragged button to where the finger is; the others slide (FLIP).
function reorderUnder(x, y) {
  const tiles = dragTiles();
  const slot = slotAt(x, y);
  if (slot < 0) return;
  const to = Math.min(slot, tiles.length - 1);
  const from = tiles.indexOf(drag.tile);
  if (to === from) return;
  const over = tiles[to];
  const first = new Map(tiles.map((t) => [t, t.getBoundingClientRect()]));
  grid.insertBefore(drag.tile, to > from ? over.nextSibling : over);
  for (const t of tiles) {
    const a = first.get(t);
    const b = t.getBoundingClientRect();
    if (t === drag.tile || (a.left === b.left && a.top === b.top)) continue;
    t.style.transition = 'none';
    t.style.transform = `translate(${a.left - b.left}px, ${a.top - b.top}px)`;
    requestAnimationFrame(() => {
      t.style.transition = 'transform 160ms ease-out';
      t.style.transform = '';
    });
  }
}

// Near the top or bottom of a long page, scroll while dragging.
function autoScroll() {
  if (!drag?.live) return;
  const r = grid.getBoundingClientRect();
  const edge = 60;
  const step = drag.y < r.top + edge ? -12 : drag.y > r.bottom - edge ? 12 : 0;
  if (step) {
    grid.scrollTop += step;
    reorderUnder(drag.x, drag.y);
  }
  drag.scrollFrame = requestAnimationFrame(autoScroll);
}

document.addEventListener('pointermove', (e) => {
  const d = drag;
  if (!d || e.pointerId !== d.pointerId) return;
  d.x = e.clientX;
  d.y = e.clientY;
  const moved = Math.hypot(d.x - d.x0, d.y - d.y0) > DRAG_SLOP;
  if (!d.live) {
    if (!moved) return;
    if (d.touch) { cancelDrag(); return; } // a swipe before the hold: let the page scroll
    startDrag();
    autoScroll();
  } else if (!d.scrollFrame) autoScroll();
  moveGhost();
  reorderUnder(d.x, d.y);
});

// Once a drag has started, the finger must not scroll the page.
document.addEventListener('touchmove', (e) => { if (drag?.live) e.preventDefault(); }, { passive: false });

document.addEventListener('pointerup', (e) => { if (drag && e.pointerId === drag.pointerId) endDrag(true); });
document.addEventListener('pointercancel', (e) => { if (drag && e.pointerId === drag.pointerId) endDrag(false); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && drag?.live) endDrag(false); });

function cancelDrag() {
  clearTimeout(drag?.holdTimer);
  drag = null;
}

function endDrag(keep) {
  const d = drag;
  cancelDrag();
  if (!d?.live) return;
  cancelAnimationFrame(d.scrollFrame);
  d.ghost.remove();
  d.tile.classList.remove('drag-source');
  // The click that follows letting go must not open the editor.
  dragJustEnded = true;
  setTimeout(() => { dragJustEnded = false; }, 0);
  const after = dragTiles().map((t) => t.dataset.id);
  if (!keep || after.join() === d.before.join()) { render(); return; }
  const page = state.pages[pageId];
  setOrder(page, after);
  const item = page.items.find((it) => it.id === d.id);
  offerUndo(`Moved “${item?.label || 'button'}”`, () => { setOrder(page, d.before); afterRestore(); });
  markChanged();
  save();
  render();
}

// Put a page's buttons in this order (ids); anything not listed keeps its place at the end.
function setOrder(page, ids) {
  const byId = new Map(page.items.map((it) => [it.id, it]));
  const ordered = ids.map((id) => byId.get(id)).filter(Boolean);
  page.items = [...ordered, ...page.items.filter((it) => !ids.includes(it.id))];
  page.orderAt = now();
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

  sentence.push({ label: item.label, say: item.say || item.label, sym: item.sym, type: item.type });
  renderStrip();
  if (state.settings.speakOnTap) speak(item.say || item.label);
  if (item.video) { openVideo(item.video); return; }
  // Place pages (School, Park…) stay open: you often want several words
  // there; core strip words never jump away from the page either.
  if (!fromStrip && state.settings.autoHome && pageId !== homeId() && !state.pages[pageId].stay) goTo(homeId());
}

// ---------- Core words strip ----------
// The buttons marked "Show in core strip" (Home's first), on every page.

const coreBar = $('coreBar');

function stripItems() {
  const ids = [HOME, ...Object.keys(state.pages).filter((id) => id !== HOME)];
  return ids.flatMap((id) => (state.pages[id]?.items || []).filter((it) => it.strip && !it.hidden).map((it) => ({ it, page: id }))).slice(0, 10);
}

function renderCoreBar() {
  // Not on Home: the core words are already on screen there.
  const items = state.settings.coreStrip && pageId !== HOME ? stripItems() : [];
  coreBar.hidden = !items.length;
  coreBar.style.setProperty('--n', items.length || 1);
  coreBar.replaceChildren(...items.map(({ it, page }) => {
    const b = tileFor(it);
    b.classList.add('core-tile');
    b.dataset.page = page;
    return b;
  }));
}

coreBar.addEventListener('click', (e) => {
  const tile = e.target.closest('.tile');
  if (!tile) return;
  const item = state.pages[tile.dataset.page]?.items.find((it) => it.id === tile.dataset.id);
  if (!item) return;
  if (editing) { openEditor(item, false, tile.dataset.page); return; }
  chooseItem(item, tile, { fromStrip: true });
});

function findItem(id) {
  return state.pages[pageId]?.items.find((it) => it.id === id);
}

$('strip').addEventListener('click', async () => {
  if (!sentence.length) return;
  const strip = $('strip');
  strip.classList.add('speaking');
  await speak(sentence.map((w) => w.say));
  strip.classList.remove('speaking');
});

$('backspaceBtn').addEventListener('click', () => { sentence.pop(); renderStrip(); });
$('clearBtn').addEventListener('click', () => { sentence = []; renderStrip(); stopSpeaking(); applyPendingBoard(); });
$('homeBtn').addEventListener('click', () => goTo(homeId()));

// Press and hold to start editing, so the child can't by accident. The secret
// spot is the page name at the top (the old circle button still works too).
function holdToEdit(el, skip = () => false) {
  let timer = 0;
  el.style.setProperty('--hold-ms', HOLD_MS + 'ms');
  const cancel = () => { clearTimeout(timer); el.classList.remove('holding'); };
  el.addEventListener('pointerdown', (e) => {
    if (editing || skip()) return;
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
$('pageTitle').addEventListener('click', () => { if (!editing && singleTapTitle()) setEditing(true); });
holdToEdit($('pageTitle'), singleTapTitle);
holdToEdit($('lockBtn'));

// Block pinch-zoom and double-tap zoom on iPad Safari, which ignores user-scalable.
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });

new ResizeObserver(sizeRows).observe(grid);

// ---------- Settings ----------

function renderTrash() {
  const list = readTrash();
  $('trashSection').hidden = !list.length;
  $('trashList').replaceChildren(...list.map((entry) => {
    const row = document.createElement('div');
    row.className = 'row';
    const name = document.createElement('span');
    name.textContent = `${entry.item.label} — ${state.pages[entry.pageId]?.name || 'Home'}`;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pill';
    btn.textContent = 'Restore';
    btn.addEventListener('click', () => { restoreButton(entry); renderTrash(); });
    row.append(name, btn);
    return row;
  }));
}

// Settings tabs; the last one used is remembered.
const TAB_KEY = 'taptalk.settingsTab';
function showTab(name) {
  for (const t of document.querySelectorAll('#settings .tab')) t.setAttribute('aria-selected', String(t.dataset.tab === name));
  for (const p of document.querySelectorAll('#settings .tab-panel')) p.hidden = p.dataset.panel !== name;
  try { sessionStorage.setItem(TAB_KEY, name); } catch { /* not important */ }
}
for (const t of document.querySelectorAll('#settings .tab')) t.addEventListener('click', () => showTab(t.dataset.tab));

function openSettings() {
  let tab = 'board';
  try { tab = sessionStorage.getItem(TAB_KEY) || 'board'; } catch { /* default */ }
  showTab(tab);
  renderTrash();
  const s = state.settings;
  $('startEditing').hidden = editing;
  $('setCols').value = String(s.cols);
  $('setRows').value = String(s.rows || 4);
  $('setSidebar').checked = s.sidebar;
  $('setCorners').value = String(s.corners);
  $('setOutline').value = String(s.outline);
  $('aiKey').value = ai.key();
  $('aiQuality').value = s.aiQuality || 'low';
  $('aiPrompt').value = s.aiPrompt || ai.DEFAULT_PROMPT;
  $('setCoreStrip').checked = s.coreStrip;
  $('setLabels').checked = s.labels;
  $('setAutoHome').checked = s.autoHome;
  $('setDebounce').value = String(s.debounce);
  $('setSpeakTap').checked = s.speakOnTap;
  showVoiceStatus();
  renderSwatches();
  fillSyncFields();
  $('installHint').textContent = isStandalone()
    ? 'Installed on this device — works offline.'
    : 'To install: on iPad, open in Safari, tap Share, then "Add to Home Screen". On Android, open in Chrome, tap ⋮, then "Add to Home screen".';
  openSheet($('settings'));
}

// ---------- The voice: keep every button's words recorded ----------

async function showVoiceStatus() {
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

$('voiceDownload').addEventListener('click', () => recordWords());

// Every word or phrase a button says, across the whole board.
function boardWords() {
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
async function recordWords() {
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
function recordNewWords() {
  clearTimeout(recordTimer);
  recordTimer = setTimeout(recordWords, 3000);
}

// Get the words on screen ready ahead of time, so taps play instantly.
function warmPage() {
  const page = state.pages[pageId] || state.pages[homeId()];
  clips.warm(clips.VOICE, [...page.items, ...stripItems().map(({ it }) => it)].filter((it) => !it.hidden && it.type !== 'folder').map((it) => it.say || it.label));
}

function renderSwatches() {
  $('skinSwatches').replaceChildren(...SKIN_TONES.map((tone) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'swatch';
    b.style.background = tone;
    b.setAttribute('aria-label', 'Skin colour');
    b.setAttribute('aria-pressed', String(tone === state.settings.skin));
    b.addEventListener('click', () => { state.settings.skin = tone; touchSettings(); markChanged(); save(); renderSwatches(); render(); renderStrip(); prefetchToned(); });
    return b;
  }));
}

function bindSetting(id, key, read) {
  $(id).addEventListener('change', (e) => {
    state.settings[key] = read(e.target);
    if (!sync.LOCAL_SETTINGS.includes(key)) { touchSettings(); markChanged(); }
    save();
    render();
  });
}
bindSetting('setCols', 'cols', (el) => Number(el.value));
bindSetting('setRows', 'rows', (el) => Number(el.value));
bindSetting('setSidebar', 'sidebar', (el) => el.checked);
bindSetting('setCorners', 'corners', (el) => Number(el.value));
bindSetting('setOutline', 'outline', (el) => Number(el.value));
bindSetting('setCoreStrip', 'coreStrip', (el) => el.checked);
bindSetting('setLabels', 'labels', (el) => el.checked);
bindSetting('setAutoHome', 'autoHome', (el) => el.checked);
bindSetting('setDebounce', 'debounce', (el) => Number(el.value));
bindSetting('setSpeakTap', 'speakOnTap', (el) => el.checked);

$('testVoice').addEventListener('click', () => speak('Hello! I want to play.').finally(showVoiceStatus));

// The editing computer remembers edit mode across page reloads.
const EDIT_KEY = 'taptalk.editing';
function setEditing(on) {
  editing = on;
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
  if (!editing || sync.config().mode === 'send') return; // not on the editing computer
  editIdleTimer = setTimeout(() => {
    if (document.querySelector('dialog[open]')) armEditTimeout(); // mid-edit: wait
    else setEditing(false);
  }, EDIT_IDLE_MS);
}
['pointerdown', 'keydown'].forEach((ev) => document.addEventListener(ev, () => { if (editing) armEditTimeout(); }, true));

$('startEditing').addEventListener('click', () => { $('settings').close(); setEditing(true); });
$('doneEditing').addEventListener('click', () => setEditing(false));
$('settingsFromBanner').addEventListener('click', openSettings);

// On the editing computer (never seen by Robyn) there's an Edit button in the
// top bar and a keyboard shortcut: E to start or finish, Esc to finish.
$('editToggle').addEventListener('click', () => setEditing(!editing));
$('compactToggle').addEventListener('click', () => {
  try { localStorage.setItem(COMPACT_KEY, compactPref() ? 'off' : 'on'); } catch { /* not important */ }
  render();
});
document.addEventListener('keydown', (e) => {
  if (sync.config().mode !== 'send' || e.metaKey || e.ctrlKey || e.altKey) return;
  if (document.querySelector('dialog[open]') || e.target.closest?.('input, textarea, select, [contenteditable]')) return;
  if (e.key === 'e' || e.key === 'E') { e.preventDefault(); setEditing(!editing); }
  else if (e.key === 'Escape' && editing) setEditing(false);
});

$('resetBtn').addEventListener('click', async () => {
  if (!confirm('Reset to the starting board? Your changes and photos will be removed.')) return;
  replaceBoard(buildDefaultPages(state.settings.childName), { ...DEFAULT_SETTINGS, voice: state.settings.voice, childName: state.settings.childName });
  ensureSets(state.settings); // the starting sets, saved and shared with the reset
  await photos.clear();
  markChanged();
  save();
  sentence = [];
  renderStrip();
  $('settings').close();
  goTo(homeId());
  showWelcome();
});

// The board lives only on this device (unless it's linked), so the Backup tab
// says when this device last saved a backup.
function showLastBackup() {
  let at = 0;
  try { at = Number(localStorage.getItem(BACKUP_KEY)) || 0; } catch { /* ignore */ }
  $('lastBackup').textContent = at ? `Last backup from this device: ${new Date(at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}.` : 'No backup saved from this device yet.';
}
showLastBackup();

// A grown-up sees "Back up" in the editing bar when this device has changes
// newer than its last backup, a month or more after that backup (or with none
// yet). Linked devices don't: their board is kept in the shared repository.
function backupDue() {
  if (sync.config().mode !== 'off') return false;
  try {
    const backup = Number(localStorage.getItem(BACKUP_KEY)) || 0;
    const edit = Number(localStorage.getItem(EDIT_AT_KEY)) || 0;
    return edit > backup && Date.now() - backup > BACKUP_EVERY;
  } catch { return false; }
}
$('backupFromBanner').addEventListener('click', () => $('exportBtn').click());

// First start (and after a reset): who the board is for. Optional; the name
// goes into About me ("Hello, I'm …").
function showWelcome() {
  $('welcomeName').value = state.settings.childName || '';
  $('welcome').showModal();
}
$('welcomeStart').addEventListener('click', () => {
  const name = $('welcomeName').value.trim().replace(/\s+/g, ' ').slice(0, 40);
  state.settings.childName = name;
  touchSettings();
  applyChildName(name);
  markChanged();
  save(); // also keeps a first start from asking again
  render();
  $('welcome').close();
});
$('welcomeName').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('welcomeStart').click(); } });

$('exportBtn').addEventListener('click', async () => {
  const data = {
    app: 'taptalk', version: 1, stateVersion: STATE_VERSION, saved: new Date().toISOString(),
    pages: state.pages, settings: state.settings, deleted: state.deleted, settingsAt: state.settingsAt, photos: await photos.exportAll(),
  };
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  // The child's name in the file name helps a family with more than one board.
  const who = (state.settings.childName || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const name = `taptalk-backup-${who ? who + '-' : ''}${new Date().toISOString().slice(0, 10)}.json`;
  const file = new File([blob], name, { type: 'application/json' });
  try { localStorage.setItem(BACKUP_KEY, String(Date.now())); } catch { /* ignore */ }
  showLastBackup();
  render();
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
    upgradePages(data.pages, data.stateVersion || 1, data.deleted || {});
    let imported = upgradeLook((data.stateVersion || 1) < 5 ? upgradeSettingsToNav(data.settings || {}, data.pages) : data.settings || {}, data.stateVersion || 1);
    imported = addV10Nav(imported, data.pages, data.stateVersion || 1) || imported;
    imported = addV11Nav(imported, data.pages, data.stateVersion || 1) || imported;
    replaceBoard(data.pages, { ...DEFAULT_SETTINGS, ...imported });
    markChanged();
    save();
    $('settings').close();
    goTo(homeId());
  } catch (err) {
    alert('Could not load backup: ' + err.message);
  }
});

// ---------- Sharing the board between devices ----------
//
// Modes: 'send' = the editing computer (sends with the button),
// 'both' = the school iPad (gets changes, and sends its own edits when a
// grown-up taps Done), 'receive' = gets changes only. All merge (merge.js).

const syncStatus = (text) => { $('syncStatus').textContent = text; };
const when = (iso) => (iso ? new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'never');
const linked = () => { const c = sync.config(); return c.mode !== 'off' && c.token ? c : null; };

// Whether this device sends its edits by itself when editing is done
// (default: yes on the school iPad, no on the computer, which has a Send button).
function autoSend(c = sync.config()) {
  return c.autoSend ?? c.mode === 'both';
}
const sendLabel = () => (sync.config().mode === 'send' ? 'Send to tablet' : 'Send changes');

// Called after every board edit: remember there's something to share (and,
// for the backup reminder, when this device last changed the board).
function markChanged() {
  try { localStorage.setItem(EDIT_AT_KEY, String(Date.now())); } catch { /* ignore */ }
  recordNewWords();
  const m = sync.config().mode;
  if (m === 'send' || m === 'both') sync.setConfig({ unsent: true });
}

function fillSyncFields() {
  const c = sync.config();
  $('syncMode').value = c.mode;
  $('syncRepo').value = c.repo;
  $('syncToken').value = c.token;
  $('syncFields').hidden = c.mode === 'off';
  $('syncSend').hidden = c.mode !== 'send' && c.mode !== 'both';
  $('syncSend').textContent = c.mode === 'both' ? 'Send changes now' : 'Send board to tablet';
  $('syncCheck').hidden = c.mode === 'off';
  $('syncAutoRow').hidden = c.mode === 'off';
  $('syncAuto').checked = c.auto;
  $('syncAutoSendRow').hidden = c.mode !== 'send' && c.mode !== 'both';
  $('syncAutoSend').checked = autoSend(c);
  const unsent = c.unsent && c.mode !== 'receive' ? ' · changes not sent yet' : '';
  syncStatus(c.mode === 'off' ? '' : `Last sent: ${when(c.lastSent)} · Last updated: ${when(c.lastReceived)}${unsent}`);
}

$('syncMode').addEventListener('change', (e) => {
  sync.setConfig({ mode: e.target.value, linked: false });
  fillSyncFields();
  render();
  if (e.target.value !== 'off') syncBoard({ manual: true });
});
$('syncRepo').addEventListener('change', (e) => sync.setConfig({ repo: e.target.value.trim() }));
$('syncToken').addEventListener('change', (e) => sync.setConfig({ token: e.target.value.trim(), linked: false }));

let pendingBoard = null;
let syncing = false;

// Only swap the board when Robyn isn't in the middle of something.
function safeToSwap() {
  return !editing && sentence.length === 0 && !document.querySelector('dialog[open]');
}

const localBoard = () => ({ pages: state.pages, deleted: state.deleted, settings: state.settings, settingsAt: state.settingsAt, stateVersion: STATE_VERSION });

// Get the shared board, merge it in, and (if upload) send the result back.
async function syncBoard({ upload = false, manual = false, report = syncStatus } = {}) {
  const c = linked();
  if (!c || syncing || !navigator.onLine) {
    if (manual && !c) report('Add the GitHub token first.');
    return;
  }
  if (!manual && !upload && !c.auto) return; // manual updates only
  syncing = true;
  try {
    if (manual) report(upload ? 'Sending…' : 'Checking…');
    const { board, changedHere, sent, adopted } = await sync.exchange(localBoard(), { upload, progress: manual ? report : () => {} });
    if (sent || upload) sync.setConfig({ unsent: false });
    if (changedHere) { pendingBoard = { ...board, adopt: adopted }; applyPendingBoard(manual || upload); }
    if (manual) {
      report(sent ? 'Sent ' + when(sync.config().lastSent) + '.'
        : changedHere ? 'Updated with the latest changes.' : 'Already up to date.');
    }
    shareRecordings();
  } catch (err) {
    if (manual) report((upload ? 'Could not send: ' : 'Could not check: ') + err.message);
  } finally {
    syncing = false;
  }
}

// The recorded voice travels with the board: fetch recordings this device
// lacks, and share any it made itself. In the background, after a sync.
let sharingClips = false;
async function shareRecordings() {
  if (sharingClips || !linked()) return;
  sharingClips = true;
  try {
    const { got } = await sync.syncClips(boardWords());
    if (got) { warmPage(); if ($('settings').open) showVoiceStatus(); }
  } catch { /* try again on the next sync */ } finally {
    sharingClips = false;
  }
}

function applyPendingBoard(force = false) {
  if (!pendingBoard) return;
  if (!force && !safeToSwap()) { setTimeout(applyPendingBoard, 20_000); return; }
  // Merge again with the board as it is now, so nothing edited in the
  // meantime is lost (except on first link, when this device takes the
  // shared board as it is).
  const board = pendingBoard.adopt ? pendingBoard : merge(localBoard(), pendingBoard);
  const version = pendingBoard.stateVersion || STATE_VERSION;
  pendingBoard = null;
  const before = state.settings.skin;
  const moved = upgradePages(board.pages, version, board.deleted || {});
  state.pages = board.pages;
  state.deleted = { ...board.deleted, ...Object.fromEntries(moved.map((id) => [id, now()])) };
  const keep = Object.fromEntries(sync.LOCAL_SETTINGS.map((k) => [k, state.settings[k]]));
  const settings = upgradeLook(board.settings || {}, version);
  const nav10 = addV10Nav(settings, board.pages, version);
  const nav11 = addV11Nav(nav10 || settings, board.pages, version);
  state.settings = { ...DEFAULT_SETTINGS, ...(nav11 || nav10 || settings), ...keep };
  state.settingsAt = nav10 || nav11 ? now() : board.settingsAt;
  save();
  if (!state.pages[pageId]) { pageId = homeId(); trail = []; }
  render();
  renderStrip();
  if (state.settings.skin !== before) prefetchToned();
  if ($('settings').open) fillSyncFields();
  recordNewWords();
}

// The school iPad shares its edits when a grown-up finishes editing, and keeps
// trying (e.g. after being offline) until they've gone.
function shareIfUnsent() {
  const c = linked();
  if (c && c.mode !== 'receive' && c.unsent && autoSend(c) && !editing) { syncBoard({ upload: true }); return true; }
  return false;
}
// Regular check: share anything waiting (if sending automatically),
// otherwise look for changes.
function syncTick() {
  if (!shareIfUnsent()) syncBoard();
}
window.addEventListener('online', syncTick);

$('syncSend').addEventListener('click', () => syncBoard({ upload: true, manual: true }));
$('sendFromBanner').addEventListener('click', async () => {
  const btn = $('sendFromBanner');
  btn.disabled = true;
  btn.textContent = 'Sending…';
  let last = '';
  await syncBoard({ upload: true, manual: true, report: (t) => { last = t; } });
  btn.textContent = last.startsWith('Sent') ? 'Sent ✓' : 'Not sent';
  btn.title = last;
  btn.disabled = false;
  setTimeout(() => { btn.textContent = sendLabel(); }, 4000);
});
$('syncCheck').addEventListener('click', () => syncBoard({ manual: true }));
// Manual sending: edits wait until someone presses Send.
$('syncAutoSend').addEventListener('change', (e) => {
  sync.setConfig({ autoSend: e.target.checked });
  syncStatus(e.target.checked
    ? 'Changes will be sent when editing is done.'
    : 'Changes will wait until you press Send.');
  render();
  shareIfUnsent();
});
// Manual: the board only changes when a grown-up taps "Check for changes now".
$('syncAuto').addEventListener('change', (e) => {
  sync.setConfig({ auto: e.target.checked });
  syncStatus(e.target.checked
    ? 'Changes will arrive by themselves.'
    : 'The board will only change when you tap Check for changes now.');
  if (e.target.checked) syncBoard({ manual: true });
});

// ---------- Button editor ----------

let draft = null;     // copy of item being edited
let draftIsNew = false;

let editPage = HOME; // the page the button being edited lives on

function openEditor(item, isNew = !item, onPage = pageId) {
  editPage = state.pages[onPage] ? onPage : pageId;
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

function renderPreview() {
  draft.label = $('edLabel').value;
  $('editPicture').hidden = !draft.sym?.startsWith('u:');
  const t = tileFor({ ...draft, label: draft.label || 'word', hidden: false });
  t.classList.add('preview-tile');
  t.disabled = true;
  $('previewTile').replaceWith(t);
  t.id = 'previewTile';
}

$('edLabel').addEventListener('input', renderPreview);

$('pickSymbol').addEventListener('click', () => openPicker($('edLabel').value));

// ---------- Make a picture with AI ----------
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

const photoStatus = (text) => { $('photoStatus').textContent = text; };

// New photos open in the picture editor first, so they fit the button neatly.
async function usePhoto(blob, cropOpts) {
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
// Google Photos only works for accounts the Google project lets in, so it shows
// only on devices linked to a shared board (the developer's own family).
function googlePhotosReady() { return gphotos.enabled && sync.config().mode !== 'off'; }
$('googlePhotos').hidden = !googlePhotosReady();
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
  openSheet(dlg);
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

// ---------- Copy, cut and paste buttons ----------
// Copy or Cut in the button editor; then, on any page, tap Paste here in the
// bar at the bottom (or press Cmd/Ctrl+V on the computer). Copy can be pasted many times; Cut
// moves the button when it's pasted. Kept until editing ends.

const CLIP_KEY = 'taptalk.clip';

function readClip() {
  try { return JSON.parse(sessionStorage.getItem(CLIP_KEY)); } catch { return null; }
}
function clearClip() {
  try { sessionStorage.removeItem(CLIP_KEY); } catch { /* not important */ }
}
function setClip(clip) {
  try { sessionStorage.setItem(CLIP_KEY, JSON.stringify(clip)); } catch { /* not important */ }
  render();
  offerUndo(`Now go to a page and tap ${clip.cut ? 'Move here' : 'Paste here'}`, null);
}

// The bar at the bottom while a copied or cut button waits to be pasted.
function showClipBar(clip) {
  $('clipBar').hidden = !clip;
  document.body.classList.toggle('has-clip', Boolean(clip));
  if (!clip) return;
  const img = $('clipImg');
  if (clip.item.sym) { img.hidden = false; setSymbol(img, clip.item.sym); } else img.hidden = true;
  $('clipText').textContent = `${clip.cut ? 'Moving' : 'Copied'} “${clip.item.label}”`;
  $('clipPaste').textContent = clip.cut ? 'Move here' : 'Paste here';
}
$('clipPaste').addEventListener('click', () => pasteClip());
$('clipClear').addEventListener('click', () => { clearClip(); render(); });

function pasteClip() {
  const clip = readClip();
  const page = state.pages[pageId];
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
  const where = pageId;
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

document.addEventListener('keydown', (e) => {
  if (!editing || !(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'v') return;
  if (document.querySelector('dialog[open]') || /input|textarea|select/i.test(e.target.tagName) || !readClip()) return;
  e.preventDefault();
  pasteClip();
});

// ---------- Undo and recently deleted ----------
// No "are you sure?" pop-ups: every change can be undone straight away, and
// deleted buttons can be restored later from Settings.

const TRASH_KEY = 'taptalk.trash';
const TRASH_MAX = 30;
let undoAction = null;
let undoTimer = 0;

function readTrash() {
  try { return JSON.parse(localStorage.getItem(TRASH_KEY)) || []; } catch { return []; }
}
function writeTrash(list) {
  try { localStorage.setItem(TRASH_KEY, JSON.stringify(list.slice(0, TRASH_MAX))); } catch { /* full: not vital */ }
}

function offerUndo(text, undo) {
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
$('undoBtn').addEventListener('click', () => {
  const undo = undoAction;
  undoAction = null;
  $('undoBar').hidden = true;
  undo?.();
});

// After an undo or restore: save, show it, and share it like any edit.
function afterRestore() {
  markChanged();
  save();
  render();
  shareIfUnsent();
}

// Puts a deleted button back. Marking it as just edited makes it win over
// its deletion on the other device too.
function restoreButton(entry) {
  const page = state.pages[entry.pageId] || state.pages[HOME];
  if (!page.items.some((it) => it.id === entry.item.id)) {
    page.items.splice(Math.min(entry.index, page.items.length), 0, { ...entry.item, updatedAt: now() });
  }
  writeTrash(readTrash().filter((t) => t.item.id !== entry.item.id));
  afterRestore();
}

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

// onChosen: give the chosen picture to someone else (e.g. a page's picture in
// the Page manager) instead of the button being edited.
let pickerTarget = null;
async function openPicker(query, onChosen = null) {
  pickerTarget = onChosen;
  $('pickerSearch').value = query || '';
  openSheet($('picker'));
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
    let sym;
    try {
      sym = await onPick();
    } catch {
      alert('Could not get that picture. Check the internet connection and try again.');
      return;
    }
    const target = pickerTarget;
    pickerTarget = null;
    $('picker').close();
    if (target) { if (sym) target(sym); return; }
    if (!$('edLabel').value) $('edLabel').value = words;
    if (sym) { draft.sym = sym; renderPreview(); }
  });
  return b;
}

function pickerHeading(text) {
  const h = document.createElement('h4');
  h.className = 'picker-heading';
  h.textContent = text;
  return h;
}

// Photos from around the web, through Openverse (openverse.org): a free,
// keyless search of ~800 million images from Flickr, Wikimedia and others,
// whose image proxy lets the app download the one you pick.
const OPENVERSE = 'https://api.openverse.org/v1/images/';
const webCache = new Map(); // query -> results (keeps within Openverse's free limits)

async function searchWeb(q) {
  const key = q.trim().toLowerCase();
  if (!webCache.has(key)) {
    webCache.set(key, (async () => {
      const res = await fetch(`${OPENVERSE}?q=${encodeURIComponent(key)}&page_size=20&mature=false`);
      if (res.status === 429) throw new Error('busy');
      if (!res.ok) throw new Error(res.status);
      return (await res.json()).results.map((r) => ({ id: r.id, title: r.title || key, url: r.url }));
    })());
    webCache.get(key).catch(() => webCache.delete(key));
  }
  return webCache.get(key);
}

// Most results are on Flickr, whose own servers are much faster than going
// through Openverse and offer ready-made sizes (n = 320px, c = 800px, b = 1024px).
const FLICKR = /^(https:\/\/live\.staticflickr\.com\/\d+\/\d+_[0-9a-f]+)(?:_[a-z0-9])?\.jpg$/;
const flickrSize = (url, size) => (FLICKR.test(url || '') ? url.replace(FLICKR, `$1_${size}.jpg`) : '');

function webThumb(p) {
  return flickrSize(p.url, 'n') || `${OPENVERSE}${p.id}/thumb/`;
}

// Picked web photos go through the picture editor, like any other photo.
async function pickWebPhoto(p) {
  const tries = [flickrSize(p.url, 'b'), flickrSize(p.url, 'c'), `${OPENVERSE}${p.id}/thumb/?full_size=true`, `${OPENVERSE}${p.id}/thumb/`];
  for (const url of tries.filter(Boolean)) {
    try {
      const res = await fetch(url);
      const blob = res.ok && (await res.blob());
      if (blob?.type.startsWith('image/')) { usePhoto(blob); return null; }
    } catch { /* try the next size */ }
  }
  throw new Error('no copy of that photo could be downloaded');
}

let webTimer = 0;

$('pickerGoogle').addEventListener('click', () => {
  const q = $('pickerSearch').value.trim() || $('edLabel').value.trim();
  window.open('https://www.google.com/search?tbm=isch&q=' + encodeURIComponent(q), '_blank', 'noopener');
  $('pickerGoogle').textContent = 'Copy a picture there, then paste here';
  setTimeout(() => { $('pickerGoogle').textContent = 'Google Images ↗'; }, 8000);
});

async function renderPicker() {
  const run = ++pickerRun;
  const q = $('pickerSearch').value;
  const index = await getIndex();
  const mulberry = searchSymbols(index, q).slice(0, q.trim() ? 60 : 150);
  const g = $('pickerGrid');

  const arasaacBox = document.createElement('div');
  arasaacBox.className = 'picker-section';
  const webBox = document.createElement('div');
  webBox.className = 'picker-section';
  // ARASAAC first (the board's own style), then photos, then Mulberry, which also works offline.
  const parts = q.trim() ? [arasaacBox, webBox] : [];
  if (mulberry.length) {
    parts.push(pickerHeading('Mulberry'), ...mulberry.map((s) => {
      const sym = (s.custom ? 'c:' : 'm:') + s.name;
      return pickButton(rawSymbolUrl(sym), s.words, async () => sym);
    }));
  }
  g.replaceChildren(...parts);
  g.scrollTop = 0;
  if (!q.trim()) return;

  // Photos load a moment after typing stops, so each keystroke isn't a search.
  const webNote = (text) => Object.assign(document.createElement('p'), { className: 'picker-empty', textContent: text });
  webBox.replaceChildren(pickerHeading('Photos'), webNote('Searching for photos… this can take a few seconds.'));
  clearTimeout(webTimer);
  webTimer = setTimeout(async () => {
    let shown = [webNote('Connect to the internet to see photos.')];
    if (navigator.onLine) {
      try {
        const found = await searchWeb(q);
        shown = found.length
          ? found.map((p) => {
            const b = pickButton(webThumb(p), p.title, () => pickWebPhoto(p));
            b.querySelector('img').onerror = () => b.remove(); // photo no longer online
            return b;
          })
          : [webNote('No photos found for this word.')];
      } catch (err) {
        shown = [note(err.message === 'busy' ? 'Photo search is busy — wait a minute and try again.' : 'Photos could not be loaded right now.')];
      }
    }
    if (run !== pickerRun) return;
    webBox.replaceChildren(pickerHeading('Photos'),
      Object.assign(document.createElement('p'), { className: 'picker-note', textContent: 'From Openverse. Not here? Use Google Images ↗, copy a picture, and paste it.' }),
      ...shown);
  }, 700);

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

  if (!found.length && !note) note = 'No ARASAAC pictures for this word.';
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
$('picker').addEventListener('close', () => { pickerTarget = null; });

// ---------- Start up ----------

function isStandalone() {
  return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
}

if ('speechSynthesis' in window) {
  loadVoices();
  speechSynthesis.addEventListener?.('voiceschanged', loadVoices);
}
// iPads only let sound start from a tap, so wake the audio on the first one.
// iPads only let sound start from a tap: wake the recordings' audio, and the
// backup iPad voice too (by saying nothing), so either can speak later even
// after a short wait. Done on touch-end/click too, which some iPads require.
let speechUnlocked = false;
function unlockSound() {
  clips.unlock();
  if (!speechUnlocked && 'speechSynthesis' in window) {
    speechUnlocked = true;
    const u = new SpeechSynthesisUtterance(' ');
    u.volume = 0;
    speechSynthesis.speak(u);
  }
}
for (const ev of ['pointerdown', 'touchend', 'click']) document.addEventListener(ev, unlockSound, { capture: true, passive: true });
// Record any words not yet recorded (e.g. buttons added on the other device).
setTimeout(recordWords, 4000);

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  // updateViaCache 'none': when checking for a new version, fetch the file
  // list (precache.js) fresh too, never a stale HTTP-cached copy.
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then((reg) => reg.update()).catch(() => {});
  // When a new version takes over, reload into it — but only when nobody is
  // mid-sentence or editing, so the board never changes under Robyn's finger.
  if (navigator.serviceWorker.controller) {
    navigator.serviceWorker.addEventListener('controllerchange', function reloadWhenSafe() {
      if (safeToSwap()) location.reload();
      else setTimeout(reloadWhenSafe, 20_000);
    });
  }
}
navigator.storage?.persist?.();

initCropper();
try { if (sync.config().mode === 'send' && sessionStorage.getItem(EDIT_KEY)) editing = true; } catch { /* ignore */ }
render();
renderStrip();
if (state.fresh) showWelcome();

syncTick();
setInterval(syncTick, 5 * 60_000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncTick(); });

// Back from Google sign-in: reopen the editor where we left it and carry on.
const back = gphotos.takeResume();
if (back?.resume?.draft) {
  const { resume } = back;
  pageId = state.pages[resume.pageId] ? resume.pageId : homeId();
  editing = true;
  render();
  openEditor(resume.draft, resume.draftIsNew);
  if (back.ok) pickFromGoogle();
  else if (back.error !== 'access_denied') alert('Google sign-in did not work: ' + back.error);
}

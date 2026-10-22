// Drawing the board: the grid of buttons, video buttons, the sentence bar
// and the left-hand column of pages.
import { HOME } from './board.js';
import * as sync from './sync.js';
import { openSheet } from './sheet.js';
import { $ } from './util.js';
import { touchSettings, state, allSets, activeSet, navIds, homeId, save, ui } from './state.js';
import { setSymbol } from './symbols.js';
import { goTo, goBack, renderCoreBar } from './interaction.js';
import { warmPage } from './voice.js';
import { backupDue } from './backup.js';
import { autoSend, sendLabel, markChanged } from './sharing.js';
import { googlePhotosReady } from './editor.js';
import { readClip, showClipBar } from './clipboard.js';
import { offerUndo, afterRestore } from './undo.js';

export const grid = $('grid');

export function render() {
  const page = state.pages[ui.pageId] || state.pages[homeId()];
  document.documentElement.classList.toggle('no-labels', !state.settings.labels);
  document.documentElement.style.setProperty('--btn-radius', state.settings.corners + 'px');
  document.documentElement.style.setProperty('--btn-line', state.settings.outline + 'px');
  document.documentElement.classList.toggle('compact', isCompact());
  document.body.classList.toggle('editing', ui.editing);
  $('editBanner').hidden = !ui.editing;
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
  $('editToggle').setAttribute('aria-pressed', String(ui.editing));
  $('editToggleText').textContent = ui.editing ? 'Done' : 'Edit';
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
  if (ui.pageId !== homeId() && !state.settings.sidebar) frag.append(backTile());
  // Hidden buttons keep their space so nothing else moves (motor planning).
  for (const item of page.items) frag.append(item.hidden && !ui.editing ? gapTile() : tileFor(item));
  if (ui.editing) frag.append(addTile());
  const clip = ui.editing && readClip();
  showClipBar(clip);
  if (clip?.cut) frag.querySelector(`.tile[data-id="${clip.item.id}"]`)?.classList.add('cut-pending');

  grid.replaceChildren(frag);
  sizeRows();
  if (!ui.editing) warmPage();
}

// ---------- Video buttons ----------
// A button can play a YouTube video (e.g. Mr Tumble): tapping it says the word
// and opens the video full screen, with a big Close.

// The video's id from any YouTube link (or an id on its own), else ''.
export function videoId(text) {
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
export const videoUrl = (id) => 'https://youtu.be/' + id;

export function openVideo(id) {
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

export function tileFor(item) {
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
export const COMPACT_KEY = 'taptalk.compact';
export function compactPref() {
  try { return localStorage.getItem(COMPACT_KEY) !== 'off'; } catch { return true; }
}
function isCompact() {
  return ui.editing && compactPref() && sync.config().mode === 'send';
}

export function sizeRows() {
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

export function renderStrip() {
  const wrap = $('stripWords');
  wrap.replaceChildren(...ui.sentence.map((w) => {
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

export function navIcon(id) {
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
  back.disabled = ui.pageId === homeId();
  back.addEventListener('click', goBack);
  parts.push(back);
  for (const id of navIds()) {
    const page = state.pages[id];
    if (!page) continue;
    const b = navButton(page.name, navIcon(id), 'nav-page');
    if (id === ui.pageId) b.setAttribute('aria-current', 'page');
    b.addEventListener('click', () => goTo(id, { fromNav: true }));
    if (ui.editing) {
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
  if (ui.editing) {
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

export function init() {
  $('videoClose').addEventListener('click', closeVideo);
  $('videoPlayer').addEventListener('close', () => $('videoFrame').replaceChildren());
  $('navPickerClose').addEventListener('click', () => $('navPicker').close());
}

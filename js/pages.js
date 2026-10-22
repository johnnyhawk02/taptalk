// Pages: making a page from a list of words, and the Page manager (page
// sets, renaming, copying and deleting pages).
import { HOME } from './board.js';
import * as photos from './photos.js';
import { openSheet } from './sheet.js';
import { $, uid, now } from './util.js';
import { touchSettings, state, allSets, SET_KEY, activeSet, homeId, save, ui } from './state.js';
import { setSymbol } from './symbols.js';
import { grid, render, navIcon } from './render.js';
import { goTo } from './interaction.js';
import { markChanged } from './sharing.js';
import { offerUndo, afterRestore } from './undo.js';
import { getIndex, searchSymbols, openPicker, arasaacImg, searchArasaac } from './picker.js';

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
  ui.pageId = homeId();
  ui.trail = [];
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
  ui.trail = ui.trail.filter((t) => t !== id);
  if (ui.pageId === id) ui.pageId = homeId();
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

export function init() {
  $('openPageMaker').addEventListener('click', openPageMaker);
  $('pageWords').addEventListener('input', showPagePreview);
  $('pageMake').addEventListener('click', makePage);
  $('pageMakerClose').addEventListener('click', () => $('pageMaker').close());

  $('pagesFromBanner').addEventListener('click', () => openPageManager());
  $('pmClose').addEventListener('click', () => $('pageManager').close());
  for (const t of document.querySelectorAll('#pageManager [data-pm]')) {
    t.addEventListener('click', () => { pmTab = t.dataset.pm; pmAdding = false; pmRenaming = null; renderPM(); });
  }
}

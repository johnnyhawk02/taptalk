// The board (pages, buttons and settings) and saving it, page sets, and
// `ui`: what is on screen right now, shared by every part of the app.
import { DEFAULT_PAGES, DEFAULT_NAV, DEFAULT_SETS, HOME } from './board.js';
import { STATE_VERSION, buildDefaultPages, upgradeStored } from './upgrades.js';
import { VERSION, BUILT } from './version.js';
import { $, now } from './util.js';

const STORE_KEY = 'taptalk.v1';
export const DEFAULT_SKIN = '#ffeec8';

export const DEFAULT_SETTINGS = {
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

// Puts the child's name into the button(s) made from {name} words, adding
// them if they aren't there yet (e.g. a name given after the board was made).
export function applyChildName(name) {
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
export const touchSettings = () => { state.settingsAt = now(); };

// Replace the whole board (reset / load backup) in a way that also wins when
// merged with other devices: old buttons and pages become deletions, and
// everything new counts as just edited.
export function replaceBoard(pages, settings) {
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

export const state = loadState();

// ---------- Page sets ----------
// A set is a named list of pages for the left-hand column, with its own Home
// page (e.g. "Everyday", "School"). Sets are shared between devices; which
// set is showing is chosen on each device. Boards from before sets get one
// set, "Everyday", holding their column (same id everywhere, so devices agree).
export function ensureSets(settings) {
  if (Array.isArray(settings.sets) && settings.sets.length) return;
  const nav = Array.isArray(settings.nav) ? settings.nav : DEFAULT_NAV;
  // The starting board gets the starting sets; a board with its own column keeps it as Everyday.
  settings.sets = nav.join() === DEFAULT_NAV.join()
    ? DEFAULT_SETS.map((x) => ({ ...x, nav: x.nav.filter((id) => state.pages[id]) })).filter((x) => state.pages[x.home])
    : [{ id: 's-everyday', name: 'Everyday', nav: [...nav], home: HOME }];
}
export function allSets() { ensureSets(state.settings); return state.settings.sets; }
// Which set this device shows is kept apart from the board, so sharing the
// board with another device can never change it.
export const SET_KEY = 'taptalk.activeSet';
function showingSetId() {
  try { return localStorage.getItem(SET_KEY) || state.settings.activeSet || ''; } catch { return state.settings.activeSet || ''; }
}
export function activeSet() {
  const sets = allSets();
  return sets.find((x) => x.id === showingSetId()) || sets[0];
}
export const navIds = () => activeSet().nav;
// This set's Home page (the house button, Back from the first page, …).
export function homeId() {
  const h = activeSet().home;
  return h && state.pages[h] ? h : HOME;
}
// What is on screen right now. Every part of the app reads and changes these.
export const ui = {
  pageId: homeId(),
  editing: false,
  sentence: [], // the words in the sentence bar: [{label, say, sym, type}]
  // Pages opened from other pages remember the way back, so "back" on
  // School returns to Places rather than Home.
  trail: [],
};

export function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({
      version: STATE_VERSION, pages: state.pages, settings: state.settings, deleted: state.deleted, settingsAt: state.settingsAt,
    }));
  } catch (err) {
    alert('Could not save changes: ' + err.message);
  }
}

export function init() {
  // While TapTalk is being developed, show which version is running.
  $('appVersion').textContent = `v ${VERSION} · ${BUILT}`;
  $('aboutVersion').textContent = `TapTalk version ${VERSION} (${BUILT}).`;
  if (state.upgraded) { delete state.upgraded; save(); }
}

// The starting board, and the upgrades that bring a board saved by an older
// version of TapTalk (on this device, in a backup, or from another device) up
// to date. Everything here works on plain data, with no screen or storage, so
// it can be tested on its own (tests/upgrades.test.mjs).
import { DEFAULT_PAGES, DEFAULT_NAV, HOME } from './board.js';
import { TO_ARASAAC } from './migrate.js';

export const STATE_VERSION = 12; // 2 = ARASAAC pictures, 3 = place pages, 4 = Fun page, 5 = left-hand page column, 6 = core strip, 7 = flat buttons, 8 = core strip words restored, 9 = 5 × 4 grid, 10 = Describe/Body/Animals/Colours in the column, 11 = My choice, I need, Funny, Time, About me + more words, 12 = School split into smaller pages

// `name` is the child's name, put into the starting words that use {name}
// (those are left out without one).
export function buildDefaultPages(name = '') {
  const pages = {};
  const fill = (text) => (text || '').replaceAll('{name}', name);
  for (const [pageId, page] of Object.entries(DEFAULT_PAGES)) {
    pages[pageId] = {
      name: page.name,
      ...(page.stay && { stay: true }),
      ...(page.icon && { icon: page.icon }),
      // Stable ids (from the word, before the name goes in), so the starting
      // board is the same on every device.
      items: page.items.map(([label, sym, type, extra = {}], i, all) => {
        const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        const dup = all.slice(0, i).some(([l]) => l.toLowerCase().replace(/[^a-z0-9]+/g, '-') === slug);
        return { id: `d-${pageId}-${slug}${dup ? '-' + i : ''}`, label: fill(label), sym, type, say: fill(extra.say), link: extra.link || '', hidden: false, ...(extra.strip && { strip: true }) };
      }).filter((it, i) => name || !page.items[i][0].includes('{name}')),
    };
  }
  return pages;
}

// Brings a board saved on this device by any older version of TapTalk up to
// date. Returns null when `raw` isn't a saved board. Buttons the upgrades
// take away are marked deleted, so sharing can't bring them back.
export function upgradeStored(raw) {
  if (!raw?.pages?.[HOME]) return null;
  const removed = upgradePages(raw.pages, raw.version || 1, raw.deleted || {});
  raw.deleted = { ...raw.deleted, ...Object.fromEntries(removed.map((id) => [id, Date.now()])) };
  if ((raw.version || 1) < 5) raw.settings = upgradeSettingsToNav(raw.settings || {}, raw.pages);
  raw.settings = upgradeLook(raw.settings || {}, raw.version || 1);
  const nav10 = addV10Nav(raw.settings, raw.pages, raw.version || 1);
  if (nav10) { raw.settings = nav10; raw.settingsAt = Date.now(); }
  const nav11 = addV11Nav(raw.settings, raw.pages, raw.version || 1);
  if (nav11) { raw.settings = nav11; raw.settingsAt = Date.now(); }
  return {
    pages: raw.pages,
    settings: raw.settings,
    deleted: raw.deleted || {},
    settingsAt: raw.settingsAt || 0,
    upgraded: (raw.version || 1) < STATE_VERSION,
  };
}

// Older boards (and backups) used Mulberry pictures. Swap the ones nobody has
// changed for their ARASAAC versions; leave edited buttons alone.
export function upgradePages(pages, version, deleted = {}) {
  if (version < 2) {
    for (const page of Object.values(pages)) {
      for (const item of page.items) {
        const to = TO_ARASAAC[item.label + '|' + item.sym];
        if (to) item.sym = to;
      }
    }
  }
  if (version < 4) addMissingPages(pages);
  const removed = version < 5 ? movePagesToSideColumn(pages, DEFAULT_NAV) : version < 10 ? movePagesToSideColumn(pages, NAV_V10) : [];
  if (version < 8) markStripWords(pages);
  if (version < 11) addNewWords(pages, deleted);
  if (version < 12) removed.push(...splitSchool(pages, deleted, version));
  return removed;
}

// v12: School had grown to 40-odd buttons, so most move to three smaller
// pages it opens (In class, Lessons, My day). Each button keeps its picture
// and words, under the starting board's id for its new page (so every device
// that upgrades agrees); the old ids are returned to be marked deleted, so
// a copy from a device not yet upgraded can't bring them back to School.
// Buttons the grown-ups added stay on School; deleted words stay deleted.
// Boards from before v11 also get v11's new school words here.
const SCHOOL_PAGES = ['schoolclass', 'lessons', 'schoolday'];
function splitSchool(pages, deleted, version) {
  const school = pages.school;
  if (!school) return [];
  const at = Date.now();
  const defaults = buildDefaultPages();
  const removed = [];
  for (const id of SCHOOL_PAGES) {
    if (deleted['page:' + id]) continue;
    const want = new Map(defaults[id].items.map((it) => [it.label.toLowerCase(), it]));
    const moving = school.items.filter((it) => it.type !== 'folder' && want.has(it.label.toLowerCase()));
    const has = new Set([...moving, ...(pages[id]?.items || [])].map((it) => it.label.toLowerCase()));
    const fresh = version < 11 ? [...want.values()].filter((it) => !has.has(it.label.toLowerCase())
      && !deleted[it.id] && !deleted['d-school-' + it.id.slice(id.length + 3)]) : [];
    const created = !pages[id];
    if (created) {
      if (!moving.length && !fresh.length) continue;
      pages[id] = { ...defaults[id], items: [], updatedAt: at, orderAt: at };
    }
    const page = pages[id];
    const there = new Set(page.items.map((it) => it.label.toLowerCase()));
    // In the new page's starting order.
    const order = [...want.keys()];
    moving.sort((a, b) => order.indexOf(a.label.toLowerCase()) - order.indexOf(b.label.toLowerCase()));
    for (const it of moving) {
      const key = it.label.toLowerCase();
      if (!there.has(key)) { page.items.push({ ...it, id: want.get(key).id, updatedAt: at }); there.add(key); }
      removed.push(it.id);
    }
    page.items.push(...fresh.map((it) => ({ ...it, updatedAt: at })));
    if (created) page.items.sort((a, b) => order.indexOf(a.label.toLowerCase()) - order.indexOf(b.label.toLowerCase()));
    page.orderAt = at;
  }
  const gone = new Set(removed);
  school.items = school.items.filter((it) => !gone.has(it.id));
  // The three page buttons go at the front of School.
  const links = defaults.school.items.filter((it) => it.type === 'folder' && pages[it.link]
    && !school.items.some((mine) => mine.link === it.link) && !deleted[it.id]);
  school.items.unshift(...links.map((it) => ({ ...it, updatedAt: at })));
  school.orderAt = at;
  return removed;
}

// v11: new pages (My choice, I need, Funny, Time, About me) and new words on
// existing pages. Only ever adds: new buttons go at the end of a page so
// nothing Robyn knows moves, and a word someone deleted (or already moved to
// another page) isn't put back. Stamped as just changed so sharing keeps them.
function addNewWords(pages, deleted) {
  const at = Date.now();
  const defaults = buildDefaultPages();
  const everywhere = new Set(Object.values(pages).flatMap((p) => p.items.map((it) => it.id)));
  for (const [id, page] of Object.entries(defaults)) {
    if (SCHOOL_PAGES.includes(id)) continue; // splitSchool (v12) makes these from School's own buttons
    if (!pages[id]) {
      if (deleted['page:' + id]) continue;
      pages[id] = { ...page, updatedAt: at, items: page.items.map((it) => ({ ...it, updatedAt: at })) };
      continue;
    }
    const mine = pages[id];
    const labels = new Set(mine.items.map((it) => it.label.toLowerCase()));
    const add = page.items.filter((it) => !SCHOOL_PAGES.includes(it.link) && !everywhere.has(it.id) && !deleted[it.id] && !labels.has(it.label.toLowerCase()));
    if (!add.length) continue;
    mine.items.push(...add.map((it) => ({ ...it, updatedAt: at })));
    mine.orderAt = at;
  }
}

// v6/v8: mark the starting core words (by word, on Home) for the core strip.
// Only buttons nobody has edited are marked, so a word someone took out of the
// strip stays out. They're stamped as just changed so the marks win when the
// board is merged with another device (v6 didn't, and the marks got lost).
function markStripWords(pages) {
  const words = DEFAULT_PAGES.home.items.filter(([, , , extra]) => extra?.strip).map(([label]) => label);
  const at = Date.now();
  for (const it of pages[HOME]?.items || []) {
    if (words.includes(it.label) && !it.strip && !it.updatedAt) { it.strip = true; it.updatedAt = at; }
  }
}

// v5: Food, Drinks, Play, Feelings, People and Places live in the left-hand
// column, so their buttons come off the Home grid (their pictures become the
// column icons). Returns the removed buttons' ids.
// v10: Describe, Body, Animals and Colours moved there too, so Home fits a
// 5 × 4 grid.
const NAV_V10 = ['describe', 'body', 'animals', 'colours'];

function movePagesToSideColumn(pages, ids) {
  const home = pages[HOME];
  if (!home) return [];
  const removed = [];
  home.items = home.items.filter((it) => {
    if (it.type !== 'folder' || !ids.includes(it.link) || !pages[it.link]) return true;
    pages[it.link].icon ||= it.sym;
    removed.push(it.id);
    return false;
  });
  for (const id of ids) if (pages[id] && !pages[id].icon) pages[id].icon = DEFAULT_PAGES[id]?.icon;
  return removed;
}

// v10: put the moved pages in the column, after the starting pages and
// before any the grown-ups added. Returns null when nothing changes.
export function addV10Nav(settings, pages, version) {
  if (version >= 10 || version < 5) return null;
  const nav = [...(settings.nav || [])];
  const add = NAV_V10.filter((id) => pages[id] && !nav.includes(id));
  if (!add.length) return null;
  let at = 0;
  nav.forEach((id, i) => { if (DEFAULT_NAV.includes(id)) at = i + 1; });
  nav.splice(at, 0, ...add);
  return { ...settings, nav };
}

// v11: My choice and I need go in the column after Feelings (in the Everyday
// set, and the old single column for older copies of TapTalk).
const NAV_V11 = ['needs', 'choice'];
export function addV11Nav(settings, pages, version) {
  if (version >= 11 || version < 5) return null;
  const place = (nav) => {
    const add = NAV_V11.filter((id) => pages[id] && !nav.includes(id));
    if (!add.length) return null;
    const out = [...nav];
    const f = out.indexOf('feelings');
    out.splice(f >= 0 ? f + 1 : out.length, 0, ...add);
    return out;
  };
  let changed = false;
  const next = { ...settings };
  const nav = place(settings.nav || []);
  if (nav) { next.nav = nav; changed = true; }
  if (Array.isArray(settings.sets)) {
    next.sets = settings.sets.map((x) => {
      if (x.id !== 's-everyday') return x;
      const n = place(x.nav || []);
      if (!n) return x;
      changed = true;
      return { ...x, nav: n };
    });
  }
  return changed ? next : null;
}

// v7: buttons became flat (no outline, slightly rounded). Boards still on the
// old look (rounded, medium outline) move to the new one; a chosen look stays.
// v9: the grid became 5 across × 4 down; boards still on the old 5 × 5 move too.
export function upgradeLook(settings, version) {
  let s = settings;
  if (version < 7 && (s.corners ?? 18) === 18 && (s.outline ?? 4) === 4) s = { ...s, corners: 8, outline: 0 };
  if (version < 9 && (s.cols ?? 5) === 5 && (s.rows ?? 5) === 5) s = { ...s, cols: 5, rows: 4 };
  return s;
}

export function upgradeSettingsToNav(settings, pages) {
  return {
    ...settings,
    cols: !settings.cols || settings.cols === 6 ? 5 : settings.cols, // 6 was the old default
    rows: settings.rows || 5,
    sidebar: settings.sidebar ?? true,
    nav: settings.nav || DEFAULT_NAV.filter((id) => pages[id]),
  };
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

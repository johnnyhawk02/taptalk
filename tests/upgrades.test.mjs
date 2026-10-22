// Board upgrades: a board saved by an older TapTalk must come up to date
// without losing anything the grown-ups changed.  Run: node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STATE_VERSION, buildDefaultPages, upgradeStored, upgradeLook } from '../js/upgrades.js';
import { DEFAULT_PAGES, HOME } from '../js/board.js';
import { TO_ARASAAC } from '../js/migrate.js';

const saved = (version, pages = buildDefaultPages(), settings = {}) => ({ version, pages, settings, deleted: {}, settingsAt: 0 });

test('the starting board has the same ids on every device', () => {
  assert.deepEqual(buildDefaultPages(), buildDefaultPages());
  const ids = Object.values(buildDefaultPages()).flatMap((p) => p.items.map((it) => it.id));
  assert.equal(new Set(ids).size, ids.length, 'ids are unique');
});

test('{name} words are left out without a name and filled in with one', () => {
  const words = Object.values(DEFAULT_PAGES).flatMap((p) => p.items.map(([label]) => label)).filter((l) => l.includes('{name}'));
  const labels = (pages) => Object.values(pages).flatMap((p) => p.items.map((it) => it.label));
  assert.ok(!labels(buildDefaultPages()).some((l) => l.includes('{name}')));
  if (words.length) assert.ok(labels(buildDefaultPages('Robyn')).some((l) => l.includes('Robyn')));
});

test('something that is not a board is not upgraded', () => {
  assert.equal(upgradeStored(null), null);
  assert.equal(upgradeStored({ pages: {} }), null);
});

test('a current board comes back unchanged', () => {
  const pages = buildDefaultPages();
  const out = upgradeStored(structuredClone(saved(STATE_VERSION, pages, { cols: 6 })));
  assert.deepEqual(out.pages, pages);
  assert.deepEqual(out.settings, { cols: 6 });
  assert.equal(out.upgraded, false);
});

test('v1: unchanged Mulberry pictures become ARASAAC ones', () => {
  const [key, to] = Object.entries(TO_ARASAAC)[0];
  const [label, sym] = key.split('|');
  const pages = buildDefaultPages();
  pages[HOME].items.push({ id: 'old', label, sym, type: 'noun' });
  const out = upgradeStored(saved(1, pages));
  assert.equal(out.pages[HOME].items.find((it) => it.id === 'old').sym, to);
  assert.equal(out.upgraded, true);
});

test('v4: page buttons on Home move to the column and are marked deleted', () => {
  const pages = buildDefaultPages();
  pages[HOME].items.push({ id: 'food-btn', label: 'Food', sym: 'a:1', type: 'folder', link: 'food' });
  const out = upgradeStored(saved(4, pages));
  assert.ok(!out.pages[HOME].items.some((it) => it.id === 'food-btn'));
  assert.ok(out.deleted['food-btn'] > 0);
  assert.ok(out.pages.food.icon);
});

test('v11: School is split into smaller pages, keeping its buttons', () => {
  const pages = buildDefaultPages();
  for (const id of ['schoolclass', 'lessons', 'schoolday']) {
    pages.school.items.push(...pages[id].items.map((it) => ({ ...it, id: 'old-' + it.id })));
    delete pages[id];
  }
  pages.school.items = pages.school.items.filter((it) => it.type !== 'folder');
  const out = upgradeStored(saved(11, pages));
  for (const id of ['schoolclass', 'lessons', 'schoolday']) assert.ok(out.pages[id]?.items.length, id);
  assert.ok(Object.keys(out.deleted).some((id) => id.startsWith('old-')));
  assert.ok(!out.pages.school.items.some((it) => it.id.startsWith('old-')));
});

test('old look moves to the new one, a chosen look stays', () => {
  assert.deepEqual(upgradeLook({ corners: 18, outline: 4, cols: 5, rows: 5 }, 6), { corners: 8, outline: 0, cols: 5, rows: 4 });
  assert.deepEqual(upgradeLook({ corners: 12, outline: 2, cols: 6, rows: 5 }, 6), { corners: 12, outline: 2, cols: 6, rows: 5 });
});

// Merging two devices' boards: newest change wins, deletions are kept.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { merge, fingerprint } from '../js/merge.js';

const btn = (id, label, updatedAt = 0) => ({ id, label, sym: 'a:1', type: 'noun', updatedAt });
const board = (items, extra = {}) => ({ pages: { home: { name: 'Home', items } }, deleted: {}, settings: {}, settingsAt: 0, ...extra });

test('the newer edit of a button wins, from either side', () => {
  const a = board([btn('x', 'old', 1)]);
  const b = board([btn('x', 'new', 2)]);
  assert.equal(merge(a, b).pages.home.items[0].label, 'new');
  assert.equal(merge(b, a).pages.home.items[0].label, 'new');
});

test('a deletion wins over an older edit, not a newer one', () => {
  const a = board([btn('x', 'hi', 5)]);
  assert.equal(merge(a, board([], { deleted: { x: 6 } })).pages.home.items.length, 0);
  assert.equal(merge(a, board([], { deleted: { x: 4 } })).pages.home.items.length, 1);
});

test('buttons added on both sides are both kept', () => {
  const out = merge(board([btn('a', 'one', 1)]), board([btn('b', 'two', 1)]));
  assert.deepEqual(out.pages.home.items.map((it) => it.id), ['a', 'b']);
});

test('newer settings win', () => {
  const out = merge(board([], { settings: { cols: 4 }, settingsAt: 1 }), board([], { settings: { cols: 6 }, settingsAt: 2 }));
  assert.equal(out.settings.cols, 6);
});

test('fingerprint changes only when the board does', () => {
  const a = board([btn('a', 'one')]);
  assert.equal(fingerprint(a), fingerprint(structuredClone(a)));
  assert.notEqual(fingerprint(a), fingerprint(board([btn('a', 'two')])));
});

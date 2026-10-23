// Moving the board from localStorage to IndexedDB must never lose it.  Run: node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boardStore, STORE_KEY, MOVED_KEY } from '../js/boardstore.js';
import { buildDefaultPages, STATE_VERSION } from '../js/upgrades.js';

// Stand-ins for localStorage (with a size limit) and the IndexedDB entry.
function fakeLocal(limit = Infinity) {
  const m = new Map();
  return {
    m,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { if (String(v).length > limit) throw new Error('QuotaExceededError'); m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}
function fakeKv() {
  const kv = { value: undefined, broken: false, hang: false, failPut: false };
  const check = () => {
    if (kv.hang) return new Promise(() => {});
    if (kv.broken) return Promise.reject(new Error('UnknownError'));
    return null;
  };
  kv.get = () => check() || Promise.resolve(kv.value);
  kv.put = (text) => check() || (kv.failPut ? Promise.reject(new Error('QuotaExceededError')) : Promise.resolve(void (kv.value = text)));
  return kv;
}
const v1Board = (label = 'Robyn') => {
  const pages = buildDefaultPages(label);
  pages.home.items[0].label = label;
  return JSON.stringify({ version: STATE_VERSION, pages, settings: { cols: 6 }, deleted: {}, settingsAt: 1 });
};
// Each launch of TapTalk makes a new store over the same storage.
const launch = (kv, local, opts = {}) => boardStore({ kv, local, timeoutMs: 20, ...opts });

test('a v1 board in localStorage is copied to IndexedDB and the original kept', async () => {
  const local = fakeLocal(), kv = fakeKv(), board = v1Board();
  local.setItem(STORE_KEY, board);
  assert.deepEqual(await launch(kv, local).load(), { text: board });
  assert.equal(kv.value, board, 'same text, so the same format');
  assert.equal(local.getItem(STORE_KEY), board, 'localStorage copy kept');
  assert.equal(local.getItem(MOVED_KEY), 'copied');
});

test('the next launch that finds both copies the same confirms the move and frees localStorage', async () => {
  const local = fakeLocal(), kv = fakeKv(), board = v1Board();
  local.setItem(STORE_KEY, board);
  await launch(kv, local).load();
  assert.deepEqual(await launch(kv, local).load(), { text: board });
  assert.equal(local.getItem(STORE_KEY), null);
  assert.equal(local.getItem(MOVED_KEY), 'confirmed');
  assert.deepEqual(await launch(kv, local).load(), { text: board }, 'and it keeps loading from IndexedDB');
});

test('until confirmed, saves go to both, and a newer localStorage copy wins', async () => {
  const local = fakeLocal(), kv = fakeKv();
  local.setItem(STORE_KEY, v1Board('one'));
  const s = launch(kv, local);
  await s.load();
  await s.save(v1Board('two'));
  assert.equal(local.getItem(STORE_KEY), v1Board('two'));
  assert.equal(kv.value, v1Board('two'));
  // The app was closed before IndexedDB finished the last save.
  local.setItem(STORE_KEY, v1Board('three'));
  assert.deepEqual(await launch(kv, local).load(), { text: v1Board('three') });
  assert.equal(kv.value, v1Board('three'), 'IndexedDB caught up');
  assert.equal(local.getItem(MOVED_KEY), 'copied', 'not confirmed while they differed');
});

test('after confirming, saves go only to IndexedDB', async () => {
  const local = fakeLocal(), kv = fakeKv();
  local.setItem(STORE_KEY, v1Board());
  await launch(kv, local).load();
  const s = launch(kv, local);
  await s.load();
  await s.save(v1Board('new'));
  assert.equal(kv.value, v1Board('new'));
  assert.equal(local.getItem(STORE_KEY), null);
});

test('a board too big for localStorage still saves, and the stale copy is not used', async () => {
  const board = v1Board();
  const local = fakeLocal(board.length + 10), kv = fakeKv();
  local.setItem(STORE_KEY, board);
  const s = launch(kv, local);
  await s.load();
  const big = v1Board('x'.repeat(100));
  await s.save(big);
  assert.equal(kv.value, big);
  assert.equal(local.getItem(STORE_KEY), null, 'old copy removed, not left to win');
  assert.deepEqual(await launch(kv, local).load(), { text: big });
});

test('without IndexedDB, the board loads and saves in localStorage as before', async () => {
  for (const kv of [null, Object.assign(fakeKv(), { broken: true }), Object.assign(fakeKv(), { hang: true })]) {
    const local = fakeLocal();
    local.setItem(STORE_KEY, v1Board());
    const s = launch(kv, local);
    assert.deepEqual(await s.load(), { text: v1Board() });
    await s.save(v1Board('new'));
    assert.equal(local.getItem(STORE_KEY), v1Board('new'));
  }
});

test('IndexedDB refusing a save after the move puts it in localStorage, which wins next time', async () => {
  const local = fakeLocal(), kv = fakeKv();
  local.setItem(STORE_KEY, v1Board());
  await launch(kv, local).load();
  const s = launch(kv, local);
  await s.load(); // confirmed
  kv.failPut = true;
  await s.save(v1Board('kept'));
  kv.failPut = false;
  assert.deepEqual(await launch(kv, local).load(), { text: v1Board('kept') });
  assert.equal(kv.value, v1Board('kept'));
});

test('a confirmed board that IndexedDB cannot open right now is reported lost, not overwritten', async () => {
  const local = fakeLocal(), kv = fakeKv(), board = v1Board();
  local.setItem(STORE_KEY, board);
  await launch(kv, local).load();
  await launch(kv, local).load(); // confirmed, localStorage freed
  kv.broken = true;
  const s = launch(kv, local);
  assert.deepEqual(await s.load(), { text: null, lost: true });
  await s.save(v1Board('starting board edited'));
  kv.broken = false;
  assert.equal(kv.value, board, 'IndexedDB untouched');
  assert.deepEqual(await launch(kv, local).load(), { text: board }, 'the real board comes back');
  assert.equal(local.getItem(STORE_KEY), null);
});

test('a new device starts empty and saves to IndexedDB', async () => {
  const local = fakeLocal(), kv = fakeKv();
  const s = launch(kv, local);
  assert.deepEqual(await s.load(), { text: null });
  await s.save(v1Board());
  assert.equal(kv.value, v1Board());
  assert.deepEqual(await launch(kv, local).load(), { text: v1Board() });
});

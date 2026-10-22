// Where the board is saved. It lives in IndexedDB (where photos already are):
// localStorage only holds about 5 MB. It is kept as the same JSON text that
// used to go in localStorage under "taptalk.v1", so the format is unchanged.
//
// Losing Robyn's board is the worst thing TapTalk could do, so the move is
// careful:
// - A board found only in localStorage is copied to IndexedDB, and the
//   localStorage copy is kept. Until the move is confirmed every save goes to
//   both, and if they ever differ on loading the localStorage copy wins (it is
//   written straight away, so it is never behind).
// - The move is confirmed by a later load that finds both copies the same.
//   Only then is the localStorage copy removed.
// - If IndexedDB can't be opened, the board is loaded from and saved to
//   localStorage as before. If IndexedDB refuses a save, that save goes to
//   localStorage and the move counts as unconfirmed again, so it wins next time.
export const STORE_KEY = 'taptalk.v1';
export const MOVED_KEY = 'taptalk.v1.moved'; // 'copied' or 'confirmed'

// kv: { get(): Promise<string|undefined>, put(text): Promise } (see idbKv),
// or null where there is no IndexedDB. local: localStorage.
export function boardStore({ kv, local, timeoutMs = 5000 }) {
  let useLocal = !kv;
  const moved = () => { try { return local.getItem(MOVED_KEY); } catch { return null; } };
  const setMoved = (v) => { try { local.setItem(MOVED_KEY, v); } catch { /* next load sorts it out */ } };
  const dropLocal = () => { try { local.removeItem(STORE_KEY); } catch { /* ignore */ } };
  // Safari can leave IndexedDB hanging rather than failing; never wait forever.
  const timed = (p) => {
    let timer;
    const late = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('IndexedDB did not answer')), timeoutMs); });
    return Promise.race([p, late]).finally(() => clearTimeout(timer));
  };
  const getIdb = async () => {
    try { return await timed(kv.get()); } catch { return timed(kv.get()); } // one retry
  };

  // Returns { text } (null for a new device), or { text: null, lost: true }
  // when the board is in IndexedDB but IndexedDB can't be opened right now.
  async function load() {
    let localText = null;
    try { localText = local.getItem(STORE_KEY); } catch { /* none */ }
    let idbText;
    if (!useLocal) {
      try { idbText = (await getIdb()) ?? null; } catch { useLocal = true; }
    }
    if (useLocal) {
      return localText != null ? { text: localText } : { text: null, lost: moved() === 'confirmed' };
    }
    if (idbText == null) {
      if (localText == null) return { text: null };
      // First load since the move: copy the board over and keep the original.
      try { await timed(kv.put(localText)); setMoved('copied'); } catch { useLocal = true; }
      return { text: localText };
    }
    if (localText == null || moved() === 'confirmed' || localText === idbText) {
      // A localStorage copy left by a session that couldn't open IndexedDB
      // after the move was confirmed is older than IndexedDB's.
      if (localText != null) dropLocal();
      setMoved('confirmed');
      return { text: idbText };
    }
    // Not yet confirmed and they differ: the localStorage copy is the newer.
    try { await timed(kv.put(localText)); } catch { useLocal = true; }
    return { text: localText };
  }

  // Resolves once the board is safely stored; rejects if it couldn't be.
  async function save(text) {
    if (useLocal) { local.setItem(STORE_KEY, text); return; }
    if (moved() !== 'confirmed') {
      // Too big for localStorage: remove the copy rather than leave an old one
      // that would win over IndexedDB's.
      try { local.setItem(STORE_KEY, text); } catch { dropLocal(); }
    }
    try {
      await timed(kv.put(text));
    } catch {
      setMoved('copied');
      local.setItem(STORE_KEY, text);
    }
  }

  return { load, save, usingLocal: () => useLocal };
}

// The board's IndexedDB store: one entry holding the board's JSON text.
export function idbKv(name = 'taptalk-board', store = 'board', key = STORE_KEY) {
  if (typeof indexedDB === 'undefined') return null;
  let dbp = null;
  const db = () => {
    dbp ??= new Promise((resolve, reject) => {
      const req = indexedDB.open(name, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(store);
      req.onsuccess = () => {
        // Safari can drop the connection (e.g. after a long sleep): reopen next time.
        req.result.onclose = () => { dbp = null; };
        resolve(req.result);
      };
      req.onerror = () => { dbp = null; reject(req.error); };
    });
    return dbp;
  };
  const tx = async (mode, fn) => {
    let d;
    try { d = await db(); } catch (err) { dbp = null; throw err; }
    let t;
    try { t = d.transaction(store, mode); } catch (err) { dbp = null; throw err; }
    return new Promise((resolve, reject) => {
      const req = fn(t.objectStore(store));
      t.oncomplete = () => resolve(req.result);
      t.onerror = () => reject(t.error || new Error('the board store refused the change'));
      t.onabort = () => reject(t.error || new Error('the board store refused the change'));
    });
  };
  return {
    get: () => tx('readonly', (s) => s.get(key)),
    put: (text) => tx('readwrite', (s) => s.put(text, key)),
  };
}

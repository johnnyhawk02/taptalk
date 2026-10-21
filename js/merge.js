// Merges two copies of Robyn's board (e.g. the computer's and the school
// iPad's) so changes made on either are kept.
//
// Every button and page carries `updatedAt` (ms) from its last edit; a
// page's button order carries `orderAt`; deleted buttons/pages leave a
// tombstone in `deleted` ({ id: deletedAt }); settings carry `settingsAt`.
// For anything changed on both sides, the newer change wins. Things with no
// timestamp (the starting board) count as time 0.
//
//   merge(a, b) -> { pages, deleted, settings, settingsAt }

const t = (x) => x?.updatedAt || 0;

export function merge(a, b) {
  const deleted = { ...(a.deleted || {}) };
  for (const [id, at] of Object.entries(b.deleted || {})) deleted[id] = Math.max(deleted[id] || 0, at);

  const pages = {};
  for (const id of new Set([...Object.keys(a.pages || {}), ...Object.keys(b.pages || {})])) {
    const pa = a.pages?.[id];
    const pb = b.pages?.[id];
    const newest = !pa ? pb : !pb ? pa : t(pb) > t(pa) ? pb : pa;
    if (deleted['page:' + id] >= t(newest)) continue;
    pages[id] = mergePage(pa, pb, deleted);
  }

  const settingsFromB = (b.settingsAt || 0) > (a.settingsAt || 0);
  return {
    pages,
    deleted,
    settings: settingsFromB ? { ...a.settings, ...b.settings } : { ...b.settings, ...a.settings },
    settingsAt: Math.max(a.settingsAt || 0, b.settingsAt || 0),
  };
}

function mergePage(pa, pb, deleted) {
  if (!pa || !pb) {
    const p = pa || pb;
    return { ...p, items: p.items.filter((it) => !(deleted[it.id] >= t(it))) };
  }
  const head = t(pb) > t(pa) ? pb : pa; // name, stay, etc.

  // Each button: the newer version wins, unless it was deleted after that.
  const byId = new Map();
  for (const it of [...pa.items, ...pb.items]) {
    const have = byId.get(it.id);
    if (!have || t(it) > t(have)) byId.set(it.id, it);
  }
  for (const [id, it] of byId) if (deleted[id] >= t(it)) byId.delete(id);

  // Order: follow the side whose order changed last, then add buttons only
  // the other side has, in its order.
  const [first, second] = (pb.orderAt || 0) > (pa.orderAt || 0) ? [pb, pa] : [pa, pb];
  const order = [];
  const seen = new Set();
  for (const it of [...first.items, ...second.items]) {
    if (byId.has(it.id) && !seen.has(it.id)) { seen.add(it.id); order.push(byId.get(it.id)); }
  }

  // Safety net: two identical buttons (same word, picture, colour, link),
  // e.g. from devices that started from separate copies, become one.
  const sig = (it) => [it.label, it.sym, it.type, it.link || ''].join('|');
  const bySig = new Map();
  for (const it of order) {
    const other = bySig.get(sig(it));
    if (!other || t(it) > t(other)) bySig.set(sig(it), it);
  }
  const keep = new Set([...bySig.values()]);
  const merged = { ...head, items: order.filter((it) => keep.has(it)) };
  const orderAt = Math.max(pa.orderAt || 0, pb.orderAt || 0);
  if (orderAt) merged.orderAt = orderAt;
  return merged;
}

// Stable text form for "did anything change?" comparisons.
export function fingerprint(board) {
  return JSON.stringify([board.pages, board.deleted || {}, board.settings, board.settingsAt || 0]);
}

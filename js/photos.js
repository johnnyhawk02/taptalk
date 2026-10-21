// Caregiver photos live in IndexedDB (localStorage is too small for images).
// They're stored as { type, data: ArrayBuffer } rather than Blobs: some Safari
// sessions (e.g. private browsing) refuse to store Blobs. Older Blob entries
// are still read.

const DB = 'taptalk-photos';
const STORE = 'photos';
const MAX_SIDE = 480;
const urls = new Map();
// The uncropped photo is kept under "<id>:orig" so the picture can be
// re-edited later without losing quality.
export const ORIGINAL = ':orig';

let dbp = null;
function db() {
  dbp ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

async function tx(mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(STORE, mode);
    const out = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(out?.result);
    t.onerror = () => reject(t.error || new Error('the photo store refused the change'));
    t.onabort = () => reject(t.error || new Error('the photo store refused the change'));
  });
}

async function encode(blob) {
  return { type: blob.type || 'image/jpeg', data: await blob.arrayBuffer() };
}
function decode(v) {
  if (!v) return null;
  return v instanceof Blob ? v : new Blob([v.data], { type: v.type });
}
const read = async (id) => decode(await tx('readonly', (s) => s.get(id)));
const write = async (id, blob) => { const v = await encode(blob); await tx('readwrite', (s) => s.put(v, id)); };

export async function url(id) {
  if (urls.has(id)) return urls.get(id);
  const blob = await read(id);
  if (!blob) return '';
  const u = URL.createObjectURL(blob);
  urls.set(id, u);
  return u;
}

export async function addFromFile(file) {
  const blob = await shrink(file); // any image Blob or File
  const id = 'ph' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  await write(id, blob);
  return id;
}

// Stores an image as-is (already small, e.g. a downloaded symbol PNG).
export async function addBlob(blob) {
  const id = 'ph' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  await write(id, blob);
  return id;
}

export async function get(id) {
  return read(id);
}

// Stores an image under a known id (used when receiving a synced board).
export async function put(id, blob) {
  await write(id, blob);
  const old = urls.get(id);
  if (old) { URL.revokeObjectURL(old); urls.delete(id); }
}

export async function clear() {
  await tx('readwrite', (s) => s.clear());
  urls.forEach((u) => URL.revokeObjectURL(u));
  urls.clear();
}

export async function exportAll() {
  const keys = await tx('readonly', (s) => s.getAllKeys());
  const out = {};
  for (const id of keys || []) {
    if (String(id).endsWith(ORIGINAL)) continue; // originals stay on the device that edited them
    const blob = await read(id);
    out[id] = await new Promise((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.readAsDataURL(blob);
    });
  }
  return out;
}

export async function importAll(map) {
  for (const [id, dataUrl] of Object.entries(map)) {
    await write(id, await fetch(dataUrl).then((r) => r.blob()));
  }
}

export async function shrink(file, maxSide = MAX_SIDE) {
  const src = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = src;
    await img.decode();
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * scale);
    const h = Math.round(img.naturalHeight * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
    return await new Promise((resolve, reject) =>
      // Keep PNGs as PNG so see-through backgrounds stay see-through.
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('could not read image'))),
        file.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.85));
  } finally {
    URL.revokeObjectURL(src);
  }
}

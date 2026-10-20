// Caregiver photos live in IndexedDB as small JPEG blobs (localStorage is too
// small for images).

const DB = 'taptalk-photos';
const STORE = 'photos';
const MAX_SIDE = 480;
const urls = new Map();

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
    t.onerror = () => reject(t.error);
  });
}

export async function url(id) {
  if (urls.has(id)) return urls.get(id);
  const blob = await tx('readonly', (s) => s.get(id));
  if (!blob) return '';
  const u = URL.createObjectURL(blob);
  urls.set(id, u);
  return u;
}

export async function addFromFile(file) {
  const blob = await shrink(file);
  const id = 'ph' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  await tx('readwrite', (s) => s.put(blob, id));
  return id;
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
    const blob = await tx('readonly', (s) => s.get(id));
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
    const blob = await fetch(dataUrl).then((r) => r.blob());
    await tx('readwrite', (s) => s.put(blob, id));
  }
}

async function shrink(file) {
  const src = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = src;
    await img.decode();
    const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * scale);
    const h = Math.round(img.naturalHeight * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
    return await new Promise((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('could not read image'))), 'image/jpeg', 0.85));
  } finally {
    URL.revokeObjectURL(src);
  }
}

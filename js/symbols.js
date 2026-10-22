// Button pictures: symbol files, ARASAAC pictograms re-drawn in the chosen
// skin tone, and the grown-ups' own photos.
import * as photos from './photos.js';
import { DEFAULT_SKIN, state } from './state.js';

// The ARASAAC server re-draws pictures in these skin tones (names are theirs).
const ARASAAC_SKIN = { '#f6d2a9': 'assian', '#e0ac7e': 'mulatto', '#c08654': 'aztec', '#8d5a33': 'black', '#5c3a21': 'black' };

const skinCache = new Map(); // "tone|url" -> blob URL

export function rawSymbolUrl(sym) {
  const [kind, name] = splitSym(sym);
  if (kind === 'm') return 'symbols/mulberry/' + encodeURIComponent(name) + '.svg';
  if (kind === 'c') return 'symbols/custom/' + encodeURIComponent(name) + '.svg';
  if (kind === 'a') return 'symbols/arasaac/' + encodeURIComponent(name) + '.png';
  return '';
}

function arasaacToned(id, skin) {
  return `https://api.arasaac.org/v1/pictograms/${encodeURIComponent(id)}?skin=${skin}&resolution=500&download=false`;
}

function splitSym(sym = '') {
  const i = sym.indexOf(':');
  return i < 0 ? ['', ''] : [sym.slice(0, i), sym.slice(i + 1)];
}

// Sets an <img> to show a symbol, re-colouring skin when a tone is chosen.
export async function setSymbol(img, sym) {
  img.alt = '';
  img.decoding = 'async';
  const [kind, name] = splitSym(sym);
  if (!kind) { img.removeAttribute('src'); return; }
  if (kind === 'u') {
    const [src, fill] = await Promise.all([photos.url(name), photos.fills(name)]);
    img.src = src || '';
    img.closest('.tile')?.classList.toggle('fill', Boolean(src && fill));
    return;
  }
  img.closest('.tile')?.classList.remove('fill');
  const url = rawSymbolUrl(sym);
  const tone = state.settings.skin;
  if (!tone || tone === DEFAULT_SKIN) { img.src = url; return; }

  const key = tone + '|' + url;
  if (!skinCache.has(key)) skinCache.set(key, tonedUrl(kind, name, url, tone));
  const want = key;
  img.dataset.want = want;
  const src = await skinCache.get(key);
  if (img.dataset.want === want) img.src = src;
}

// Blob URL of a symbol in another skin tone, or the plain URL if that fails
// (e.g. an ARASAAC picture offline before it was ever fetched in this tone).
async function tonedUrl(kind, name, url, tone) {
  try {
    if (kind === 'a') {
      const res = await fetch(arasaacToned(name, ARASAAC_SKIN[tone] || 'white'));
      if (!res.ok) throw new Error(res.status);
      return URL.createObjectURL(await res.blob());
    }
    const svg = await fetch(url).then((r) => r.text());
    return URL.createObjectURL(new Blob([svg.replace(/#ffeec8/gi, tone)], { type: 'image/svg+xml' }));
  } catch {
    return url;
  }
}

// After a skin tone change, fetch every ARASAAC picture on the board in that
// tone so the service worker has them for offline use.
export function prefetchToned() {
  const tone = state.settings.skin;
  if (!ARASAAC_SKIN[tone] || !navigator.onLine) return;
  const ids = new Set();
  for (const page of Object.values(state.pages)) {
    for (const item of page.items) if (item.sym?.startsWith('a:')) ids.add(item.sym.slice(2));
  }
  let i = 0;
  const list = [...ids];
  const next = () => {
    if (i >= list.length || state.settings.skin !== tone) return;
    fetch(arasaacToned(list[i++], ARASAAC_SKIN[tone])).catch(() => {}).finally(next);
  };
  for (let k = 0; k < 4; k++) next();
}

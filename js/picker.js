// The picture picker: searching symbols, ARASAAC pictograms and web photos.
import * as photos from './photos.js';
import { openSheet } from './sheet.js';
import { $ } from './util.js';
import { rawSymbolUrl } from './symbols.js';
import { draft, renderPreview, usePhoto } from './editor.js';

let symbolIndex = null;

export async function getIndex() {
  if (!symbolIndex) {
    const rows = await fetch('symbols/index.json').then((r) => r.json());
    symbolIndex = rows.map(([name, cat, tags]) => ({
      name,
      words: name.replace(/_,_to$/, '').replace(/_\d+[a-z]?$/, '').replace(/[_,-]+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase(),
      hay: `${cat} ${tags}`.toLowerCase(),
    }));
    // Custom symbols first so they show up for their words.
    for (const name of ['I', 'you', 'stop', 'please', 'thank_you', 'again']) {
      symbolIndex.unshift({ name, custom: true, words: name.replace(/_/g, ' ').toLowerCase(), hay: 'taptalk' });
    }
  }
  return symbolIndex;
}

export function searchSymbols(index, q) {
  q = q.trim().toLowerCase();
  if (!q) return index.slice(0, 150);
  const terms = q.split(/\s+/);
  const scored = [];
  for (const s of index) {
    let score = 0;
    if (s.words === q) score = 100;
    else if (s.words.startsWith(q)) score = 60;
    else if (terms.every((t) => (' ' + s.words).includes(' ' + t))) score = 40;
    else if (terms.every((t) => s.words.includes(t))) score = 25;
    else if (terms.every((t) => s.hay.includes(t))) score = 10;
    if (score) scored.push([score - s.words.length / 100, s]);
  }
  return scored.sort((a, b) => b[0] - a[0]).slice(0, 150).map(([, s]) => s);
}

// onChosen: give the chosen picture to someone else (e.g. a page's picture in
// the Page manager) instead of the button being edited.
let pickerTarget = null;
export async function openPicker(query, onChosen = null) {
  pickerTarget = onChosen;
  $('pickerSearch').value = query || '';
  openSheet($('picker'));
  await renderPicker();
}

// ARASAAC (arasaac.org) has ~13,000 child-friendly pictograms and a free,
// open search API. Results need a connection; a chosen picture is saved on
// the device like a photo, so it works offline and goes into backups.
const ARASAAC_API = 'https://api.arasaac.org/v1/pictograms/en/search/';
export const arasaacImg = (id, size) => `https://static.arasaac.org/pictograms/${id}/${id}_${size}.png`;
let pickerRun = 0;

export async function searchArasaac(q) {
  q = q.trim();
  if (!q || !navigator.onLine) return [];
  const res = await fetch(ARASAAC_API + encodeURIComponent(q));
  if (res.status === 404) return []; // no matches
  if (!res.ok) throw new Error('ARASAAC ' + res.status);
  return (await res.json()).slice(0, 60).map((p) => ({ id: p._id, words: p.keywords?.[0]?.keyword || q }));
}

function pickButton(src, words, onPick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'pick';
  const img = document.createElement('img');
  img.loading = 'lazy';
  img.src = src;
  img.alt = '';
  const span = document.createElement('span');
  span.textContent = words;
  b.append(img, span);
  b.addEventListener('click', async () => {
    let sym;
    try {
      sym = await onPick();
    } catch {
      alert('Could not get that picture. Check the internet connection and try again.');
      return;
    }
    const target = pickerTarget;
    pickerTarget = null;
    $('picker').close();
    if (target) { if (sym) target(sym); return; }
    if (!$('edLabel').value) $('edLabel').value = words;
    if (sym) { draft.sym = sym; renderPreview(); }
  });
  return b;
}

function pickerHeading(text) {
  const h = document.createElement('h4');
  h.className = 'picker-heading';
  h.textContent = text;
  return h;
}

// Photos from around the web, through Openverse (openverse.org): a free,
// keyless search of ~800 million images from Flickr, Wikimedia and others,
// whose image proxy lets the app download the one you pick.
const OPENVERSE = 'https://api.openverse.org/v1/images/';
const webCache = new Map(); // query -> results (keeps within Openverse's free limits)

async function searchWeb(q) {
  const key = q.trim().toLowerCase();
  if (!webCache.has(key)) {
    webCache.set(key, (async () => {
      const res = await fetch(`${OPENVERSE}?q=${encodeURIComponent(key)}&page_size=20&mature=false`);
      if (res.status === 429) throw new Error('busy');
      if (!res.ok) throw new Error(res.status);
      return (await res.json()).results.map((r) => ({ id: r.id, title: r.title || key, url: r.url }));
    })());
    webCache.get(key).catch(() => webCache.delete(key));
  }
  return webCache.get(key);
}

// Most results are on Flickr, whose own servers are much faster than going
// through Openverse and offer ready-made sizes (n = 320px, c = 800px, b = 1024px).
const FLICKR = /^(https:\/\/live\.staticflickr\.com\/\d+\/\d+_[0-9a-f]+)(?:_[a-z0-9])?\.jpg$/;
const flickrSize = (url, size) => (FLICKR.test(url || '') ? url.replace(FLICKR, `$1_${size}.jpg`) : '');

function webThumb(p) {
  return flickrSize(p.url, 'n') || `${OPENVERSE}${p.id}/thumb/`;
}

// Picked web photos go through the picture editor, like any other photo.
async function pickWebPhoto(p) {
  const tries = [flickrSize(p.url, 'b'), flickrSize(p.url, 'c'), `${OPENVERSE}${p.id}/thumb/?full_size=true`, `${OPENVERSE}${p.id}/thumb/`];
  for (const url of tries.filter(Boolean)) {
    try {
      const res = await fetch(url);
      const blob = res.ok && (await res.blob());
      if (blob?.type.startsWith('image/')) { usePhoto(blob); return null; }
    } catch { /* try the next size */ }
  }
  throw new Error('no copy of that photo could be downloaded');
}

let webTimer = 0;

async function renderPicker() {
  const run = ++pickerRun;
  const q = $('pickerSearch').value;
  const index = await getIndex();
  const mulberry = searchSymbols(index, q).slice(0, q.trim() ? 60 : 150);
  const g = $('pickerGrid');

  const arasaacBox = document.createElement('div');
  arasaacBox.className = 'picker-section';
  const webBox = document.createElement('div');
  webBox.className = 'picker-section';
  // ARASAAC first (the board's own style), then photos, then Mulberry, which also works offline.
  const parts = q.trim() ? [arasaacBox, webBox] : [];
  if (mulberry.length) {
    parts.push(pickerHeading('Mulberry'), ...mulberry.map((s) => {
      const sym = (s.custom ? 'c:' : 'm:') + s.name;
      return pickButton(rawSymbolUrl(sym), s.words, async () => sym);
    }));
  }
  g.replaceChildren(...parts);
  g.scrollTop = 0;
  if (!q.trim()) return;

  // Photos load a moment after typing stops, so each keystroke isn't a search.
  const webNote = (text) => Object.assign(document.createElement('p'), { className: 'picker-empty', textContent: text });
  webBox.replaceChildren(pickerHeading('Photos'), webNote('Searching for photos… this can take a few seconds.'));
  clearTimeout(webTimer);
  webTimer = setTimeout(async () => {
    let shown = [webNote('Connect to the internet to see photos.')];
    if (navigator.onLine) {
      try {
        const found = await searchWeb(q);
        shown = found.length
          ? found.map((p) => {
            const b = pickButton(webThumb(p), p.title, () => pickWebPhoto(p));
            b.querySelector('img').onerror = () => b.remove(); // photo no longer online
            return b;
          })
          : [webNote('No photos found for this word.')];
      } catch (err) {
        shown = [webNote(err.message === 'busy' ? 'Photo search is busy — wait a minute and try again.' : 'Photos could not be loaded right now.')];
      }
    }
    if (run !== pickerRun) return;
    webBox.replaceChildren(pickerHeading('Photos'),
      Object.assign(document.createElement('p'), { className: 'picker-note', textContent: 'From Openverse. Not here? Use Google Images ↗, copy a picture, and paste it.' }),
      ...shown);
  }, 700);

  arasaacBox.replaceChildren(pickerHeading('ARASAAC'), Object.assign(document.createElement('p'), { className: 'picker-empty', textContent: 'Searching…' }));
  let found = [];
  let note = '';
  try {
    found = await searchArasaac(q);
    if (!navigator.onLine) note = 'Connect to the internet to see ARASAAC pictures.';
  } catch {
    note = 'ARASAAC pictures could not be loaded right now.';
  }
  if (run !== pickerRun) return; // a newer search has started

  if (!found.length && !note) note = 'No ARASAAC pictures for this word.';
  arasaacBox.replaceChildren(
    pickerHeading('ARASAAC'),
    ...found.map((p) => pickButton(arasaacImg(p.id, 300), p.words, async () => {
      const res = await fetch(arasaacImg(p.id, 500));
      if (!res.ok) throw new Error(res.status);
      return 'u:' + await photos.addBlob(await res.blob());
    })),
    ...(note ? [Object.assign(document.createElement('p'), { className: 'picker-empty', textContent: note })] : []),
  );
}

let searchTimer = 0;

export function init() {
  $('pickerGoogle').addEventListener('click', () => {
    const q = $('pickerSearch').value.trim() || $('edLabel').value.trim();
    window.open('https://www.google.com/search?tbm=isch&q=' + encodeURIComponent(q), '_blank', 'noopener');
    $('pickerGoogle').textContent = 'Copy a picture there, then paste here';
    setTimeout(() => { $('pickerGoogle').textContent = 'Google Images ↗'; }, 8000);
  });
  $('pickerSearch').addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(renderPicker, 150); });
  $('pickerClose').addEventListener('click', () => $('picker').close());
  $('picker').addEventListener('close', () => { pickerTarget = null; });
}

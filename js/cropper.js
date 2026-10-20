// Picture editor: crop a photo to the button's square, zoom, move, rotate,
// and choose a shape and background, so photos sit neatly on buttons.
//
//   const blob = await editPicture(sourceBlob);   // null if cancelled

const OUT = 512;        // size of the saved picture
const MAX_ZOOM = 5;

const $ = (id) => document.getElementById(id);

const SHAPES = {
  square: (ctx, s) => ctx.rect(0, 0, s, s),
  rounded: (ctx, s) => {
    const r = s * 0.16;
    if (ctx.roundRect) { ctx.roundRect(0, 0, s, s, r); return; }
    ctx.moveTo(r, 0);
    ctx.arcTo(s, 0, s, s, r);
    ctx.arcTo(s, s, 0, s, r);
    ctx.arcTo(0, s, 0, 0, r);
    ctx.arcTo(0, 0, s, 0, r);
    ctx.closePath();
  },
  circle: (ctx, s) => ctx.arc(s / 2, s / 2, s / 2, 0, Math.PI * 2),
};

const BACKGROUNDS = { white: '#ffffff', none: null, black: '#1d1d1f' };

let view = null; // current editing session

export function editPicture(blob) {
  return new Promise((resolve) => {
    const src = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => start(img, src, resolve);
    img.onerror = () => { URL.revokeObjectURL(src); resolve(null); };
    img.src = src;
  });
}

function start(img, src, resolve) {
  view = {
    img, src, resolve,
    rot: 0,          // quarter turns
    zoom: 1,         // 1 = picture just covers (or just fits) the square
    ox: 0, oy: 0,    // offset of picture centre from square centre, in output pixels
    fit: false,      // false = fill the square, true = show the whole picture
    shape: 'rounded',
    bg: 'white',
  };
  $('cropZoom').value = '1';
  syncChips();
  $('cropper').showModal();
  sizeCanvas();
  draw();
}

function finish(result) {
  const v = view;
  view = null;
  $('cropper').close();
  URL.revokeObjectURL(v.src);
  v.resolve(result);
}

// ---------- Geometry ----------

function rotatedSize(v) {
  const w = v.img.naturalWidth;
  const h = v.img.naturalHeight;
  return v.rot % 2 ? [h, w] : [w, h];
}

// Scale that turns picture pixels into output pixels.
function scaleOf(v) {
  const [w, h] = rotatedSize(v);
  const base = v.fit ? Math.min(OUT / w, OUT / h) : Math.max(OUT / w, OUT / h);
  return base * v.zoom;
}

// Keep the picture from sliding off the square (when it's big enough to cover it).
function clamp(v) {
  const [w, h] = rotatedSize(v);
  const s = scaleOf(v);
  const mx = Math.max(0, (w * s - OUT) / 2);
  const my = Math.max(0, (h * s - OUT) / 2);
  v.ox = Math.min(mx, Math.max(-mx, v.ox));
  v.oy = Math.min(my, Math.max(-my, v.oy));
}

function paint(ctx, size, v, { preview = false } = {}) {
  const k = size / OUT;
  ctx.clearRect(0, 0, size, size);
  ctx.save();
  ctx.beginPath();
  SHAPES[v.shape](ctx, size);
  ctx.clip();
  const bg = BACKGROUNDS[v.bg];
  if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, size, size); }
  else if (preview) drawChecks(ctx, size);
  const s = scaleOf(v) * k;
  ctx.translate(size / 2 + v.ox * k, size / 2 + v.oy * k);
  ctx.rotate((v.rot * Math.PI) / 2);
  ctx.drawImage(v.img, (-v.img.naturalWidth * s) / 2, (-v.img.naturalHeight * s) / 2, v.img.naturalWidth * s, v.img.naturalHeight * s);
  ctx.restore();
}

function drawChecks(ctx, size) {
  const n = 16;
  const c = size / n;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      ctx.fillStyle = (x + y) % 2 ? '#e6e4df' : '#ffffff';
      ctx.fillRect(x * c, y * c, c, c);
    }
  }
}

// ---------- Drawing ----------

function sizeCanvas() {
  const c = $('cropCanvas');
  const css = c.getBoundingClientRect().width || 320;
  const px = Math.round(css * (window.devicePixelRatio || 1));
  if (c.width !== px) { c.width = px; c.height = px; }
}

let frame = 0;
function draw() {
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(() => {
    if (!view) return;
    const c = $('cropCanvas');
    paint(c.getContext('2d'), c.width, view, { preview: true });
  });
}

function syncChips() {
  for (const b of document.querySelectorAll('#cropper [data-shape]')) b.setAttribute('aria-pressed', String(b.dataset.shape === view.shape));
  for (const b of document.querySelectorAll('#cropper [data-bg]')) b.setAttribute('aria-pressed', String(b.dataset.bg === view.bg));
  $('cropFit').setAttribute('aria-pressed', String(view.fit));
  $('cropFill').setAttribute('aria-pressed', String(!view.fit));
}

// ---------- Controls ----------

function setZoom(z, anchor) {
  const v = view;
  const old = v.zoom;
  v.zoom = Math.min(MAX_ZOOM, Math.max(1, z));
  // Zoom around the point under the fingers/mouse, so it doesn't jump.
  if (anchor) {
    const r = v.zoom / old;
    v.ox = anchor.x + (v.ox - anchor.x) * r;
    v.oy = anchor.y + (v.oy - anchor.y) * r;
  } else {
    v.ox *= v.zoom / old;
    v.oy *= v.zoom / old;
  }
  clamp(v);
  $('cropZoom').value = String(v.zoom);
  draw();
}

// Pointer position relative to the square's centre, in output pixels.
function toOut(e) {
  const r = $('cropCanvas').getBoundingClientRect();
  return { x: ((e.clientX - r.left) / r.width - 0.5) * OUT, y: ((e.clientY - r.top) / r.height - 0.5) * OUT };
}

const pointers = new Map();
let pinch = null;

function onDown(e) {
  if (!view) return;
  e.preventDefault();
  $('cropCanvas').setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, toOut(e));
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom: view.zoom };
  }
}

function onMove(e) {
  if (!view || !pointers.has(e.pointerId)) return;
  const prev = pointers.get(e.pointerId);
  const now = toOut(e);
  pointers.set(e.pointerId, now);
  if (pointers.size === 2 && pinch) {
    const [a, b] = [...pointers.values()];
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    setZoom(pinch.zoom * (Math.hypot(a.x - b.x, a.y - b.y) / pinch.dist), mid);
  } else if (pointers.size === 1) {
    view.ox += now.x - prev.x;
    view.oy += now.y - prev.y;
    clamp(view);
    draw();
  }
}

function onUp(e) {
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinch = null;
}

function render() {
  const c = document.createElement('canvas');
  c.width = OUT;
  c.height = OUT;
  paint(c.getContext('2d'), OUT, view);
  // Corners or background are see-through unless it's a plain filled square.
  const clear = view.shape !== 'square' || !BACKGROUNDS[view.bg];
  return new Promise((resolve) => c.toBlob(resolve, clear ? 'image/png' : 'image/jpeg', 0.9));
}

export function initCropper() {
  const canvas = $('cropCanvas');
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('wheel', (e) => {
    if (!view) return;
    e.preventDefault();
    setZoom(view.zoom * Math.exp(-e.deltaY / 400), toOut(e));
  }, { passive: false });

  $('cropZoom').addEventListener('input', (e) => view && setZoom(Number(e.target.value)));
  $('cropRotL').addEventListener('click', () => { if (!view) return; view.rot = (view.rot + 3) % 4; clamp(view); draw(); });
  $('cropRotR').addEventListener('click', () => { if (!view) return; view.rot = (view.rot + 1) % 4; clamp(view); draw(); });
  $('cropFill').addEventListener('click', () => { if (!view) return; view.fit = false; view.zoom = 1; view.ox = view.oy = 0; $('cropZoom').value = '1'; syncChips(); draw(); });
  $('cropFit').addEventListener('click', () => { if (!view) return; view.fit = true; view.zoom = 1; view.ox = view.oy = 0; $('cropZoom').value = '1'; syncChips(); draw(); });
  for (const b of document.querySelectorAll('#cropper [data-shape]')) {
    b.addEventListener('click', () => { if (!view) return; view.shape = b.dataset.shape; syncChips(); draw(); });
  }
  for (const b of document.querySelectorAll('#cropper [data-bg]')) {
    b.addEventListener('click', () => { if (!view) return; view.bg = b.dataset.bg; syncChips(); draw(); });
  }
  $('cropCancel').addEventListener('click', () => view && finish(null));
  $('cropDone').addEventListener('click', async () => { if (view) finish(await render()); });
  $('cropper').addEventListener('cancel', (e) => { e.preventDefault(); if (view) finish(null); });
  window.addEventListener('resize', () => { if (view) { sizeCanvas(); draw(); } });
}

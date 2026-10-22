// Dragging a button to a new place while editing.
import { now } from './util.js';
import { state, save, ui } from './state.js';
import { grid, render } from './render.js';
import { markChanged } from './sharing.js';
import { offerUndo, afterRestore } from './undo.js';

// Mouse: just drag. Touch: hold a moment, then drag, so a quick swipe still
// scrolls a long page and a tap still opens the editor. The other buttons
// slide out of the way as it moves; Undo puts the old order back.

const DRAG_HOLD_MS = 250;
const DRAG_SLOP = 8;
let drag = null;
export let dragJustEnded = false;

const dragTiles = () => [...grid.querySelectorAll('.tile[data-id]')];

function startDrag() {
  const d = drag;
  if (!d || d.live) return;
  d.live = true;
  d.before = dragTiles().map((t) => t.dataset.id);
  const r = d.tile.getBoundingClientRect();
  d.dx = d.x0 - r.left;
  d.dy = d.y0 - r.top;
  const ghost = d.tile.cloneNode(true);
  ghost.classList.add('drag-ghost');
  ghost.style.width = r.width + 'px';
  ghost.style.height = r.height + 'px';
  document.body.append(ghost);
  d.ghost = ghost;
  d.tile.classList.add('drag-source');
  moveGhost();
}

function moveGhost() {
  const d = drag;
  d.ghost.style.transform = `translate(${d.x - d.dx}px, ${d.y - d.dy}px) scale(1.06)`;
}

// Which button slot the finger is over, from the grid's rows and columns
// rather than from the buttons themselves: they are mid-slide, and chasing
// them made neighbours flip back and forth. Near a slot's edge (or in the gap
// between slots) nothing changes, so it can't jitter on a boundary either.
function slotAt(x, y) {
  const r = grid.getBoundingClientRect();
  const cs = getComputedStyle(grid);
  const cols = state.settings.cols;
  const gapX = parseFloat(cs.columnGap) || 0;
  const gapY = parseFloat(cs.rowGap) || 0;
  const left = r.left + parseFloat(cs.paddingLeft);
  const top = r.top + parseFloat(cs.paddingTop) - grid.scrollTop;
  const colW = (grid.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - gapX * (cols - 1)) / cols;
  const rowH = parseFloat(grid.style.getPropertyValue('--row-h')) || colW;
  const cx = (x - left) / (colW + gapX);
  const cy = (y - top) / (rowH + gapY);
  const col = Math.floor(cx);
  const row = Math.floor(cy);
  const inX = (cx - col) * (colW + gapX) / colW;
  const inY = (cy - row) * (rowH + gapY) / rowH;
  if (col < 0 || col >= cols || row < 0 || inX < 0.15 || inX > 0.85 || inY < 0.15 || inY > 0.85) return -1;
  const offset = grid.querySelector('.tile.back') ? 1 : 0;
  return row * cols + col - offset;
}

// Move the dragged button to where the finger is; the others slide (FLIP).
function reorderUnder(x, y) {
  const tiles = dragTiles();
  const slot = slotAt(x, y);
  if (slot < 0) return;
  const to = Math.min(slot, tiles.length - 1);
  const from = tiles.indexOf(drag.tile);
  if (to === from) return;
  const over = tiles[to];
  const first = new Map(tiles.map((t) => [t, t.getBoundingClientRect()]));
  grid.insertBefore(drag.tile, to > from ? over.nextSibling : over);
  for (const t of tiles) {
    const a = first.get(t);
    const b = t.getBoundingClientRect();
    if (t === drag.tile || (a.left === b.left && a.top === b.top)) continue;
    t.style.transition = 'none';
    t.style.transform = `translate(${a.left - b.left}px, ${a.top - b.top}px)`;
    requestAnimationFrame(() => {
      t.style.transition = 'transform 160ms ease-out';
      t.style.transform = '';
    });
  }
}

// Near the top or bottom of a long page, scroll while dragging.
function autoScroll() {
  if (!drag?.live) return;
  const r = grid.getBoundingClientRect();
  const edge = 60;
  const step = drag.y < r.top + edge ? -12 : drag.y > r.bottom - edge ? 12 : 0;
  if (step) {
    grid.scrollTop += step;
    reorderUnder(drag.x, drag.y);
  }
  drag.scrollFrame = requestAnimationFrame(autoScroll);
}

function cancelDrag() {
  clearTimeout(drag?.holdTimer);
  drag = null;
}

function endDrag(keep) {
  const d = drag;
  cancelDrag();
  if (!d?.live) return;
  cancelAnimationFrame(d.scrollFrame);
  d.ghost.remove();
  d.tile.classList.remove('drag-source');
  // The click that follows letting go must not open the editor.
  dragJustEnded = true;
  setTimeout(() => { dragJustEnded = false; }, 0);
  const after = dragTiles().map((t) => t.dataset.id);
  if (!keep || after.join() === d.before.join()) { render(); return; }
  const page = state.pages[ui.pageId];
  setOrder(page, after);
  const item = page.items.find((it) => it.id === d.id);
  offerUndo(`Moved “${item?.label || 'button'}”`, () => { setOrder(page, d.before); afterRestore(); });
  markChanged();
  save();
  render();
}

// Put a page's buttons in this order (ids); anything not listed keeps its place at the end.
function setOrder(page, ids) {
  const byId = new Map(page.items.map((it) => [it.id, it]));
  const ordered = ids.map((id) => byId.get(id)).filter(Boolean);
  page.items = [...ordered, ...page.items.filter((it) => !ids.includes(it.id))];
  page.orderAt = now();
}

export function init() {
  grid.addEventListener('pointerdown', (e) => {
    if (!ui.editing || drag || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const tile = e.target.closest('.tile[data-id]');
    if (!tile) return;
    drag = { tile, id: tile.dataset.id, pointerId: e.pointerId, touch: e.pointerType !== 'mouse', x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, live: false };
    if (drag.touch) drag.holdTimer = setTimeout(() => startDrag(), DRAG_HOLD_MS);
  });

  document.addEventListener('pointermove', (e) => {
    const d = drag;
    if (!d || e.pointerId !== d.pointerId) return;
    d.x = e.clientX;
    d.y = e.clientY;
    const moved = Math.hypot(d.x - d.x0, d.y - d.y0) > DRAG_SLOP;
    if (!d.live) {
      if (!moved) return;
      if (d.touch) { cancelDrag(); return; } // a swipe before the hold: let the page scroll
      startDrag();
      autoScroll();
    } else if (!d.scrollFrame) autoScroll();
    moveGhost();
    reorderUnder(d.x, d.y);
  });

  // Once a drag has started, the finger must not scroll the page.
  document.addEventListener('touchmove', (e) => { if (drag?.live) e.preventDefault(); }, { passive: false });

  document.addEventListener('pointerup', (e) => { if (drag && e.pointerId === drag.pointerId) endDrag(true); });
  document.addEventListener('pointercancel', (e) => { if (drag && e.pointerId === drag.pointerId) endDrag(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && drag?.live) endDrag(false); });
}

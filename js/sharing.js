// Sharing the board between devices through a private GitHub repository
// (the GitHub side is in sync.js).
import { STATE_VERSION, upgradePages, upgradeLook, addV10Nav, addV11Nav } from './upgrades.js';
import * as sync from './sync.js';
import { merge } from './merge.js';
import { $, now } from './util.js';
import { DEFAULT_SETTINGS, state, homeId, save, ui } from './state.js';
import { prefetchToned } from './symbols.js';
import { render, renderStrip } from './render.js';
import { showVoiceStatus, boardWords, recordNewWords, warmPage } from './voice.js';
import { EDIT_AT_KEY } from './backup.js';

//
// Modes: 'send' = the editing computer (sends with the button),
// 'both' = the school iPad (gets changes, and sends its own edits when a
// grown-up taps Done), 'receive' = gets changes only. All merge (merge.js).

const syncStatus = (text) => { $('syncStatus').textContent = text; };
const when = (iso) => (iso ? new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'never');
const linked = () => { const c = sync.config(); return c.mode !== 'off' && c.token ? c : null; };

// Whether this device sends its edits by itself when editing is done
// (default: yes on the school iPad, no on the computer, which has a Send button).
export function autoSend(c = sync.config()) {
  return c.autoSend ?? c.mode === 'both';
}
export const sendLabel = () => (sync.config().mode === 'send' ? 'Send to tablet' : 'Send changes');

// Called after every board edit: remember there's something to share (and,
// for the backup reminder, when this device last changed the board).
export function markChanged() {
  try { localStorage.setItem(EDIT_AT_KEY, String(Date.now())); } catch { /* ignore */ }
  recordNewWords();
  const m = sync.config().mode;
  if (m === 'send' || m === 'both') sync.setConfig({ unsent: true });
}

export function fillSyncFields() {
  const c = sync.config();
  $('syncMode').value = c.mode;
  $('syncRepo').value = c.repo;
  $('syncToken').value = c.token;
  $('syncFields').hidden = c.mode === 'off';
  $('syncSend').hidden = c.mode !== 'send' && c.mode !== 'both';
  $('syncSend').textContent = c.mode === 'both' ? 'Send changes now' : 'Send board to tablet';
  $('syncCheck').hidden = c.mode === 'off';
  $('syncAutoRow').hidden = c.mode === 'off';
  $('syncAuto').checked = c.auto;
  $('syncAutoSendRow').hidden = c.mode !== 'send' && c.mode !== 'both';
  $('syncAutoSend').checked = autoSend(c);
  const unsent = c.unsent && c.mode !== 'receive' ? ' · changes not sent yet' : '';
  syncStatus(c.mode === 'off' ? '' : `Last sent: ${when(c.lastSent)} · Last updated: ${when(c.lastReceived)}${unsent}`);
}

let pendingBoard = null;
let syncing = false;

// How long to wait before trying again when it isn't safe to swap.
export const SWAP_RETRY_MS = 20_000;

// Only swap the board when Robyn isn't in the middle of something.
export function safeToSwap() {
  return !ui.editing && ui.sentence.length === 0 && !document.querySelector('dialog[open]');
}

const localBoard = () => ({ pages: state.pages, deleted: state.deleted, settings: state.settings, settingsAt: state.settingsAt, stateVersion: STATE_VERSION });

// Get the shared board, merge it in, and (if upload) send the result back.
async function syncBoard({ upload = false, manual = false, report = syncStatus } = {}) {
  const c = linked();
  if (!c || syncing || !navigator.onLine) {
    if (manual && !c) report('Add the GitHub token first.');
    return;
  }
  if (!manual && !upload && !c.auto) return; // manual updates only
  syncing = true;
  try {
    if (manual) report(upload ? 'Sending…' : 'Checking…');
    const { board, changedHere, sent, adopted } = await sync.exchange(localBoard(), { upload, progress: manual ? report : () => {} });
    if (sent || upload) sync.setConfig({ unsent: false });
    if (changedHere) { pendingBoard = { ...board, adopt: adopted }; applyPendingBoard(manual || upload); }
    if (manual) {
      report(sent ? 'Sent ' + when(sync.config().lastSent) + '.'
        : changedHere ? 'Updated with the latest changes.' : 'Already up to date.');
    }
    shareRecordings();
  } catch (err) {
    if (manual) report((upload ? 'Could not send: ' : 'Could not check: ') + err.message);
  } finally {
    syncing = false;
  }
}

// The recorded voice travels with the board: fetch recordings this device
// lacks, and share any it made itself. In the background, after a sync.
let sharingClips = false;
export async function shareRecordings() {
  if (sharingClips || !linked()) return;
  sharingClips = true;
  try {
    const { got } = await sync.syncClips(boardWords());
    if (got) { warmPage(); if ($('settings').open) showVoiceStatus(); }
  } catch { /* try again on the next sync */ } finally {
    sharingClips = false;
  }
}

export function applyPendingBoard(force = false) {
  if (!pendingBoard) return;
  if (!force && !safeToSwap()) { setTimeout(applyPendingBoard, SWAP_RETRY_MS); return; }
  // Merge again with the board as it is now, so nothing edited in the
  // meantime is lost (except on first link, when this device takes the
  // shared board as it is).
  const board = pendingBoard.adopt ? pendingBoard : merge(localBoard(), pendingBoard);
  const version = pendingBoard.stateVersion || STATE_VERSION;
  pendingBoard = null;
  const before = state.settings.skin;
  const moved = upgradePages(board.pages, version, board.deleted || {});
  state.pages = board.pages;
  state.deleted = { ...board.deleted, ...Object.fromEntries(moved.map((id) => [id, now()])) };
  const keep = Object.fromEntries(sync.LOCAL_SETTINGS.map((k) => [k, state.settings[k]]));
  const settings = upgradeLook(board.settings || {}, version);
  const nav10 = addV10Nav(settings, board.pages, version);
  const nav11 = addV11Nav(nav10 || settings, board.pages, version);
  state.settings = { ...DEFAULT_SETTINGS, ...(nav11 || nav10 || settings), ...keep };
  state.settingsAt = nav10 || nav11 ? now() : board.settingsAt;
  save();
  if (!state.pages[ui.pageId]) { ui.pageId = homeId(); ui.trail = []; }
  render();
  renderStrip();
  if (state.settings.skin !== before) prefetchToned();
  if ($('settings').open) fillSyncFields();
  recordNewWords();
}

// The school iPad shares its edits when a grown-up finishes editing, and keeps
// trying (e.g. after being offline) until they've gone.
export function shareIfUnsent() {
  const c = linked();
  if (c && c.mode !== 'receive' && c.unsent && autoSend(c) && !ui.editing) { syncBoard({ upload: true }); return true; }
  return false;
}
// Regular check: share anything waiting (if sending automatically),
// otherwise look for changes.
export function syncTick() {
  if (!shareIfUnsent()) syncBoard();
}

export function init() {
  $('syncMode').addEventListener('change', (e) => {
    sync.setConfig({ mode: e.target.value, linked: false });
    fillSyncFields();
    render();
    if (e.target.value !== 'off') syncBoard({ manual: true });
  });
  $('syncRepo').addEventListener('change', (e) => sync.setConfig({ repo: e.target.value.trim() }));
  $('syncToken').addEventListener('change', (e) => sync.setConfig({ token: e.target.value.trim(), linked: false }));
  window.addEventListener('online', syncTick);

  $('syncSend').addEventListener('click', () => syncBoard({ upload: true, manual: true }));
  $('sendFromBanner').addEventListener('click', async () => {
    const btn = $('sendFromBanner');
    btn.disabled = true;
    btn.textContent = 'Sending…';
    let last = '';
    await syncBoard({ upload: true, manual: true, report: (t) => { last = t; } });
    btn.textContent = last.startsWith('Sent') ? 'Sent ✓' : 'Not sent';
    btn.title = last;
    btn.disabled = false;
    setTimeout(() => { btn.textContent = sendLabel(); }, 4000);
  });
  $('syncCheck').addEventListener('click', () => syncBoard({ manual: true }));
  // Manual sending: edits wait until someone presses Send.
  $('syncAutoSend').addEventListener('change', (e) => {
    sync.setConfig({ autoSend: e.target.checked });
    syncStatus(e.target.checked
      ? 'Changes will be sent when editing is done.'
      : 'Changes will wait until you press Send.');
    render();
    shareIfUnsent();
  });
  // Manual: the board only changes when a grown-up taps "Check for changes now".
  $('syncAuto').addEventListener('change', (e) => {
    sync.setConfig({ auto: e.target.checked });
    syncStatus(e.target.checked
      ? 'Changes will arrive by themselves.'
      : 'The board will only change when you tap Check for changes now.');
    if (e.target.checked) syncBoard({ manual: true });
  });
}

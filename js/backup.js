// Backups: the reminder, saving a backup and loading one.
import { HOME } from './board.js';
import { STATE_VERSION, upgradePages, upgradeLook, upgradeSettingsToNav, addV10Nav, addV11Nav } from './upgrades.js';
import * as photos from './photos.js';
import * as sync from './sync.js';
import { $ } from './util.js';
import { DEFAULT_SETTINGS, replaceBoard, state, homeId, save } from './state.js';
import { render } from './render.js';
import { goTo } from './interaction.js';
import { markChanged } from './sharing.js';

// When this device last saved a backup and last changed the board (see backupDue).
const BACKUP_KEY = 'taptalk.lastBackup';
export const EDIT_AT_KEY = 'taptalk.lastEdit';
const BACKUP_EVERY = 30 * 24 * 60 * 60 * 1000;

// The board lives only on this device (unless it's linked), so the Backup tab
// says when this device last saved a backup.
function showLastBackup() {
  let at = 0;
  try { at = Number(localStorage.getItem(BACKUP_KEY)) || 0; } catch { /* ignore */ }
  $('lastBackup').textContent = at ? `Last backup from this device: ${new Date(at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}.` : 'No backup saved from this device yet.';
}

// A grown-up sees "Back up" in the editing bar when this device has changes
// newer than its last backup, a month or more after that backup (or with none
// yet). Linked devices don't: their board is kept in the shared repository.
export function backupDue() {
  if (sync.config().mode !== 'off') return false;
  try {
    const backup = Number(localStorage.getItem(BACKUP_KEY)) || 0;
    const edit = Number(localStorage.getItem(EDIT_AT_KEY)) || 0;
    return edit > backup && Date.now() - backup > BACKUP_EVERY;
  } catch { return false; }
}

export function init() {
  showLastBackup();
  $('backupFromBanner').addEventListener('click', () => $('exportBtn').click());

  $('exportBtn').addEventListener('click', async () => {
    const data = {
      app: 'taptalk', version: 1, stateVersion: STATE_VERSION, saved: new Date().toISOString(),
      pages: state.pages, settings: state.settings, deleted: state.deleted, settingsAt: state.settingsAt, photos: await photos.exportAll(),
    };
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    // The child's name in the file name helps a family with more than one board.
    const who = (state.settings.childName || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const name = `taptalk-backup-${who ? who + '-' : ''}${new Date().toISOString().slice(0, 10)}.json`;
    const file = new File([blob], name, { type: 'application/json' });
    try { localStorage.setItem(BACKUP_KEY, String(Date.now())); } catch { /* ignore */ }
    showLastBackup();
    render();
    // iPad: the share sheet lets you save to Files, AirDrop or email it.
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: 'TapTalk backup' }); return; } catch (err) { if (err.name === 'AbortError') return; }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  });

  $('importFile').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (data.app !== 'taptalk' || !data.pages?.[HOME]) throw new Error('This is not a TapTalk backup.');
      if (!confirm('Replace this board with the backup?')) return;
      await photos.clear();
      await photos.importAll(data.photos || {});
      upgradePages(data.pages, data.stateVersion || 1, data.deleted || {});
      let imported = upgradeLook((data.stateVersion || 1) < 5 ? upgradeSettingsToNav(data.settings || {}, data.pages) : data.settings || {}, data.stateVersion || 1);
      imported = addV10Nav(imported, data.pages, data.stateVersion || 1) || imported;
      imported = addV11Nav(imported, data.pages, data.stateVersion || 1) || imported;
      replaceBoard(data.pages, { ...DEFAULT_SETTINGS, ...imported });
      markChanged();
      save();
      $('settings').close();
      goTo(homeId());
    } catch (err) {
      alert('Could not load backup: ' + err.message);
    }
  });
}

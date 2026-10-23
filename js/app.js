// TapTalk starts here. Each part of the app (one file each in js/) wires up
// its own buttons, in a fixed order, and then the board is drawn.
import * as gphotos from './gphotos.js';
import * as sync from './sync.js';
import { initCropper } from './cropper.js';
import { state, homeId, ui, whenSaved, init as stateInit } from './state.js';
import { render, renderStrip, init as renderInit } from './render.js';
import { showWelcome, init as settingsInit } from './settings.js';
import { recordWords, init as voiceInit } from './voice.js';
import { EDIT_KEY, init as editmodeInit } from './editmode.js';
import { SWAP_RETRY_MS, safeToSwap, syncTick, init as sharingInit } from './sharing.js';
import { openEditor, pickFromGoogle, init as editorInit } from './editor.js';
import { init as pagesInit } from './pages.js';
import { init as interactionInit } from './interaction.js';
import { init as dragInit } from './drag.js';
import { init as backupInit } from './backup.js';
import { init as aipictureInit } from './aipicture.js';
import { init as clipboardInit } from './clipboard.js';
import { init as undoInit } from './undo.js';
import { init as pickerInit } from './picker.js';
import { init as speechInit } from './speech.js';

const RECORD_AFTER_MS = 4000;      // record missing words this long after start-up
const SYNC_EVERY_MS = 5 * 60_000;  // check for a shared board this often

stateInit();
renderInit();
pagesInit();
interactionInit();
dragInit();
settingsInit();
voiceInit();
editmodeInit();
backupInit();
sharingInit();
editorInit();
aipictureInit();
clipboardInit();
undoInit();
pickerInit();
speechInit();

// Record any words not yet recorded (e.g. buttons added on the other device).
setTimeout(recordWords, RECORD_AFTER_MS);

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  // updateViaCache 'none': when checking for a new version, fetch the file
  // list (precache.js) fresh too, never a stale HTTP-cached copy.
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then((reg) => reg.update()).catch(() => {});
  // When a new version takes over, reload into it — but only when nobody is
  // mid-sentence or editing, so the board never changes under Robyn's finger.
  if (navigator.serviceWorker.controller) {
    navigator.serviceWorker.addEventListener('controllerchange', function reloadWhenSafe() {
      if (safeToSwap()) whenSaved().then(() => location.reload());
      else setTimeout(reloadWhenSafe, SWAP_RETRY_MS);
    });
  }
}

initCropper();
try { if (sync.config().mode === 'send' && sessionStorage.getItem(EDIT_KEY)) ui.editing = true; } catch { /* ignore */ }
render();
renderStrip();
if (state.fresh) showWelcome();

syncTick();
setInterval(syncTick, SYNC_EVERY_MS);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncTick(); });

// Back from Google sign-in: reopen the editor where we left it and carry on.
const back = gphotos.takeResume();
if (back?.resume?.draft) {
  const { resume } = back;
  ui.pageId = state.pages[resume.pageId] ? resume.pageId : homeId();
  ui.editing = true;
  render();
  openEditor(resume.draft, resume.draftIsNew);
  if (back.ok) pickFromGoogle();
  else if (back.error !== 'access_denied') alert('Google sign-in did not work: ' + back.error);
}

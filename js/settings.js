// The Settings dialog, starting again from the starting board, and the
// welcome on first start.
import { buildDefaultPages } from './upgrades.js';
import * as photos from './photos.js';
import * as sync from './sync.js';
import { openSheet } from './sheet.js';
import * as ai from './aipics.js';
import { $ } from './util.js';
import { DEFAULT_SETTINGS, applyChildName, touchSettings, replaceBoard, state, ensureSets, homeId, save, ui } from './state.js';
import { prefetchToned } from './symbols.js';
import { speak } from './speech.js';
import { render, renderStrip } from './render.js';
import { goTo } from './interaction.js';
import { showVoiceStatus } from './voice.js';
import { markChanged, fillSyncFields } from './sharing.js';
import { readTrash, restoreButton } from './undo.js';

const SKIN_TONES = ['#ffeec8', '#f6d2a9', '#e0ac7e', '#c08654', '#8d5a33', '#5c3a21'];

function renderTrash() {
  const list = readTrash();
  $('trashSection').hidden = !list.length;
  $('trashList').replaceChildren(...list.map((entry) => {
    const row = document.createElement('div');
    row.className = 'row';
    const name = document.createElement('span');
    name.textContent = `${entry.item.label} — ${state.pages[entry.pageId]?.name || 'Home'}`;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pill';
    btn.textContent = 'Restore';
    btn.addEventListener('click', () => { restoreButton(entry); renderTrash(); });
    row.append(name, btn);
    return row;
  }));
}

// Settings tabs; the last one used is remembered.
const TAB_KEY = 'taptalk.settingsTab';
function showTab(name) {
  for (const t of document.querySelectorAll('#settings .tab')) t.setAttribute('aria-selected', String(t.dataset.tab === name));
  for (const p of document.querySelectorAll('#settings .tab-panel')) p.hidden = p.dataset.panel !== name;
  try { sessionStorage.setItem(TAB_KEY, name); } catch { /* not important */ }
}

export function openSettings() {
  let tab = 'board';
  try { tab = sessionStorage.getItem(TAB_KEY) || 'board'; } catch { /* default */ }
  showTab(tab);
  renderTrash();
  const s = state.settings;
  $('startEditing').hidden = ui.editing;
  $('setCols').value = String(s.cols);
  $('setRows').value = String(s.rows || 4);
  $('setSidebar').checked = s.sidebar;
  $('setCorners').value = String(s.corners);
  $('setOutline').value = String(s.outline);
  $('aiKey').value = ai.key();
  $('aiQuality').value = s.aiQuality || 'low';
  $('aiPrompt').value = s.aiPrompt || ai.DEFAULT_PROMPT;
  $('setCoreStrip').checked = s.coreStrip;
  $('setLabels').checked = s.labels;
  $('setAutoHome').checked = s.autoHome;
  $('setDebounce').value = String(s.debounce);
  $('setSpeakTap').checked = s.speakOnTap;
  showVoiceStatus();
  renderSwatches();
  fillSyncFields();
  $('installHint').textContent = isStandalone()
    ? 'Installed on this device — works offline.'
    : 'To install: on iPad, open in Safari, tap Share, then "Add to Home Screen". On Android, open in Chrome, tap ⋮, then "Add to Home screen".';
  openSheet($('settings'));
}

function renderSwatches() {
  $('skinSwatches').replaceChildren(...SKIN_TONES.map((tone) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'swatch';
    b.style.background = tone;
    b.setAttribute('aria-label', 'Skin colour');
    b.setAttribute('aria-pressed', String(tone === state.settings.skin));
    b.addEventListener('click', () => { state.settings.skin = tone; touchSettings(); markChanged(); save(); renderSwatches(); render(); renderStrip(); prefetchToned(); });
    return b;
  }));
}

function bindSetting(id, key, read) {
  $(id).addEventListener('change', (e) => {
    state.settings[key] = read(e.target);
    if (!sync.LOCAL_SETTINGS.includes(key)) { touchSettings(); markChanged(); }
    save();
    render();
  });
}

// First start (and after a reset): who the board is for. Optional; the name
// goes into About me ("Hello, I'm …").
export function showWelcome() {
  $('welcomeName').value = state.settings.childName || '';
  $('welcome').showModal();
}

function isStandalone() {
  return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
}

export function init() {
  for (const t of document.querySelectorAll('#settings .tab')) t.addEventListener('click', () => showTab(t.dataset.tab));
  bindSetting('setCols', 'cols', (el) => Number(el.value));
  bindSetting('setRows', 'rows', (el) => Number(el.value));
  bindSetting('setSidebar', 'sidebar', (el) => el.checked);
  bindSetting('setCorners', 'corners', (el) => Number(el.value));
  bindSetting('setOutline', 'outline', (el) => Number(el.value));
  bindSetting('setCoreStrip', 'coreStrip', (el) => el.checked);
  bindSetting('setLabels', 'labels', (el) => el.checked);
  bindSetting('setAutoHome', 'autoHome', (el) => el.checked);
  bindSetting('setDebounce', 'debounce', (el) => Number(el.value));
  bindSetting('setSpeakTap', 'speakOnTap', (el) => el.checked);

  $('testVoice').addEventListener('click', () => speak('Hello! I want to play.').finally(showVoiceStatus));

  $('resetBtn').addEventListener('click', async () => {
    if (!confirm('Reset to the starting board? Your changes and photos will be removed.')) return;
    replaceBoard(buildDefaultPages(state.settings.childName), { ...DEFAULT_SETTINGS, voice: state.settings.voice, childName: state.settings.childName });
    ensureSets(state.settings); // the starting sets, saved and shared with the reset
    await photos.clear();
    markChanged();
    save();
    ui.sentence = [];
    renderStrip();
    $('settings').close();
    goTo(homeId());
    showWelcome();
  });
  $('welcomeStart').addEventListener('click', () => {
    const name = $('welcomeName').value.trim().replace(/\s+/g, ' ').slice(0, 40);
    state.settings.childName = name;
    touchSettings();
    applyChildName(name);
    markChanged();
    save(); // also keeps a first start from asking again
    render();
    $('welcome').close();
  });
  $('welcomeName').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('welcomeStart').click(); } });
}

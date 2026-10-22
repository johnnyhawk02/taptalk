// Speaking: the recorded voice, with the iPad's own voice as a backup, and
// waking the sound on the first tap.
import * as clips from './clips.js';

// TapTalk has one voice, built in: Coral, a recorded AI voice. Every button's
// words are recordings (the starting board's ship with the app; others come
// with the shared board), and a sentence plays its words' recordings in turn.
// The iPad's own voice is only a backup, for a brand-new word not yet recorded.

let voices = [];

function loadVoices() {
  if (!('speechSynthesis' in window)) return;
  voices = speechSynthesis.getVoices().filter((v) => v.lang.startsWith('en'));
  // The backup: a British English voice on the iPad, the best quality first.
  const score = (v) => (/GB/.test(v.lang) ? 4 : 0) + (v.localService ? 2 : 0) + (/premium|enhanced/i.test(v.voiceURI) ? 1 : 0);
  voices.sort((a, b) => score(b) - score(a));
}
const backupVoice = () => voices[0] || null;

export function stopSpeaking() {
  clips.stop();
  if ('speechSynthesis' in window) speechSynthesis.cancel();
}

// text: what to say, or a sentence's words (each word's recording in turn).
export function speak(textOrWords) {
  const words = (Array.isArray(textOrWords) ? textOrWords : [textOrWords]).filter(Boolean);
  const text = words.join(' ');
  if (!text) return Promise.resolve();
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  // A word with no recording yet (offline) falls back to the iPad voice.
  return clips.speak(clips.VOICE, words).then((ok) => (ok ? undefined : speakOnDevice(text))).catch(() => speakOnDevice(text));
}

function speakOnDevice(text) {
  clips.stop();
  if (!('speechSynthesis' in window)) return Promise.resolve();
  speechSynthesis.cancel();
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    const v = backupVoice();
    if (v) { u.voice = v; u.lang = v.lang; } else { u.lang = 'en-GB'; }
    u.rate = 0.9;
    u.onend = u.onerror = () => resolve();
    speechSynthesis.speak(u);
  });
}
// iPads only let sound start from a tap: wake the recordings' audio, and the
// backup iPad voice too (by saying nothing), so either can speak later even
// after a short wait. Done on touch-end/click too, which some iPads require.
let speechUnlocked = false;
function unlockSound() {
  clips.unlock();
  if (!speechUnlocked && 'speechSynthesis' in window) {
    speechUnlocked = true;
    const u = new SpeechSynthesisUtterance(' ');
    u.volume = 0;
    speechSynthesis.speak(u);
  }
}

// Called once at start-up.
export function init() {
  if ('speechSynthesis' in window) {
    loadVoices();
    speechSynthesis.addEventListener?.('voiceschanged', loadVoices);
  }
  for (const ev of ['pointerdown', 'touchend', 'click']) document.addEventListener(ev, unlockSound, { capture: true, passive: true });
}

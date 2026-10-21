// Makes button pictures with OpenAI's image model: transparent PNGs drawn in
// one style, from a base prompt the grown-ups can edit (Settings → Pictures).
// The OpenAI key stays in this device's storage; it is never put in the
// shared board.

const KEY = 'taptalk.ai';
const MODEL = 'gpt-image-1';

export const DEFAULT_PROMPT = 'A simple AAC communication symbol for a young child. Bold dark outline, flat bright colours, '
  + 'no shading or texture, no text, letters or numbers. Centred, filling most of the square. '
  + 'Clear and instantly recognisable even when small, in the style of a pictogram. Transparent background.';

// Rough price per picture (1024 × 1024), in pence.
export const PENCE = { low: 1, medium: 3, high: 13 };

export function key() {
  try { return JSON.parse(localStorage.getItem(KEY))?.key || ''; } catch { return ''; }
}

export function setKey(value) {
  localStorage.setItem(KEY, JSON.stringify({ key: value.trim() }));
}

// The button's colour says what kind of word it is, which helps the picture.
export function subjectFor(text, type) {
  if (type === 'noun') return `Subject: ${text}.`;
  if (type === 'pron') return `Subject: ${text}, shown as a friendly simple person.`;
  if (type === 'verb') return `Subject: a simple child figure showing the action "${text}".`;
  if (type === 'desc') return `Subject: the idea "${text}", shown with a simple child figure or object.`;
  return `Subject: the idea "${text}", shown as simply as possible.`;
}

/** Make one picture; resolves to a PNG blob. */
export async function make(prompt, { quality = 'low', signal } = {}) {
  const k = key();
  if (!k) throw new Error('Add an OpenAI key first (⚙ Settings → Pictures).');
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    signal,
    headers: { Authorization: 'Bearer ' + k, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, prompt, n: 1, size: '1024x1024', quality, background: 'transparent', output_format: 'png' }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = body.error?.message || '';
    if (res.status === 401) throw new Error('The OpenAI key was refused. Check it in ⚙ Settings → Pictures.');
    if (/credit|billing|quota/i.test(msg)) throw new Error('No OpenAI credit left. Add some at platform.openai.com.');
    if (/safety|moderation/i.test(msg)) throw new Error('OpenAI\'s safety filter blocked this one. Try other words.');
    if (/verif/i.test(msg)) throw new Error('OpenAI wants the account verified first (platform.openai.com → Settings → Organization).');
    throw new Error(msg || `OpenAI said ${res.status}.`);
  }
  const bytes = Uint8Array.from(atob(body.data[0].b64_json), (c) => c.charCodeAt(0));
  return new Blob([bytes], { type: 'image/png' });
}

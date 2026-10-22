// Small helpers used all over TapTalk.

export const $ = (id) => document.getElementById(id);
export const uid = () => 'i' + Math.random().toString(36).slice(2, 10);

// Edit times let two devices' boards be merged (see merge.js).
export const now = () => Date.now();

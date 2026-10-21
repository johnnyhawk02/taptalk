// Opens a dialog, with a safety net: if the browser lays it out with no height
// (seen on iPad, where only the grey backdrop showed), give it an explicit one.

export function openSheet(dialog) {
  dialog.style.removeProperty('height');
  dialog.showModal();
  // Focus the pop-up itself rather than its first button, so Safari doesn't
  // draw a focus ring round Close/Cancel every time.
  dialog.tabIndex = -1;
  dialog.focus({ preventScroll: true });
  const check = () => {
    if (dialog.open && dialog.getBoundingClientRect().height < 40) {
      dialog.style.height = Math.max(240, window.innerHeight - 48) + 'px';
    }
  };
  check();
  requestAnimationFrame(check);
  setTimeout(check, 250);
}

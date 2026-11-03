// Shared by nested native dialogs so closing one never unlocks another's scroll.
let openCount = 0;
let originalOverflow = "";
export function lockBodyScroll() {
  if (openCount === 0) {
    originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  openCount += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    openCount -= 1;
    if (openCount === 0) document.body.style.overflow = originalOverflow;
  };
}

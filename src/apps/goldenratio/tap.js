// Tap handling that does not depend on the browser's "click": after a swipe, Chrome (and sometimes Safari)
// drops the click of the next tap. A tap here is a finger or mouse lifted within 10 px of where it went down.
// Keyboard activation (Enter/Space on a focused button) and test clicks still arrive as a click with detail 0.
const MOVE_PX = 10;

export const noGhostClick = (e) => { if (e.cancelable) e.preventDefault(); };

export function tapProps(fn) {
  let start = null;
  return {
    onPointerDown: (e) => { start = { x: e.clientX, y: e.clientY }; },
    onPointerUp: (e) => {
      const s = start; start = null;
      if (s && Math.hypot(e.clientX - s.x, e.clientY - s.y) <= MOVE_PX) fn(e);
    },
    onPointerCancel: () => { start = null; },
    // we handle the tap ourselves, so stop the browser's late click from landing on whatever slides under the finger
    onTouchEnd: (e) => { if (e.cancelable) e.preventDefault(); },
    onClick: (e) => { if (e.detail === 0) fn(e); },
  };
}

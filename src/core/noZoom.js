// No pinch-zoom. Scrolling is untouched.
// Three layers, because iOS Safari ignores "user-scalable=no" in some situations:
//  1. index.html viewport: maximum-scale=1, user-scalable=no (also stops the zoom iOS does when a text box gets focus).
//  2. index.html CSS: touch-action: pan-x pan-y (panning only: no pinch, no double-tap zoom).
//  3. This file: cancel Safari's own pinch events (gesturestart / gesturechange / gestureend) and any
//     two-finger touchmove, which is what is left when 1 and 2 are not honoured.
// A double-tap is deliberately NOT cancelled here: cancelling touchend would also swallow quick, real taps on buttons.
export function blockZoom(doc = document) {
  const stop = (e) => { if (e.cancelable) e.preventDefault(); };
  const twoFingers = (e) => { if (e.touches && e.touches.length > 1) stop(e); };
  const opts = { passive: false };
  doc.addEventListener("gesturestart", stop, opts);
  doc.addEventListener("gesturechange", stop, opts);
  doc.addEventListener("gestureend", stop, opts);
  doc.addEventListener("touchmove", twoFingers, opts);
  return () => {
    doc.removeEventListener("gesturestart", stop, opts);
    doc.removeEventListener("gesturechange", stop, opts);
    doc.removeEventListener("gestureend", stop, opts);
    doc.removeEventListener("touchmove", twoFingers, opts);
  };
}

import { useEffect, useRef } from "react";
import { flushSync } from "react-dom";

// Long-press the background of an exercise card, then drag it up or down to a new place in the list. Vertical only.
// Cards are marked data-excard. Things you can tap inside a card (boxes, buttons, icons, the exercise name, which has its own long-press)
// never start a drag. While dragging, the list scrolls by itself near the top and bottom edge.
export const HOLD_MS = 500, MOVE_SLOP = 10, EDGE = 80;
const SKIP = 'input,textarea,select,button,svg,a,[data-nodrag],[data-testid="overload-popover"]';

// Where the dragged card (index `from`, moved `dy` px from its start) would land, and how far each other card
// slides to make room. Positions are the cards' original tops and heights; `gap` is the space between cards.
export function layoutDrag(tops, heights, from, dy, gap) {
  const center = tops[from] + heights[from] / 2 + dy;
  const step = heights[from] + gap;
  const shifts = tops.map(() => 0);
  let to = from;
  tops.forEach((top, k) => {
    if (k === from) return;
    const mid = top + heights[k] / 2;
    if (k < from && center < mid) { shifts[k] = step; to -= 1; }
    else if (k > from && center > mid) { shifts[k] = -step; to += 1; }
  });
  return { to, shifts };
}

// `ref` is the scrolling list. `onDrop(from, to)` is called once, when the card is let go in a new place.
export function useReorder(ref, onDrop, onPick) {
  const cb = useRef({ onDrop, onPick });
  cb.current = { onDrop, onPick };
  useEffect(() => {
    const box = ref.current;
    if (!box) return undefined;
    let s = null; // the press in progress: { timer, drag, x, y, card, ... }
    const clearStyles = (els) => els.forEach((el) => { el.style.transform = ""; el.style.transition = ""; el.style.zIndex = ""; el.style.boxShadow = ""; });
    const update = () => {
      const dy = s.y - s.startY + (box.scrollTop - s.startScroll);
      const { to, shifts } = layoutDrag(s.tops, s.heights, s.from, dy, s.gap);
      s.to = to;
      s.els.forEach((el, k) => { el.style.transform = k === s.from ? `translateY(${dy}px) scale(1.02)` : shifts[k] ? `translateY(${shifts[k]}px)` : ""; });
    };
    const loop = () => {
      if (!s || !s.drag) return;
      const r = box.getBoundingClientRect();
      const v = s.y < r.top + EDGE ? -Math.ceil(((r.top + EDGE - s.y) / EDGE) * 14) : s.y > r.bottom - EDGE ? Math.ceil(((s.y - (r.bottom - EDGE)) / EDGE) * 14) : 0;
      if (v) { box.scrollTop += v; update(); }
      s.raf = requestAnimationFrame(loop);
    };
    const activate = () => {
      s.timer = null;
      const els = [...box.querySelectorAll("[data-excard]")];
      const from = els.indexOf(s.card);
      if (from < 0 || els.length < 2) { s = null; return; }
      const br = box.getBoundingClientRect();
      const rects = els.map((el) => el.getBoundingClientRect());
      Object.assign(s, {
        drag: true, els, from, to: from, startY: s.y, startScroll: box.scrollTop,
        tops: rects.map((r) => r.top - br.top + box.scrollTop), heights: rects.map((r) => r.height),
      });
      s.gap = els.length > 1 ? s.tops[1] - s.tops[0] - s.heights[0] : 0;
      els.forEach((el, k) => { el.style.transition = k === from ? "none" : "transform 150ms ease"; });
      s.card.style.zIndex = "20";
      s.card.style.boxShadow = "0 10px 28px rgba(0,0,0,.55)";
      try { if (navigator.vibrate) navigator.vibrate(15); } catch { /* not supported */ }
      if (cb.current.onPick) cb.current.onPick();
      s.raf = requestAnimationFrame(loop);
    };
    const end = (commit) => {
      if (!s) return;
      const cur = s; s = null;
      if (cur.timer) clearTimeout(cur.timer);
      if (!cur.drag) return;
      cancelAnimationFrame(cur.raf);
      if (commit && cur.to !== cur.from) {
        // Re-draw in the new order first, then clear the sliding styles in the same moment, so nothing jumps.
        flushSync(() => cb.current.onDrop(cur.from, cur.to));
        clearStyles(cur.els);
      } else {
        cur.card.style.transition = "transform 150ms ease";
        cur.els.forEach((el) => { el.style.transform = ""; });
        setTimeout(() => clearStyles(cur.els), 170);
      }
    };
    const begin = (target, x, y) => {
      end(false);
      const card = target.closest && target.closest("[data-excard]");
      if (!card || target.closest(SKIP)) return;
      s = { x, y, startX: x, startY: y, card, drag: false, timer: setTimeout(activate, HOLD_MS) };
    };
    const move = (x, y, e) => {
      if (!s) return;
      s.x = x; s.y = y;
      if (!s.drag) { if (Math.abs(x - s.startX) > MOVE_SLOP || Math.abs(y - s.startY) > MOVE_SLOP) end(false); return; } // it was a scroll
      if (e.cancelable) e.preventDefault(); // dragging a card must not scroll the page under your finger
      update();
    };
    const onTS = (e) => { if (e.touches.length === 1) begin(e.target, e.touches[0].clientX, e.touches[0].clientY); else end(false); };
    const onTM = (e) => { if (e.touches.length === 1) move(e.touches[0].clientX, e.touches[0].clientY, e); };
    const onTE = (e) => end(e.type === "touchend");
    const onMD = (e) => { if (e.button === 0) begin(e.target, e.clientX, e.clientY); };
    const onMM = (e) => move(e.clientX, e.clientY, e);
    const onMU = () => end(true);
    const onCtx = (e) => { if (e.target.closest && e.target.closest("[data-excard]") && !e.target.closest("input,textarea")) e.preventDefault(); };
    // touchmove is registered as non-passive from the start: that is what lets a drag stop the list scrolling.
    box.addEventListener("touchstart", onTS, { passive: true });
    box.addEventListener("touchmove", onTM, { passive: false });
    box.addEventListener("touchend", onTE);
    box.addEventListener("touchcancel", onTE);
    box.addEventListener("mousedown", onMD);
    box.addEventListener("contextmenu", onCtx);
    document.addEventListener("mousemove", onMM);
    document.addEventListener("mouseup", onMU);
    return () => {
      end(false);
      box.removeEventListener("touchstart", onTS);
      box.removeEventListener("touchmove", onTM);
      box.removeEventListener("touchend", onTE);
      box.removeEventListener("touchcancel", onTE);
      box.removeEventListener("mousedown", onMD);
      box.removeEventListener("contextmenu", onCtx);
      document.removeEventListener("mousemove", onMM);
      document.removeEventListener("mouseup", onMU);
    };
  }, [ref]);
}

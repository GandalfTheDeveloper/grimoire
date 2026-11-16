// One past calculation: box a (about 62% wide) and box b on top, a+b across the full width below.
// White = the value you typed, gold = calculated.
// Tap the card: load it back into the fields. Hold a value (half a second): copy it.
// Swipe the card left: a Delete button appears (history screen only).
import { useRef, useState } from "react";
import { formatMm, copyText, unitOf } from "./units.js";
import { tapProps } from "./tap.js";

const HOLD_MS = 500, MOVE_PX = 10, OPEN_PX = 88;

function Box({ field, entry, label, onHoldValue }) {
  const typed = entry.known === field;
  const unit = entry.units[field];
  // Cards show the main value only (the exact decimal beside a fraction is in the fields when you load the card).
  const main = typed ? entry.typed : formatMm(entry.mm[field], unit, { tape: entry.tape }).main;
  const long = field === "b" ? main.length > 7 : main.length > 13; // shrink rather than cut off
  return (
    <div className={`gx-box gx-box-${field}`} data-field={field} data-testid={`gx-box-${field}`}>
      <span className="gx-blabel">{label}</span>
      <span className={"gx-bval " + (typed ? "gx-typed" : "gx-calc") + (long ? " gx-long" : "")} data-hold={field} data-testid={`gx-val-${field}`}>
        {main}
      </span>
      <span className="gx-bunit">{unitOf(unit).label}</span>
    </div>
  );
}

export function valueCopyText(entry, field, withUnit = true) {
  if (entry.known === field) return copyText(entry.typed.trim(), entry.units[field], withUnit);
  return copyText(formatMm(entry.mm[field], entry.units[field], { tape: entry.tape }).main, entry.units[field], withUnit);
}

export default function HistoryCard({ entry, swipe, copyUnit = true, onLoad, onCopy, onDelete }) {
  const [dx, setDx] = useState(0);
  const g = useRef(null);
  const end = () => { if (g.current && g.current.timer) clearTimeout(g.current.timer); };

  const down = (e) => {
    const holdField = e.target.closest && e.target.closest("[data-hold]") ? e.target.closest("[data-hold]").getAttribute("data-hold") : null;
    g.current = { x: e.clientX, y: e.clientY, start: dx, moved: false, swiping: false, held: false, timer: null };
    if (holdField) g.current.timer = setTimeout(() => {
      if (g.current && !g.current.moved) { g.current.held = true; if (navigator.vibrate) navigator.vibrate(15); onCopy(valueCopyText(entry, holdField, copyUnit)); }
    }, HOLD_MS);
  };
  const move = (e) => {
    const s = g.current;
    if (!s) return;
    const mx = e.clientX - s.x, my = e.clientY - s.y;
    if (!s.moved && Math.hypot(mx, my) > MOVE_PX) { s.moved = true; end(); s.swiping = swipe && Math.abs(mx) > Math.abs(my); }
    if (s.swiping) setDx(Math.max(-OPEN_PX, Math.min(0, s.start + mx)));
  };
  const up = () => {
    const s = g.current;
    end();
    g.current = null;
    if (!s) return;
    if (s.swiping) { setDx((v) => (v < -OPEN_PX / 2 ? -OPEN_PX : 0)); return; }
    if (s.held || s.moved) return;
    if (dx !== 0) { setDx(0); return; }
    onLoad(entry);
  };

  return (
    <div className="gx-cardwrap" data-testid="gx-card" data-demo={entry.demo ? "1" : "0"}>
      {swipe && <button type="button" className="gx-del" data-testid="gx-del" {...tapProps(() => { setDx(0); onDelete(entry); })}>Delete</button>}
      <div className="gx-card" style={{ transform: dx ? `translateX(${dx}px)` : undefined }}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => { end(); g.current = null; setDx((v) => (v < -OPEN_PX / 2 ? -OPEN_PX : 0)); }}
        onContextMenu={(e) => e.preventDefault()}
        onClick={(e) => { if (e.detail === 0) onLoad(entry); }} role="button" tabIndex={0} aria-label="Load this calculation">
        <div className="gx-cardrow">
          <Box field="a" entry={entry} label="a" />
          <Box field="b" entry={entry} label="b" />
        </div>
        <Box field="whole" entry={entry} label="a+b" />
      </div>
    </div>
  );
}

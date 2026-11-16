// The Golden Ratio calculator, as one self-contained piece.
// It sizes itself to the box it is put in (not the whole screen), keeps its own state, and reads and writes
// history through Grimoire's data layer, so another app can later show it as a pop-up with no changes here:
//   <GoldenCalculator source="projects" />
// (source is saved on each history entry so a projects app could later list only its own calculations).
//
// Three screens:
//   default  history (as much as fits) > graphic > three fields
//   typing   one history card > graphic > three fields > number pad        (tap a field)
//   history  history fills the screen > graphic pinned at the bottom          (scroll up into the history)
// Back to default: scroll back down past the newest card, or tap the graphic.
// Tapping the graphic also clears every field (the Clear key on the pad does the same and keeps the pad open).
// Either way the calculation on screen is saved to history first, so clearing never loses anything.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./golden.css";
import { FIELDS, solve } from "./math.js";
import { UNITS, parseToMm, formatMm, editableText, copyText, isImperial, DEFAULT_UNIT } from "./units.js";
import { applyKey } from "./entry.js";
import { useHistory, loadSession, saveSession, sessionExpired, defaultSession, APP_ID } from "./store.js";
import { useGoldenSettings } from "./settings.js";
import Graphic from "./Graphic.jsx";
import Keypad from "./Keypad.jsx";
import HistoryCard from "./HistoryCard.jsx";
import { tapProps } from "./tap.js";

const LABELS = { a: "Longer section (a)", b: "Shorter section (b)", whole: "Whole (a + b)" };
const SHORT = { a: "a", b: "b", whole: "a+b" };
const PULL_PX = 40; // how far past the newest card you pull to get back to the fields
const WHEEL_GAP_MS = 300; // a pause this long between wheel ticks starts a new wheel gesture

async function writeClipboard(text) {
  try { if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(text); return true; } } catch { /* fall through */ }
  try {
    const ta = document.createElement("textarea");
    ta.value = text; ta.setAttribute("readonly", ""); ta.style.position = "absolute"; ta.style.left = "-9999px";
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand && document.execCommand("copy");
    ta.remove();
    return !!ok;
  } catch { return false; }
}

export default function GoldenCalculator({ source = APP_ID }) {
  const hist = useHistory();
  const settings = useGoldenSettings();
  const [mode, setMode] = useState("default");
  const [session, setSession] = useState(() => loadSession());
  const [known, setKnown] = useState(null); // field you typed in (white); the other two are calculated (gold)
  const [text, setText] = useState("");
  const [active, setActive] = useState(null); // field being typed into (number pad open)
  const [replace, setReplace] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);
  const [toast, setToast] = useState("");
  const dirty = useRef(false); // there is an edit that has not gone into history yet
  const lastValid = useRef(null);
  const lastSaved = useRef(null);
  const histRef = useRef(null);
  const touch = useRef(null);

  const { units, tape } = session;
  const knownMm = known ? parseToMm(text, units[known]) : null;
  const solved = knownMm ? solve(known, knownMm) : null;
  if (solved) lastValid.current = solved;
  if (!known || text.trim() === "") lastValid.current = null;
  const results = solved || lastValid.current; // while a value is half-typed ("3 5/"), keep showing the last answer

  // ---- session: units and tape mode stay until 30 minutes without use ----
  const updateSession = useCallback((fn) => {
    setSession((s) => { const next = fn(s); saveSession(next); return next; });
  }, []);
  const touchSession = useCallback(() => saveSession(session), [session]);
  useEffect(() => {
    const t = setInterval(() => { if (sessionExpired()) { const d = defaultSession(); setSession(d); } }, 60000);
    return () => clearInterval(t);
  }, []);

  // ---- committing to history ----
  const state = useRef({});
  state.current = { known, text, units, tape, knownMm, solved, source };
  const commit = useCallback(() => {
    const s = state.current;
    if (!dirty.current || !s.known || !s.solved) return;
    dirty.current = false;
    const entry = { known: s.known, typed: s.text.trim(), units: { ...s.units }, mm: s.solved, tape: !!s.tape, source: s.source };
    // the same as the newest card (or the one just saved, before the list has reloaded): don't save it again
    const same = (x) => x && x.known === entry.known && x.typed === entry.typed && FIELDS.every((f) => x.units[f] === entry.units[f]) && !!x.tape === entry.tape;
    if (same(hist.items[hist.items.length - 1]) || same(lastSaved.current)) return;
    lastSaved.current = entry;
    hist.add(entry);
  }, [hist]);
  const commitRef = useRef(commit);
  commitRef.current = commit;
  useEffect(() => {
    const onHide = () => { if (document.visibilityState === "hidden") commitRef.current(); };
    document.addEventListener("visibilitychange", onHide);
    return () => { document.removeEventListener("visibilitychange", onHide); commitRef.current(); };
  }, []);

  const flash = (msg) => { setToast(msg); clearTimeout(flash.t); flash.t = setTimeout(() => setToast(""), 1600); };
  const copy = async (t) => { flash((await writeClipboard(t)) ? `Copied ${t}` : "Couldn't copy"); };

  const goDefault = () => { commit(); setActive(null); setCopyOpen(false); setMode("default"); };

  // ---- clearing: save what is on screen to history, then empty all three fields ----
  const clearFields = (keepField) => {
    commit();
    dirty.current = false;
    lastValid.current = null;
    live.current = { text: "", replace: false };
    setKnown(keepField || null); setText(""); setReplace(false); setCopyOpen(false);
  };
  const onGraphic = () => { clearFields(null); setActive(null); setMode("default"); };
  const onClear = () => { touchSession(); clearFields(active); }; // the pad stays open on the same field

  // ---- fields ----
  const openField = (f) => {
    touchSession();
    setCopyOpen(false);
    if (f !== known) {
      commit();
      // typing over a calculated value: it starts filled in, and the first key replaces it
      const start = results ? editableText(results[f], units[f], { tape: tape && isImperial(units[f]) }) : "";
      setKnown(f); setText(start); setReplace(!!start);
    } else setReplace(false);
    setActive(f);
    setMode("typing");
  };

  const changeUnit = (f, unit) => {
    updateSession((s) => ({ ...s, units: { ...s.units, [f]: unit } }));
    if (f === known) {
      // your own value keeps its number (you probably picked the wrong unit). A feet-and-inches value moving
      // to a single unit is converted, since "5' 3" has no meaning in mm.
      if (text.includes("'") && unit !== "ftin") {
        const mm = parseToMm(text, units[f]);
        if (mm) setText(editableText(mm, unit));
      }
      setReplace(false);
      dirty.current = true;
    }
  };

  // Reads the latest text from a ref, so two taps faster than a screen redraw both count.
  const live = useRef({ text: "", replace: false });
  live.current = { text, replace };
  const onKey = (k) => {
    touchSession();
    setCopyOpen(false);
    const cur = live.current;
    const next = applyKey(cur.text, cur.replace, k);
    live.current = { text: next, replace: false };
    setReplace(false);
    if (next !== cur.text) { setText(next); dirty.current = true; }
  };

  const onTape = () => {
    updateSession((s) => {
      const on = !s.tape;
      // a fraction of a millimetre means nothing: turning tape mode on in a metric field switches it to inches
      const u = { ...s.units };
      if (on && active && !isImperial(u[active])) { u[active] = "in"; if (active === known) dirty.current = true; }
      return { ...s, tape: on, units: u };
    });
  };

  const onCopy = (f) => {
    setCopyOpen(false);
    if (f === known && text.trim()) return copy(copyText(text.trim(), units[f], settings.copyUnit));
    if (!results) return flash("Nothing to copy yet");
    copy(copyText(formatMm(results[f], units[f], { tape: tape && isImperial(units[f]) }).main, units[f], settings.copyUnit));
  };

  const loadEntry = (e) => {
    commit();
    updateSession((s) => ({ ...s, units: { ...e.units }, tape: !!e.tape }));
    setKnown(e.known); setText(e.typed); setReplace(false); dirty.current = false; lastSaved.current = e;
    setActive(null); setCopyOpen(false); setMode("default");
  };

  // ---- computer keyboard (digits, . / space ' backspace, Delete for Clear, Enter or Esc for Done) ----
  const keyRef = useRef(null);
  keyRef.current = { onKey, goDefault, onClear, active };
  useEffect(() => {
    const onDown = (e) => {
      const r = keyRef.current;
      if (!r.active || e.metaKey || e.ctrlKey || e.altKey) return;
      const map = { ".": ".", ",": ".", "/": "/", " ": "space", "'": "feet", Backspace: "back" };
      if (/^[0-9]$/.test(e.key)) { e.preventDefault(); r.onKey(e.key); }
      else if (map[e.key]) { e.preventDefault(); r.onKey(map[e.key]); }
      else if (e.key === "Delete") { e.preventDefault(); r.onClear(); }
      else if (e.key === "Enter" || e.key === "Escape") { e.preventDefault(); r.goDefault(); }
    };
    window.addEventListener("keydown", onDown);
    return () => window.removeEventListener("keydown", onDown);
  }, []);

  // ---- history scrolling ----
  // Scrolling UP into the history (finger down, wheel up) grows it to the history screen.
  // On the history screen, scrolling DOWN past the newest card (it is already at the bottom when the gesture
  // starts, then the finger keeps pulling up) goes back to the default screen with the fields.
  // A gesture that only reaches the bottom does not count; that stops a fling from bouncing you out of the history.
  const toHistory = () => { if (mode === "history") return; commit(); setActive(null); setCopyOpen(false); setMode("history"); };
  const toFields = () => { setCopyOpen(false); setMode("default"); };
  const atBottom = () => { const el = histRef.current; return !el || el.scrollTop + el.clientHeight >= el.scrollHeight - 2; };
  const onHistTouchStart = (e) => {
    touch.current = e.touches && e.touches[0] ? { y: e.touches[0].clientY, bottom: atBottom() } : null;
  };
  const onHistTouchMove = (e) => {
    const t = touch.current;
    if (!t || !e.touches || !e.touches[0]) return;
    const dy = e.touches[0].clientY - t.y; // > 0: finger moving down (toward older cards)
    if (mode !== "history") { if (dy > 8) { touch.current = null; toHistory(); } return; }
    if (t.bottom && dy < -PULL_PX && atBottom()) { touch.current = null; toFields(); }
  };
  const wheel = useRef({ last: 0, startBottom: false });
  const onHistWheel = (e) => {
    const now = Date.now(), w = wheel.current;
    if (now - w.last > WHEEL_GAP_MS) w.startBottom = atBottom(); // a new wheel gesture
    w.last = now;
    if (mode !== "history") { if (e.deltaY < 0) toHistory(); return; }
    if (e.deltaY > 0 && w.startBottom && atBottom()) { w.startBottom = false; toFields(); }
  };

  // newest card stays in view (at the bottom, next to the graphic)
  const shown = mode === "typing" ? hist.items.slice(-1) : hist.items;
  useEffect(() => {
    const el = histRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [mode, hist.items.length]);

  const fieldView = useMemo(() => FIELDS.map((f) => {
    if (f === known && text !== "") return { f, typed: true, main: text, exact: "" };
    if (results && f !== known) return { f, typed: false, ...formatMm(results[f], units[f], { tape: tape && isImperial(units[f]) }) };
    return { f, empty: true };
  }), [known, text, results, units, tape]);

  return (
    <div className={`gx gx-${mode}`} data-testid="gx" data-mode={mode}>
      {hist.demoOn && (
        <div className="gx-demobar" data-testid="gx-demobar">
          <span>Demo mode: not saved to the Sheet</span>
          <button type="button" data-testid="gx-demo-clear" {...tapProps(hist.clearDemo)}>Clear demo data</button>
        </div>
      )}
      <div className="gx-hist" ref={histRef} data-testid="gx-hist" onTouchStart={onHistTouchStart} onTouchMove={onHistTouchMove} onWheel={onHistWheel}>
        <div className="gx-spacer" />
        {mode === "history" && !hist.demoOn && !settings.hideDemo && (
          <button type="button" className="gx-demolink" data-testid="gx-demo-on" {...tapProps(() => hist.setDemoOn(true))}>Try demo mode</button>
        )}
        {mode === "history" && hist.demoOn && (
          <button type="button" className="gx-demolink" data-testid="gx-demo-off" {...tapProps(() => hist.setDemoOn(false))}>Leave demo mode (demo history is kept until you clear it)</button>
        )}
        {shown.length === 0 && mode !== "typing" && <p className="gx-empty">Your calculations will show up here.</p>}
        {shown.map((e) => (
          <HistoryCard key={e.id} entry={e} swipe={mode === "history"} copyUnit={settings.copyUnit} onLoad={loadEntry} onCopy={copy} onDelete={hist.remove} />
        ))}
      </div>

      <Graphic onPress={onGraphic} />

      {mode !== "history" && (
        <div className="gx-fields" data-testid="gx-fields">
          {fieldView.map((v) => (
            <div key={v.f} className={`gx-field gx-field-${v.f}` + (active === v.f ? " active" : "")} data-testid={`gx-field-${v.f}`}>
              <div className="gx-fval" role="button" tabIndex={0} data-testid={`gx-fval-${v.f}`} aria-label={LABELS[v.f]}
                {...tapProps(() => openField(v.f))} onKeyDown={(e) => { if (e.key === "Enter" && active !== v.f) openField(v.f); }}>
                <span className="gx-flabel">{SHORT[v.f]}</span>
                {v.empty ? <span className="gx-fplace">{LABELS[v.f]}</span> : (
                  <span className={"gx-fnum " + (v.typed ? "gx-typed" : "gx-calc") + (replace && active === v.f ? " gx-selected" : "")} data-testid={`gx-fnum-${v.f}`}>
                    {v.main}{v.exact && <small className="gx-exact"> {v.exact}</small>}
                  </span>
                )}
                {active === v.f && <i className="gx-caret" aria-hidden="true" />}
              </div>
              <select className="gx-unit" data-testid={`gx-unit-${v.f}`} aria-label={`Unit for ${SHORT[v.f]}`} value={units[v.f] || DEFAULT_UNIT}
                onChange={(e) => changeUnit(v.f, e.target.value)}>
                {UNITS.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
              </select>
            </div>
          ))}
        </div>
      )}

      {toast && <div className="gx-toast" data-testid="gx-toast" role="status">{toast}</div>}

      {mode === "typing" && (
        <Keypad tape={tape} ftin={active && units[active] === "ftin"} copyOpen={copyOpen}
          onKey={onKey} onTape={onTape} onCopyMenu={() => setCopyOpen((o) => !o)} onCopy={onCopy} onClear={onClear} onDone={goDefault} />
      )}
    </div>
  );
}


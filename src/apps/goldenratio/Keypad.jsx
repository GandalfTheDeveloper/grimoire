// Golden Ratio's own number pad (the phone's keyboard never opens).
// Normal:       1-9, 0, ".", and a column of: tape-measure toggle, Copy, Clear, backspace, Done
// Tape mode:    a row of common fractions on top, "." becomes "/", and a "space" key (3 space 11 / 16)
// ft-in field:  a feet key (') is added
// Copy:         shows a row to pick which value to copy (a, b or a+b)
// Clear:        empties every field (the calculation on screen is saved to history first, so nothing is lost)
import { Copy, Delete, Ruler } from "lucide-react";
import { QUICK_FRACTIONS } from "./entry.js";
import { tapProps, noGhostClick } from "./tap.js";

const press = (fn) => (e) => { e.preventDefault(); fn(); }; // pointer-down so taps never feel laggy

function Key({ k, label, onKey, className = "", testid, aria }) {
  return (
    <button type="button" className={"gx-key " + className} data-testid={testid || `gx-key-${typeof k === "string" ? k : k.join("-")}`}
      aria-label={aria} onPointerDown={press(() => onKey(k))} onTouchEnd={noGhostClick} onClick={(e) => { if (e.detail === 0) onKey(k); }}>
      {label}
    </button>
  );
}

function Fn({ onPress, className = "", testid, aria, pressed, children }) {
  return (
    <button type="button" className={"gx-key gx-key-fn " + className} data-testid={testid} aria-label={aria} aria-pressed={pressed}
      onPointerDown={press(onPress)} onTouchEnd={noGhostClick} onClick={(e) => { if (e.detail === 0) onPress(); }}>
      {children}
    </button>
  );
}

export default function Keypad({ tape, ftin, copyOpen, onKey, onTape, onCopyMenu, onCopy, onClear, onDone }) {
  return (
    <div className="gx-keypad" data-testid="gx-keypad">
      {copyOpen ? (
        <div className="gx-krow gx-copyrow" data-testid="gx-copyrow">
          <span>Copy</span>
          <button type="button" className="gx-chip gx-chip-a" data-testid="gx-copy-a" {...tapProps(() => onCopy("a"))}>a</button>
          <button type="button" className="gx-chip gx-chip-b" data-testid="gx-copy-b" {...tapProps(() => onCopy("b"))}>b</button>
          <button type="button" className="gx-chip gx-chip-whole" data-testid="gx-copy-whole" {...tapProps(() => onCopy("whole"))}>a+b</button>
        </div>
      ) : tape ? (
        <div className="gx-krow gx-fracrow" data-testid="gx-fracrow">
          {ftin && <Key k="feet" label="'" onKey={onKey} className="gx-key-small" aria="Feet" />}
          {QUICK_FRACTIONS.map((f) => <Key key={f.join("/")} k={f} label={<><sup>{f[0]}</sup>&frasl;<sub>{f[1]}</sub></>} onKey={onKey} className="gx-key-small" aria={`${f[0]}/${f[1]}`} />)}
        </div>
      ) : null}
      <div className="gx-kgrid">
        <div className="gx-kdigits">
          <Key k="1" label="1" onKey={onKey} /><Key k="2" label="2" onKey={onKey} /><Key k="3" label="3" onKey={onKey} />
          <Key k="4" label="4" onKey={onKey} /><Key k="5" label="5" onKey={onKey} /><Key k="6" label="6" onKey={onKey} />
          <Key k="7" label="7" onKey={onKey} /><Key k="8" label="8" onKey={onKey} /><Key k="9" label="9" onKey={onKey} />
          {tape ? <Key k="/" label="/" onKey={onKey} /> : <Key k="." label="." onKey={onKey} />}
          <Key k="0" label="0" onKey={onKey} />
          {tape ? <Key k="space" label="space" onKey={onKey} className="gx-key-word" /> : ftin ? <Key k="feet" label="'" onKey={onKey} aria="Feet" /> : <span className="gx-key gx-key-blank" />}
        </div>
        <div className="gx-kfn">
          <Fn onPress={onTape} className={tape ? "on" : ""} testid="gx-tape" aria={tape ? "Tape measure on" : "Tape measure off"} pressed={tape}><Ruler size={20} /></Fn>
          <Fn onPress={onCopyMenu} className={copyOpen ? "on" : ""} testid="gx-copy" aria="Copy"><Copy size={18} /></Fn>
          <Fn onPress={onClear} className="gx-key-clear" testid="gx-clear" aria="Clear all fields">Clear</Fn>
          <Key k="back" label={<Delete size={20} />} onKey={onKey} className="gx-key-fn" aria="Backspace" />
          <button type="button" className="gx-key gx-key-done" data-testid="gx-done" onPointerDown={press(onDone)} onTouchEnd={noGhostClick} onClick={(e) => { if (e.detail === 0) onDone(); }}>Done</button>
        </div>
      </div>
    </div>
  );
}

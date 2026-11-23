// Small shared pieces for The Hoard's screens.
import { useEffect } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { addMonths, monthLabel, monthOf } from "./plan.js";

export function MonthPicker({ month, onChange, testid = "month" }) {
  const now = monthOf();
  return (
    <div className="hx-month" data-testid={testid}>
      <button className="gr-iconbtn" aria-label="Previous month" data-testid={`${testid}-prev`} onClick={() => onChange(addMonths(month, -1))}><ChevronLeft size={20} /></button>
      <button className="hx-month-label" data-testid={`${testid}-label`} onClick={() => onChange(now)} title="Back to this month">
        {monthLabel(month)}{month !== now && <small>tap for this month</small>}
      </button>
      <button className="gr-iconbtn" aria-label="Next month" data-testid={`${testid}-next`} onClick={() => onChange(addMonths(month, 1))}><ChevronRight size={20} /></button>
    </div>
  );
}

// A panel over the screen (bottom sheet on the phone, centred box on wider screens). Esc or X closes it.
export function Sheet({ title, onClose, children, testid }) {
  useEffect(() => {
    const k = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="hx-backdrop" onClick={onClose} data-testid={testid ? `${testid}-backdrop` : undefined}>
      <div className="hx-sheet" role="dialog" aria-label={title} data-testid={testid} onClick={(e) => e.stopPropagation()}>
        <div className="hx-sheet-head">
          <b>{title}</b>
          <button className="gr-iconbtn" aria-label="Close" data-testid={testid ? `${testid}-close` : undefined} onClick={onClose}><X size={20} /></button>
        </div>
        <div className="hx-sheet-body">{children}</div>
      </div>
    </div>
  );
}

export function Seg({ options, value, onChange, testid }) {
  return (
    <div className="hx-seg" role="radiogroup" data-testid={testid}>
      {options.map(([v, label]) => (
        <button key={v} role="radio" aria-checked={value === v} className={value === v ? "on" : ""} data-testid={testid ? `${testid}-${v}` : undefined} onClick={() => onChange(v)}>{label}</button>
      ))}
    </div>
  );
}

// A labelled box. Typed values are white (charter v1.7 colors).
export function Field({ label, hint, children }) {
  return (
    <label className="hx-field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

// <input type="month"> is missing in some browsers (desktop Safari, Firefox), so this is two selects.
export function MonthInput({ value, onChange, testid }) {
  const [y, m] = (value || monthOf()).split("-");
  const cy = new Date().getFullYear();
  const years = [];
  for (let i = cy - 6; i <= cy + 3; i++) years.push(String(i));
  if (!years.includes(y)) years.push(y);
  return (
    <span className="hx-monthinput" data-testid={testid}>
      <select aria-label="Month" data-testid={testid ? `${testid}-m` : undefined} value={m} onChange={(e) => onChange(`${y}-${e.target.value}`)}>
        {Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0")).map((mm) => <option key={mm} value={mm}>{monthLabel(`2000-${mm}`).replace(" 2000", "")}</option>)}
      </select>
      <select aria-label="Year" data-testid={testid ? `${testid}-y` : undefined} value={y} onChange={(e) => onChange(`${e.target.value}-${m}`)}>
        {years.sort().map((yy) => <option key={yy} value={yy}>{yy}</option>)}
      </select>
    </span>
  );
}

export { addMonths };

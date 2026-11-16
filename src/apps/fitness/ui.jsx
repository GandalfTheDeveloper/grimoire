import React from "react";
import { ACCENT, GOLD, LINE, REDC, SUB } from "./theme.js";

export function Segmented({ value, onChange, options }) {
  return (
    <div style={{ display: "flex", gap: 6 }}>
      {options.map((o) => (
        <button key={o.value} onClick={() => onChange(o.value)} style={{
          flex: 1, padding: "10px 8px", borderRadius: 8, border: `1px solid ${value === o.value ? o.color : LINE}`,
          background: value === o.value ? o.color + "22" : "transparent", color: value === o.value ? o.color : SUB,
          fontWeight: 600, fontSize: 13, cursor: "pointer",
        }}>{o.label}</button>
      ))}
    </div>
  );
}

export const STATUS_OPTS = [{ value: "None", label: "None", color: REDC }, { value: "Partial", label: "Partial", color: GOLD }, { value: "Complete", label: "Complete", color: ACCENT }];

// Original minimalist ogre-face icon (not Shrek) for progressive overload:
// a broad egg-shaped head with a short forehead, straight antenna ears,
// a big nose, and angry, determined eyebrows. Tinted to match the
// overload bar on the card.
export function OverloadIcon({ color, size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" style={{ display: "block" }}>
      {/* straight antenna-style ears */}
      <path d="M8.6 7.3 L6.6 2.4" fill="none" stroke={color} strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="6.3" cy="1.8" r="0.9" fill={color} />
      <path d="M15.4 7.3 L17.4 2.4" fill="none" stroke={color} strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="17.7" cy="1.8" r="0.9" fill={color} />
      {/* egg shape: short narrow top, broad rounded bottom */}
      <path d="M12 5.0 C 8.8 5.0 6.3 7.3 6.0 10.3 C 5.7 13.4 6.5 17.0 9.0 19.6 C 10.2 20.8 13.8 20.8 15.0 19.6 C 17.5 17.0 18.3 13.4 18.0 10.3 C 17.7 7.3 15.2 5.0 12 5.0 Z" fill="none" stroke={color} strokeWidth="1.3" strokeLinejoin="round" />
      {/* angry, determined eyebrows, short forehead above them */}
      <path d="M7.6 9.6 L10.6 11.1" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <path d="M16.4 9.6 L13.4 11.1" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      {/* eyes, spaced wider */}
      <circle cx="9.4" cy="13" r="1" fill={color} />
      <circle cx="14.6" cy="13" r="1" fill={color} />
      {/* big nose */}
      <path d="M10.6 15 C9.8 16.6 9.6 17.8 10.6 18.6 C11.5 19.3 12.5 19.3 13.4 18.6 C14.4 17.8 14.2 16.6 13.4 15" fill="none" stroke={color} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

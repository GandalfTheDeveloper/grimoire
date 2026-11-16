// The segment graphic: line split at the golden ratio into a and b, diamond ends, underbrace for a+b.
// Same size and labels on every screen. Tapping it goes back to the default screen and clears the fields.
import { tapProps } from "./tap.js";

export default function Graphic({ onPress }) {
  return (
    <button type="button" className="gx-graphic" data-testid="gx-graphic" aria-label="Golden ratio graphic" {...tapProps(onPress)}>
      <svg viewBox="0 0 300 122" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        <line x1="28" y1="40" x2="175" y2="40" stroke="var(--gx-a)" strokeWidth="4" />
        <line x1="187" y1="40" x2="272" y2="40" stroke="var(--gx-b)" strokeWidth="4" />
        <polygon points="22,33 29,40 22,47 15,40" fill="var(--bg)" stroke="var(--gx-a)" strokeWidth="3" />
        <polygon points="278,33 285,40 278,47 271,40" fill="var(--bg)" stroke="var(--gx-b)" strokeWidth="3" />
        <polyline points="181,33 174,40 181,47" fill="none" stroke="var(--gx-a)" strokeWidth="3" />
        <polyline points="181,33 188,40 181,47" fill="none" stroke="var(--gx-b)" strokeWidth="3" />
        <text x="101" y="25" textAnchor="middle" className="gx-glabel" fill="var(--gx-a)">a</text>
        <text x="230" y="25" textAnchor="middle" className="gx-glabel" fill="var(--gx-b)">b</text>
        <path d="M22,56 C22,74 40,77 70,77 L128,77 C144,77 148,81 150,92 C152,81 156,77 172,77 L230,77 C260,77 278,74 278,56" fill="none" stroke="var(--gx-whole)" strokeWidth="3" />
        <text x="150" y="116" textAnchor="middle" className="gx-glabel" fill="var(--gx-whole)">a+b</text>
      </svg>
    </button>
  );
}

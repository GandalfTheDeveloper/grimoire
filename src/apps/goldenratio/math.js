// The golden ratio. Everything is worked out in millimetres at full precision; rounding happens only on screen.
export const PHI = (1 + Math.sqrt(5)) / 2;

export const FIELDS = ["a", "b", "whole"]; // longer section, shorter section, whole (a + b)

// known: which field the value belongs to. mm: that value in millimetres (must be > 0).
// Returns all three lengths in millimetres, or null if the value can't be used.
export function solve(known, mm) {
  if (!(mm > 0) || !Number.isFinite(mm)) return null;
  if (known === "a") return { a: mm, b: mm / PHI, whole: mm * PHI };
  if (known === "b") return { a: mm * PHI, b: mm, whole: mm * PHI * PHI };
  if (known === "whole") return { a: mm / PHI, b: mm / (PHI * PHI), whole: mm };
  return null;
}

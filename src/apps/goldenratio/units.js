// Length units, reading what was typed, and writing results.
//
// Typed values can be decimals (12.5), fractions (5/8), mixed numbers (3 5/8) and, in ft-in, feet and inches
// (5' 3 1/2"). In ft-in a number with no ' is read as feet. In any other unit a value with ' is read as
// feet and inches and converted.
// Results: up to 4 decimals with trailing zeros dropped (100, not 100.0000). In tape-measure mode, results in
// in, ft and ft-in are written as fractions rounded to the nearest 1/32, with the exact 4-decimal value
// returned alongside whenever the fraction is not exact. Metric results always stay decimal.

export const UNITS = [
  { id: "mm", label: "mm", mm: 1 },
  { id: "cm", label: "cm", mm: 10 },
  { id: "m", label: "m", mm: 1000 },
  { id: "in", label: "in", mm: 25.4, imperial: true },
  { id: "ft", label: "ft", mm: 304.8, imperial: true },
  { id: "ftin", label: "ft-in", mm: 25.4, imperial: true, compound: true }, // amounts are inches
];
export const DEFAULT_UNIT = "mm";
export const unitOf = (id) => UNITS.find((u) => u.id === id) || UNITS[0];
export const isImperial = (id) => !!unitOf(id).imperial;

const DEC_RE = /^(\d+(\.\d*)?|\.\d+)$/;
const FRAC_RE = /^(\d+)\s*\/\s*(\d+)$/;
const MIXED_RE = /^(\d+)\s+(\d+)\s*\/\s*(\d+)$/;

// "12.5", "5/8", "3 5/8" -> number, or null when it is not (yet) a complete value.
export function parseAmount(s) {
  const t = String(s || "").trim();
  if (!t) return null;
  if (DEC_RE.test(t)) return Number(t);
  let m = t.match(FRAC_RE);
  if (m) return Number(m[2]) > 0 ? Number(m[1]) / Number(m[2]) : null;
  m = t.match(MIXED_RE);
  if (m) return Number(m[3]) > 0 ? Number(m[1]) + Number(m[2]) / Number(m[3]) : null;
  return null;
}

// "5' 3 1/2"" -> inches (66.5). Feet may be a decimal; the inches part is optional.
function parseFeetInches(t) {
  const i = t.indexOf("'");
  const feet = parseAmount(t.slice(0, i));
  if (feet === null) return null;
  const rest = t.slice(i + 1).replace(/"/g, "").trim();
  if (!rest) return feet * 12;
  const inches = parseAmount(rest);
  return inches === null ? null : feet * 12 + inches;
}

// What was typed, in the given unit -> millimetres (> 0), or null.
export function parseToMm(text, unitId) {
  const t = String(text || "").replace(/"/g, "").trim();
  if (!t) return null;
  let mm;
  if (t.includes("'")) {
    const inches = parseFeetInches(t);
    mm = inches === null ? null : inches * 25.4;
  } else if (unitId === "ftin") {
    const feet = parseAmount(t);
    mm = feet === null ? null : feet * 304.8;
  } else {
    const v = parseAmount(t);
    mm = v === null ? null : v * unitOf(unitId).mm;
  }
  return mm !== null && mm > 0 && Number.isFinite(mm) ? mm : null;
}

// 4 decimals, trailing zeros dropped.
export function fmt4(v) {
  const s = (Math.round(v * 1e4) / 1e4).toFixed(4);
  return s.replace(/0+$/, "").replace(/\.$/, "");
}

const gcd = (a, b) => (b ? gcd(b, a % b) : a);

// Nearest 1/32, reduced: 2.2404 -> "2 1/4", 0.625 -> "5/8", 3 -> "3".
export function fraction32(v) {
  const n = Math.round(v * 32);
  const whole = Math.floor(n / 32);
  const r = n - whole * 32;
  if (!r) return String(whole);
  const g = gcd(r, 32);
  const f = `${r / g}/${32 / g}`;
  return whole ? `${whole} ${f}` : f;
}
const isExact32 = (v) => Math.abs(Math.round(v * 32) / 32 - v) < 5e-5;

function ftinDecimal(totalIn) {
  let ft = Math.floor(totalIn / 12 + 1e-12);
  let inch = Math.round((totalIn - ft * 12) * 1e4) / 1e4;
  if (inch >= 12) { ft += 1; inch = 0; }
  return ft ? `${ft}' ${fmt4(inch)}"` : `${fmt4(inch)}"`;
}
function ftinFraction(totalIn) {
  const n = Math.round(totalIn * 32);
  const ft = Math.floor(n / 384); // 12 in x 32: carries correctly at the foot mark
  const inch = fraction32((n - ft * 384) / 32);
  return ft ? `${ft}' ${inch}"` : `${inch}"`;
}

// A result for display: { main, exact } where exact is set only when main is a rounded fraction.
export function formatMm(mm, unitId, { tape = false } = {}) {
  if (!(mm > 0) || !Number.isFinite(mm)) return { main: "", exact: "" };
  const u = unitOf(unitId);
  const v = mm / u.mm;
  if (u.compound) {
    if (!tape) return { main: ftinDecimal(v), exact: "" };
    return { main: ftinFraction(v), exact: isExact32(v) ? "" : ftinDecimal(v) };
  }
  if (tape && u.imperial) return { main: fraction32(v), exact: isExact32(v) ? "" : fmt4(v) };
  return { main: fmt4(v), exact: "" };
}

// Text that, typed back into a field of this unit, gives the same value (used when you start editing a result).
export function editableText(mm, unitId, { tape = false } = {}) {
  return formatMm(mm, unitId, { tape }).main.replace(/"/g, "");
}

// What gets copied: the value plus its unit, e.g. "2 1/4 in", "161.8034 mm", "3' 3 1/4"".
// withUnit false (a setting): just the value, "161.8034". ft-in keeps its ' and " marks either way (they are the value).
export function copyText(main, unitId, withUnit = true) {
  return unitId === "ftin" || !withUnit ? main : `${main} ${unitOf(unitId).label}`;
}

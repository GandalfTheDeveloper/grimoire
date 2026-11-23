// Money in and out of text. Amounts are plain numbers of dollars, kept to cents.
const whole = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const cents = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// $1,234 when whole dollars, $1,234.56 otherwise. Negative as −$12.
export function fmt(n, { forceCents = false } = {}) {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return "–";
  const v = Math.round(Number(n) * 100) / 100;
  const abs = Math.abs(v);
  const body = forceCents || abs % 1 !== 0 ? cents.format(abs) : whole.format(abs);
  return `${v < 0 ? "−" : ""}$${body}`;
}
// Short form for chart axes: $1.2k, $35k, $1.4M.
export function fmtShort(n) {
  const v = Number(n) || 0, a = Math.abs(v), s = v < 0 ? "−" : "";
  if (a >= 1e6) return `${s}$${(a / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M`;
  if (a >= 1e3) return `${s}$${(a / 1e3).toFixed(a >= 1e4 ? 0 : 1)}k`;
  return `${s}$${Math.round(a)}`;
}
// "1,234.5", "$1234", " 12 " -> number; "" or junk -> null.
export function parseMoney(text) {
  const t = String(text ?? "").replace(/[$,\s]/g, "");
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(t)) return null;
  return Math.round(Number(t) * 100) / 100;
}
// What goes back into an input box for editing.
export const editText = (n) => (Number.isFinite(Number(n)) && n !== null && n !== "" ? String(Math.round(Number(n) * 100) / 100) : "");

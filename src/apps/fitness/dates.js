

export const fmtDate = (d) => {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};
export const dayName = (d) => d.toLocaleDateString("en-US", { weekday: "long" });
export const startOfWeek = (d) => { const x = new Date(d); const diff = (x.getDay() + 6) % 7; x.setDate(x.getDate() - diff); x.setHours(0, 0, 0, 0); return x; };

export const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const addMonths = (d, n) => { const x = new Date(d); x.setMonth(x.getMonth() + n); return x; };

export function computePace(distance, time) {
  const dist = parseFloat(distance);
  if (!dist || dist <= 0 || !time) return "";
  const minutes = parseClock(time);
  if (!(minutes > 0)) return "";
  return formatPace(minutes / dist);
}

export function formatSecondsClock(totalSeconds) {
  const n = Number(totalSeconds);
  if (!n || n < 0) return "0:00";
  const m = Math.floor(n / 60);
  const s = Math.floor(n % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const dayIndex = (dateStr) => { const [y, m, d] = String(dateStr).split("-").map(Number); return Math.round(Date.UTC(y, m - 1, d) / 86400000); };
export const idxToDateStr = (idx) => { const d = new Date(idx * 86400000); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`; };
export const idxLabel = (idx) => { const d = new Date(Math.round(idx) * 86400000); return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`; };
export const idxFull = (idx) => new Date(Math.round(idx) * 86400000).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
export const meanOf = (a) => a.reduce((s, x) => s + x, 0) / a.length;
export const signed = (v, digits = 1) => `${v > 0 ? "+" : ""}${v.toFixed(digits)}`;

// Parses "m:ss", "h:mm:ss" or a plain number into minutes.
export function parseClock(str) {
  if (str === null || str === undefined || str === "") return NaN;
  const s = String(str).trim();
  if (/^\d+(\.\d+)?$/.test(s)) return parseFloat(s);
  const parts = s.split(":").map(Number);
  if (parts.some((p) => isNaN(p))) return NaN;
  if (parts.length === 2) return parts[0] + parts[1] / 60;
  if (parts.length === 3) return parts[0] * 60 + parts[1] + parts[2] / 60;
  return NaN;
}
export const formatPace = (min) => { if (!isFinite(min)) return ""; const m = Math.floor(min); const s = Math.round((min - m) * 60); return s === 60 ? `${m + 1}:00` : `${m}:${String(s).padStart(2, "0")}`; };

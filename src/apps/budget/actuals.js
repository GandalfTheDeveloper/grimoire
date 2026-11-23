// The Hoard, round B2: what actually happened, from imported transactions. Pure functions.
//
// Transaction record (collection "tx", type "tx"), Data:
//   { v, date "yyyy-MM-dd", amount (positive), dir "out"|"in", desc, orig, bankCat, account (app account id),
//     src "spend"|"hist", cls (history: paycheck|transfer|other), kind, lineId, splits [{ lineId, amount }],
//     status "auto"|"review"|"manual", ruleId, choices [lineId], note, batch, histOnly, at }
//   kind: spend (money out on a plan line) | refund (money back, subtracted from its line) | income |
//         transfer (between your own accounts, not spending) | ignore (hidden) | matched (a history row the
//         spending export already covers; not counted)
//
// Months with no imported spending show "no data", never $0 (spec 2): coverage comes from each import's
// date range, not from whether transactions exist.
import { addMonths, isMonth, linesAt, lineGroups, versionAt, sectionsOf, accountsOf, ofType, round2, sum, monthNum, yearOf } from "./plan.js";

export const txList = (records) => ofType(records, "tx");
const lastDay = (m) => `${m}-${String(new Date(Number(m.slice(0, 4)), monthNum(m), 0).getDate()).padStart(2, "0")}`;
export const COUNTED = ["spend", "refund"];

// Pieces of a transaction that land on plan lines: signed (refunds negative). "" = not sorted yet.
export function txParts(d) {
  const sign = d.kind === "refund" ? -1 : 1;
  if (Array.isArray(d.splits) && d.splits.length) return d.splits.map((p) => ({ lineId: p.lineId || "", amount: round2(sign * (Number(p.amount) || 0)) }));
  return [{ lineId: d.lineId || "", amount: round2(sign * (Number(d.amount) || 0)) }];
}
export const needsReview = (d) => d.status === "review" && COUNTED.includes(d.kind);

// ---------- coverage ----------
export const batches = (records) => ofType(records, "batch").map((r) => ({ id: r.id, ...r.data })).sort((a, b) => (b.at || 0) - (a.at || 0));
export function spendRanges(records) {
  const out = [];
  for (const b of batches(records)) for (const r of b.ranges || []) if (r.kind === "spend" && r.from && r.to && r.from <= r.to) out.push({ from: r.from, to: r.to });
  return out;
}
// { status: "none" | "partial" | "full", through } for spending in `month`.
export function monthCoverage(records, month, ranges = spendRanges(records)) {
  const first = `${month}-01`, last = lastDay(month);
  // merge the ranges that touch this month into covered day spans
  const spans = ranges.filter((r) => r.to >= first && r.from <= last).map((r) => [r.from < first ? first : r.from, r.to > last ? last : r.to]).sort((a, b) => (a[0] < b[0] ? -1 : 1));
  if (!spans.length) return { status: "none", through: "" };
  const merged = [];
  for (const s of spans) {
    const p = merged[merged.length - 1];
    if (p && nextDay(p[1]) >= s[0]) { if (s[1] > p[1]) p[1] = s[1]; } else merged.push([...s]);
  }
  const full = merged.length === 1 && merged[0][0] === first && merged[0][1] === last;
  return { status: full ? "full" : "partial", through: merged[merged.length - 1][1], from: merged[0][0] };
}
function nextDay(d) {
  const t = new Date(Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)) + 1));
  return t.toISOString().slice(0, 10);
}
export function coveredThrough(records) {
  let hi = "";
  for (const r of spendRanges(records)) if (r.to > hi) hi = r.to;
  return hi;
}
export function lastImportAt(records) { const b = batches(records)[0]; return b ? b.at || 0 : 0; }
export const daysSince = (t, now = Date.now()) => (t ? Math.max(0, Math.floor((now - t) / 86400000)) : null);

// ---------- which section a line belongs to in a month ----------
export function lineInfo(records) {
  const groups = lineGroups(records);
  const secs = new Map(sectionsOf(records).map((s) => [s.id, s]));
  return (lineId, month) => {
    const vs = groups.get(lineId);
    if (!vs) return null;
    const v = versionAt(vs, month) || vs[vs.length - 1] || vs[0];
    const sec = secs.get(v.data.sectionId);
    return { lineId, name: v.data.name, sectionId: v.data.sectionId, kind: sec ? sec.kind : "spend", sectionName: sec ? sec.name : "No section" };
  };
}

// ---------- one month ----------
export function monthActuals(records, month, info = lineInfo(records)) {
  const byLine = {}, bySection = {};
  let spent = 0, saving = 0, unsorted = 0, income = 0, review = 0, paychecks = 0;
  for (const r of txList(records)) {
    const d = r.data;
    if (!d.date || d.date.slice(0, 7) !== month) continue;
    if (d.kind === "income") { income += Number(d.amount) || 0; if (d.cls === "paycheck") paychecks += 1; continue; }
    if (!COUNTED.includes(d.kind)) continue;
    if (needsReview(d)) review += 1;
    for (const p of txParts(d)) {
      const li = p.lineId ? info(p.lineId, month) : null;
      if (!li) { unsorted += p.amount; continue; }
      byLine[p.lineId] = round2((byLine[p.lineId] || 0) + p.amount);
      bySection[li.sectionId] = round2((bySection[li.sectionId] || 0) + p.amount);
      if (li.kind === "saving") saving += p.amount; else spent += p.amount;
    }
  }
  spent = round2(spent + unsorted);
  return { month, in: round2(income), spent, saving: round2(saving), unsorted: round2(unsorted), byLine, bySection, review, paychecks, coverage: monthCoverage(records, month) };
}

// Year-to-date actual per line (January through `month`), for irregular lines' pace.
export function ytdByLine(records, month, info = lineInfo(records)) {
  const out = {};
  const y = yearOf(month);
  for (let m = `${y}-01`; m <= month; m = addMonths(m, 1)) {
    const a = monthActuals(records, m, info);
    for (const [k, v] of Object.entries(a.byLine)) out[k] = round2((out[k] || 0) + v);
  }
  return out;
}
// "on pace" within 10% of the planned pace; "under" / "over" otherwise.
export function paceLabel(actual, planned) {
  if (!planned) return actual > 0 ? "over" : "on pace";
  const r = actual / planned;
  return r > 1.1 ? "over pace" : r < 0.9 ? "under pace" : "on pace";
}

// ---------- card owed (spec 3.4): charges since the last card payment ----------
// A card payment is a transfer INTO the card account. Only derived once a payment has been seen; before that
// the typed balance is used. A typed balance for the month always wins (balanceAt).
export function makeDerive(records) {
  const cards = new Set(accountsOf(records, { includeArchived: true }).filter((a) => a.kind === "card").map((a) => a.id));
  if (!cards.size) return null;
  const byCard = new Map();
  for (const r of txList(records)) {
    const d = r.data;
    if (!cards.has(d.account)) continue;
    if (!byCard.has(d.account)) byCard.set(d.account, []);
    byCard.get(d.account).push(d);
  }
  return (accountId, month) => {
    const list = byCard.get(accountId);
    if (!list) return null;
    const end = lastDay(month);
    let since = "";
    for (const d of list) if (d.kind === "transfer" && d.dir === "in" && d.date <= end && d.date > since) since = d.date;
    if (!since) return null;
    let owed = 0;
    for (const d of list) {
      if (d.date <= since || d.date > end) continue;
      if (d.kind === "spend") owed += Number(d.amount) || 0;
      else if (d.kind === "refund") owed -= Number(d.amount) || 0;
    }
    return { amount: round2(owed), since };
  };
}

// ---------- saved (spec 2) ----------
// Saved = change in (checking + savings − card owed) + money put into saving lines. Needs checking and
// savings balances for both month ends; otherwise falls back to In − Spent (labelled an estimate).
export function savedActual(records, month, act, derive, balanceTotals) {
  const cashAccts = accountsOf(records, { includeArchived: true }).filter((a) => a.kind === "checking" || a.kind === "savings");
  const est = { amount: round2(act.in - act.spent), how: "estimate" };
  if (!cashAccts.length || !balanceTotals) return est;
  const now = balanceTotals(records, month, derive), prev = balanceTotals(records, addMonths(month, -1), derive);
  if (!cashAccts.every((a) => now.fresh[a.id] && prev.byAccount[a.id] !== undefined)) return est;
  return { amount: round2(now.cash - prev.cash + act.saving), how: "balances" };
}

// Twelve months of actuals ending at `month`. Months with no coverage carry nulls (drawn as gaps).
export function actualSeries(records, month, count = 12) {
  const info = lineInfo(records);
  const ranges = spendRanges(records);
  const out = [];
  for (let i = count - 1; i >= 0; i--) {
    const m = addMonths(month, -i);
    const cov = monthCoverage(records, m, ranges);
    if (cov.status === "none") { out.push({ month: m, in: null, spent: null, saved: null, coverage: cov }); continue; }
    const a = monthActuals(records, m, info);
    out.push({ month: m, in: a.in, spent: a.spent, saved: round2(a.in - a.spent), coverage: cov });
  }
  return out;
}

// ---------- review and browsing ----------
export function reviewList(records) {
  return txList(records).filter((r) => needsReview(r.data)).sort((a, b) => (a.data.date < b.data.date ? 1 : a.data.date > b.data.date ? -1 : 0));
}
export function txForMonth(records, month) {
  return txList(records).filter((r) => r.data.date && r.data.date.slice(0, 7) === month).sort((a, b) => (a.data.date < b.data.date ? 1 : a.data.date > b.data.date ? -1 : String(a.data.desc).localeCompare(String(b.data.desc))));
}

// Plan check (spec 3.2): paychecks seen in a month vs the plan's take-home per check.
export function paychecksIn(records, month) {
  const list = txList(records).filter((r) => r.data.kind === "income" && r.data.cls === "paycheck" && r.data.date && r.data.date.slice(0, 7) === month);
  return { count: list.length, total: sum(list, (r) => r.data.amount), amounts: list.map((r) => r.data.amount) };
}

export { isMonth, linesAt };

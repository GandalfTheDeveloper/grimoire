// The Hoard: pure plan and balance maths. No React, no storage, so it can be unit-tested directly.
//
// Everything works on a flat list of records { id, type, data, updatedAt } (see schema.js for the types).
// Plan lines and income are EFFECTIVE-DATED: each change is a new version that applies from its month on,
// so a raise or a new budget amount never rewrites how past months compare (spec section 2).

// ---------- months ----------
export const monthOf = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
export const isMonth = (m) => typeof m === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(m);
export function addMonths(m, n) {
  const [y, mo] = m.split("-").map(Number);
  const t = y * 12 + (mo - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
}
export const monthNum = (m) => Number(m.slice(5, 7));
export const yearOf = (m) => m.slice(0, 4);
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const monthName = (n) => MONTHS[n - 1] || "";
export const monthLabel = (m, short = false) => (isMonth(m) ? `${short ? MONTHS[monthNum(m) - 1].slice(0, 3) : MONTHS[monthNum(m) - 1]} ${yearOf(m)}` : "");
export const monthsBetween = (from, to) => { const out = []; for (let m = from; m <= to; m = addMonths(m, 1)) out.push(m); return out; };

// ---------- money ----------
export const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
export const sum = (list, f = (x) => x) => round2(list.reduce((a, x) => a + (Number(f(x)) || 0), 0));

// ---------- records ----------
export const ofType = (records, type) => records.filter((r) => r.type === type);

// Of several versions, the one in force in `month`: latest effective month not after it; on a tie, the
// newest edit. Returns null if none applies yet.
export function versionAt(versions, month) {
  let best = null;
  for (const v of versions) {
    const e = v.data.effective;
    if (!isMonth(e) || e > month) continue;
    if (!best || e > best.data.effective || (e === best.data.effective && (v.updatedAt || 0) > (best.updatedAt || 0))) best = v;
  }
  return best;
}

// ---------- income ----------
export function incomeFigures(inc) {
  if (!inc) return null;
  const checks = Number(inc.checksPerYear) || 0;
  const gross = Number(inc.grossYear) || 0;
  const lines = Array.isArray(inc.lines) ? inc.lines : [];
  const grossCheck = checks ? round2(gross / checks) : 0;
  const taxesCheck = sum(lines.filter((l) => l.kind === "tax"), (l) => l.perCheck);
  const benefitsCheck = sum(lines.filter((l) => l.kind !== "tax"), (l) => l.perCheck);
  const takeHomeCheck = round2(grossCheck - taxesCheck - benefitsCheck);
  return {
    grossYear: gross, grossMonth: round2(gross / 12), grossCheck, checksPerYear: checks,
    taxesCheck, benefitsCheck, takeHomeCheck,
    takeHomeYear: round2(takeHomeCheck * checks), takeHomeMonth: round2((takeHomeCheck * checks) / 12),
    lines,
  };
}
export const incomeVersionAt = (records, month) => versionAt(ofType(records, "income"), month);

// ---------- plan lines ----------
export const CADENCES = ["monthly", "annual", "irregular", "onetime"];
export const CADENCE_TEXT = { monthly: "Monthly", annual: "Once a year", irregular: "Irregular (yearly budget)", onetime: "One time" };

// What a line costs in a given calendar month (cash view).
export function lineMonthAmount(line, month) {
  const a = Number(line.amount) || 0;
  switch (line.cadence) {
    case "annual": return Number(line.month) === monthNum(month) ? a : 0;
    case "irregular": return round2(a / 12); // judged on year-to-date pace, so each month carries a twelfth
    case "onetime": return typeof line.date === "string" && line.date.slice(0, 7) === month ? a : 0;
    default: return a;
  }
}
// The average month (what the spreadsheet's monthly column showed).
export function lineMonthlyEquivalent(line, month) {
  const a = Number(line.amount) || 0;
  if (line.cadence === "annual" || line.cadence === "irregular") return round2(a / 12);
  if (line.cadence === "onetime") return typeof line.date === "string" && line.date.slice(0, 4) === yearOf(month) ? round2(a / 12) : 0;
  return a;
}
// What it costs over the calendar year of `month` (annual total).
export function lineYearAmount(line, month) {
  const a = Number(line.amount) || 0;
  if (line.cadence === "monthly") return round2(a * 12);
  if (line.cadence === "onetime") return typeof line.date === "string" && line.date.slice(0, 4) === yearOf(month) ? a : 0;
  return a;
}
// Planned so far this year, through `month` (irregular lines are judged against this pace once actuals exist).
export function lineYtdPlan(line, month) {
  const a = Number(line.amount) || 0;
  const m = monthNum(month);
  if (line.cadence === "irregular") return round2((a * m) / 12);
  if (line.cadence === "monthly") return round2(a * m);
  if (line.cadence === "annual") return Number(line.month) <= m ? a : 0;
  return typeof line.date === "string" && line.date.slice(0, 4) === yearOf(month) && line.date.slice(0, 7) <= month ? a : 0;
}

// All line ids and their versions.
export function lineGroups(records) {
  const g = new Map();
  for (const v of ofType(records, "linev")) {
    const id = v.data.lineId;
    if (!id) continue;
    if (!g.has(id)) g.set(id, []);
    g.get(id).push(v);
  }
  for (const list of g.values()) list.sort((a, b) => (a.data.effective < b.data.effective ? -1 : a.data.effective > b.data.effective ? 1 : (a.updatedAt || 0) - (b.updatedAt || 0)));
  return g;
}

// Lines in force in `month`: [{ lineId, versionId, ...fields }]. Ended lines are left out.
export function linesAt(records, month) {
  const out = [];
  for (const [lineId, versions] of lineGroups(records)) {
    const v = versionAt(versions, month);
    if (!v || v.data.ended) continue;
    out.push({ ...v.data, lineId, versionId: v.id });
  }
  return out;
}

export const sectionsOf = (records) => ofType(records, "section").map((r) => ({ id: r.id, ...r.data })).sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || String(a.name).localeCompare(String(b.name)));

// The whole plan for one month: sections with their lines and totals, income, and the in/out summary.
export function planForMonth(records, month) {
  const incV = incomeVersionAt(records, month);
  const income = incomeFigures(incV ? incV.data : null);
  const lines = linesAt(records, month);
  const secs = sectionsOf(records);
  const known = new Set(secs.map((s) => s.id));
  const orphan = lines.filter((l) => !known.has(l.sectionId));
  const sections = secs.map((s) => ({ ...s, lines: lines.filter((l) => l.sectionId === s.id) }));
  if (orphan.length) sections.push({ id: "", name: "No section", kind: "spend", order: 9999, lines: orphan });
  for (const s of sections) {
    s.lines.sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || String(a.name).localeCompare(String(b.name)));
    for (const l of s.lines) {
      l.thisMonth = lineMonthAmount(l, month);
      l.perMonth = lineMonthlyEquivalent(l, month);
      l.perYear = lineYearAmount(l, month);
      l.ytdPlan = lineYtdPlan(l, month);
    }
    s.thisMonth = sum(s.lines, (l) => l.thisMonth);
    s.perMonth = sum(s.lines, (l) => l.perMonth);
    s.perYear = sum(s.lines, (l) => l.perYear);
  }
  const spend = sections.filter((s) => s.kind !== "saving");
  const saving = sections.filter((s) => s.kind === "saving");
  const inMonth = income ? income.takeHomeMonth : 0;
  const totals = {
    in: inMonth,
    spendThisMonth: sum(spend, (s) => s.thisMonth),
    spendPerMonth: sum(spend, (s) => s.perMonth),
    savingThisMonth: sum(saving, (s) => s.thisMonth),
    savingPerMonth: sum(saving, (s) => s.perMonth),
  };
  // In − Out: Out is spending plus planned saving, as on the spreadsheet. Saved = everything not spent.
  totals.leftThisMonth = round2(inMonth - totals.spendThisMonth - totals.savingThisMonth);
  totals.leftPerMonth = round2(inMonth - totals.spendPerMonth - totals.savingPerMonth);
  totals.savedThisMonth = round2(inMonth - totals.spendThisMonth);
  totals.savedPerMonth = round2(inMonth - totals.spendPerMonth);
  return { month, income, incomeVersion: incV, sections, totals, hasPlan: secs.length > 0 || lines.length > 0 || !!incV };
}

// The plan for each of the `count` months ending at `month` (Overview's 12-month chart).
export function planSeries(records, month, count = 12) {
  const out = [];
  for (let i = count - 1; i >= 0; i--) {
    const m = addMonths(month, -i);
    const p = planForMonth(records, m);
    out.push({ month: m, in: p.totals.in, spent: p.totals.spendThisMonth, saved: p.totals.savedThisMonth, hasPlan: p.hasPlan });
  }
  return out;
}

// ---------- accounts and balances ----------
export const ACCOUNT_KINDS = {
  checking: { label: "Checking", group: "cash", sign: 1 },
  savings: { label: "Savings", group: "cash", sign: 1 },
  card: { label: "Credit card (owed)", group: "cash", sign: -1 },
  brokerage: { label: "Brokerage", group: "invest", sign: 1 },
  ira: { label: "IRA / robo account", group: "invest", sign: 1 },
  hsa: { label: "HSA", group: "invest", sign: 1 },
  k401: { label: "401(k)", group: "invest", sign: 1 },
  home: { label: "Home value", group: "other", sign: 1 },
  mortgage: { label: "Mortgage (owed)", group: "other", sign: -1 },
  otherAsset: { label: "Other (asset)", group: "other", sign: 1 },
  otherDebt: { label: "Other (owed)", group: "other", sign: -1 },
};
export const accountsOf = (records, { includeArchived = false } = {}) =>
  ofType(records, "account").map((r) => ({ id: r.id, ...r.data }))
    .filter((a) => includeArchived || !a.archived)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || String(a.name).localeCompare(String(b.name)));

// The balance entry for one account and month (newest edit wins if two devices both entered one).
export function balanceEntry(records, accountId, month) {
  let best = null;
  for (const r of ofType(records, "bal")) {
    if (r.data.accountId !== accountId || r.data.month !== month) continue;
    if (!best || (r.updatedAt || 0) > (best.updatedAt || 0)) best = r;
  }
  return best;
}

// Value of an account in `month`: that month's entry, or the latest earlier one carried forward.
// Returns { amount, month (where it came from), carried } or null when there is nothing on or before it.
export function balanceAt(records, accountId, month) {
  let best = null;
  for (const r of ofType(records, "bal")) {
    const d = r.data;
    if (d.accountId !== accountId || !isMonth(d.month) || d.month > month || typeof d.amount !== "number") continue;
    if (!best || d.month > best.data.month || (d.month === best.data.month && (r.updatedAt || 0) > (best.updatedAt || 0))) best = r;
  }
  return best ? { amount: best.data.amount, month: best.data.month, carried: best.data.month !== month } : null;
}

export const balanceMonths = (records) => [...new Set(ofType(records, "bal").map((r) => r.data.month).filter(isMonth))].sort();

// Totals for a month. Amounts owed are entered as positive numbers and subtracted.
export function balanceTotals(records, month) {
  const t = { cash: 0, invest: 0, netWorth: 0, any: false, byAccount: {} };
  for (const a of accountsOf(records, { includeArchived: true })) {
    const k = ACCOUNT_KINDS[a.kind] || ACCOUNT_KINDS.otherAsset;
    const b = balanceAt(records, a.id, month);
    if (!b) continue;
    t.any = true;
    const v = k.sign * b.amount;
    t.byAccount[a.id] = b.amount;
    if (k.group === "cash") t.cash += v;
    if (k.group === "invest") t.invest += v;
    t.netWorth += v;
  }
  t.cash = round2(t.cash); t.invest = round2(t.invest); t.netWorth = round2(t.netWorth);
  return t;
}

export function balanceSeries(records, month, count = 12) {
  const out = [];
  for (let i = count - 1; i >= 0; i--) {
    const m = addMonths(month, -i);
    out.push({ month: m, ...balanceTotals(records, m) });
  }
  return out;
}

// ---------- calendar feed (charter: standard format, so calendars can be merged later) ----------
// Pull dates are free text ("2nd–5th", "15"); the first number in it is the day. Annual and one-time
// charges appear on their month (day 1 unless the pull date or date says otherwise).
export function pullDay(text) {
  const m = String(text || "").match(/\d{1,2}/);
  const d = m ? Number(m[0]) : 0;
  return d >= 1 && d <= 31 ? d : 0;
}
const lastDay = (m) => new Date(Number(m.slice(0, 4)), monthNum(m), 0).getDate();
export function calendarFeed(records, fromMonth, toMonth, color = "#F0453F") {
  const out = [];
  for (const m of monthsBetween(fromMonth, toMonth)) {
    for (const l of linesAt(records, m)) {
      let day = 0;
      if (l.cadence === "monthly") day = pullDay(l.pullDate);
      else if (l.cadence === "annual" && Number(l.month) === monthNum(m)) day = pullDay(l.pullDate) || 1;
      else if (l.cadence === "onetime" && typeof l.date === "string" && l.date.slice(0, 7) === m) day = Number(l.date.slice(8, 10)) || 1;
      if (!day) continue;
      day = Math.min(day, lastDay(m));
      out.push({ date: `${m}-${String(day).padStart(2, "0")}`, title: l.name, app: "budget", color, target: `#/app/budget?line=${l.lineId}` });
    }
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

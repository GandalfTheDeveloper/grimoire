// The Hoard, round B2: reading bank CSV files on this device. Pure functions (no React, no storage), so the
// whole import can be tested with made-up files. Nothing here ever leaves the device unencrypted.
//
// Two built-in formats, recognised by their header row (spec 4.3, headers only):
//   spending export  Date, Description, Original Description, Amount, Type, Parent Category, Category,
//                    Account, Tags, Memo, Pending
//   account history  Account Number, Post Date, Check, Description, Debit, Credit, Status, Balance,
//                    Classification
// Any other header row opens the column mapper, saved as a "profile" record so the next file just works.
import { csvTable } from "./csv.js";

export const SPEND_HEADERS = ["Date", "Description", "Original Description", "Amount", "Type", "Parent Category", "Category", "Account", "Tags", "Memo", "Pending"];
export const HIST_HEADERS = ["Account Number", "Post Date", "Check", "Description", "Debit", "Credit", "Status", "Balance", "Classification"];

export const BUILTIN = {
  spend: { kind: "spend", name: "Spending export", dateFmt: "mdy", sign: "type",
    map: { date: "Date", desc: "Description", orig: "Original Description", amount: "Amount", type: "Type", bankCat: "Category", account: "Account", pending: "Pending" } },
  hist: { kind: "hist", name: "Account history", dateFmt: "mdy", sign: "debitCredit",
    map: { date: "Post Date", desc: "Description", debit: "Debit", credit: "Credit", status: "Status", balance: "Balance", cls: "Classification", account: "Account Number" } },
};

// Fields the mapper asks for, per kind. "need" = the import can't work without it.
export const MAP_FIELDS = {
  spend: [["date", "Date", true], ["orig", "Description (as the bank wrote it)", true], ["desc", "Short description (optional)", false], ["amount", "Amount", false], ["debit", "Money out column (if separate)", false], ["credit", "Money in column (if separate)", false], ["type", "Debit/Credit column", false], ["account", "Account", false], ["bankCat", "Bank's category (hint only)", false], ["pending", "Pending (TRUE/FALSE)", false]],
  hist: [["date", "Date", true], ["desc", "Description", true], ["amount", "Amount", false], ["debit", "Money out column", false], ["credit", "Money in column", false], ["balance", "Balance", false], ["cls", "Classification (Paycheck / Transfer)", false], ["account", "Account", false], ["status", "Status", false]],
};
export const SIGNS = { type: "A Debit/Credit column says which", negativeOut: "Money out is negative", positiveOut: "Money out is positive", debitCredit: "Separate money-out and money-in columns" };

const norm = (h) => String(h || "").trim().toLowerCase();
export const headerKey = (headers) => headers.map(norm).join("|");
const hasAll = (headers, need) => { const s = new Set(headers.map(norm)); return need.every((h) => s.has(norm(h))); };

// Which format a file is in: a built-in one, a saved profile (exact header row), or null (ask).
export function detectFormat(headers, profiles = []) {
  if (hasAll(headers, SPEND_HEADERS)) return { ...BUILTIN.spend, builtIn: true };
  if (hasAll(headers, HIST_HEADERS)) return { ...BUILTIN.hist, builtIn: true };
  const key = headerKey(headers);
  const p = profiles.find((x) => x.headerKey === key);
  return p ? { ...p, builtIn: false } : null;
}

// A profile is usable when its required columns exist and amounts can be read one way or another.
export function profileProblem(p, headers) {
  if (!p || !MAP_FIELDS[p.kind]) return "Pick what kind of file this is.";
  const have = new Set(headers);
  for (const [f, label, need] of MAP_FIELDS[p.kind]) if (need && !have.has(p.map[f])) return `Pick the column for "${label}".`;
  for (const v of Object.values(p.map)) if (v && !have.has(v)) return `The column "${v}" is not in this file.`;
  if (p.sign === "debitCredit") { if (!p.map.debit && !p.map.credit) return "Pick the money-out and money-in columns."; }
  else if (!p.map.amount) return "Pick the Amount column.";
  if (p.sign === "type" && !p.map.type) return "Pick the Debit/Credit column, or say how money out is shown.";
  return "";
}

// ---------- values ----------
// "10/3/2026", "10/03/26", "2026-10-03" -> "2026-10-03". Never through Date(), so no timezone can shift it.
export function parseDate(text, fmt = "mdy") {
  const t = String(text ?? "").trim().split(/[ T]/)[0];
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  let y, mo, d;
  if (m) { [, y, mo, d] = m.map(Number); }
  else {
    m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/);
    if (!m) return null;
    const a = Number(m[1]), b = Number(m[2]);
    y = Number(m[3]); if (y < 100) y += 2000;
    [mo, d] = fmt === "dmy" ? [b, a] : [a, b];
  }
  if (mo < 1 || mo > 12 || d < 1 || d > new Date(y, mo, 0).getDate()) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
// "$1,234.56", "-12.30", "(12.30)", "" -> number (null when empty or junk)
export function parseAmount(text) {
  let t = String(text ?? "").trim();
  if (!t) return null;
  let neg = false;
  if (/^\(.*\)$/.test(t)) { neg = true; t = t.slice(1, -1); }
  t = t.replace(/[$,\s]/g, "");
  if (t.startsWith("-")) { neg = !neg; t = t.slice(1); }
  if (t.endsWith("-")) { neg = !neg; t = t.slice(0, -1); }
  if (!/^(\d+\.?\d*|\.\d+)$/.test(t)) return null;
  const v = Math.round(Number(t) * 100) / 100;
  return neg ? -v : v;
}
const yes = (v) => /^(true|yes|y|1|pending)$/i.test(String(v ?? "").trim());
// Long digit runs (account numbers) are cut to their last four before anything is kept, even encrypted.
export const maskAccount = (text) => String(text ?? "").trim().replace(/\d{5,}/g, (d) => `…${d.slice(-4)}`) || "(no account)";
const clean = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

// ---------- one file -> normalized rows ----------
// Row: { src, date, amount (positive), dir: "out"|"in", desc, orig, bankCat, acctKey, cls, balance, occ }
export function readFile(table, fmt) {
  const map = fmt.map || {};
  const get = (r, f) => (map[f] ? r[map[f]] ?? "" : "");
  const out = [];
  const skipped = { pending: 0, bad: 0 };
  const occ = new Map();
  for (const r of table.rows) {
    const date = parseDate(get(r, "date"), fmt.dateFmt);
    if (fmt.kind === "spend" && map.pending && yes(get(r, "pending"))) { skipped.pending += 1; continue; }
    if (fmt.kind === "hist" && map.status && /pending/i.test(get(r, "status"))) { skipped.pending += 1; continue; }
    let amount = null, dir = "out";
    if (fmt.sign === "debitCredit") {
      const db = parseAmount(get(r, "debit")), cr = parseAmount(get(r, "credit"));
      if (db) { amount = Math.abs(db); dir = "out"; } else if (cr) { amount = Math.abs(cr); dir = "in"; }
    } else {
      const a = parseAmount(get(r, "amount"));
      if (a !== null) {
        if (fmt.sign === "type") { amount = Math.abs(a); dir = /credit/i.test(get(r, "type")) ? "in" : a < 0 && !/debit/i.test(get(r, "type")) ? "in" : "out"; }
        else if (fmt.sign === "negativeOut") { amount = Math.abs(a); dir = a < 0 ? "out" : "in"; }
        else { amount = Math.abs(a); dir = a < 0 ? "in" : "out"; }
      }
    }
    if (!date || !amount) { skipped.bad += 1; continue; }
    const orig = clean(get(r, "orig")) || clean(get(r, "desc"));
    const desc = clean(get(r, "desc")) || orig;
    const clsText = norm(get(r, "cls"));
    const cls = fmt.kind === "hist" ? (clsText === "paycheck" ? "paycheck" : clsText === "transfer" ? "transfer" : "other") : "";
    const balance = map.balance ? parseAmount(get(r, "balance")) : null;
    const acctKey = maskAccount(get(r, "account"));
    const k = `${fmt.kind}|${acctKey}|${date}|${dir}|${amount.toFixed(2)}|${orig}`;
    const n = occ.get(k) || 0;
    occ.set(k, n + 1);
    out.push({ src: fmt.kind, date, amount, dir, desc, orig, bankCat: clean(get(r, "bankCat")), acctKey, cls, balance, occ: n, idKey: `${k}|${n}` });
  }
  return { rows: out, skipped, read: table.rows.length };
}
export const readText = (text) => csvTable(text);

// Date range of a file (pending rows excluded). from snaps to the 1st when the first row is in the first five
// days, to snaps to the month's end when the last row is in its last five days. Editable before saving.
const lastDayOf = (ym) => new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0).getDate();
export function fileRange(rows) {
  if (!rows.length) return null;
  let lo = rows[0].date, hi = rows[0].date;
  for (const r of rows) { if (r.date < lo) lo = r.date; if (r.date > hi) hi = r.date; }
  const from = Number(lo.slice(8)) <= 5 ? `${lo.slice(0, 7)}-01` : lo;
  const ld = lastDayOf(hi.slice(0, 7));
  const to = Number(hi.slice(8)) > ld - 5 ? `${hi.slice(0, 7)}-${String(ld).padStart(2, "0")}` : hi;
  return { from, to, first: lo, last: hi };
}

// ---------- ids (spec 4.2) ----------
// HMAC-SHA256 of the row's identity (source, account, date, amount, original description, occurrence in the
// file) under a secret kept inside the Vault, so re-importing an overlapping file meets the same records and
// the id (which the Sheet can see) reveals nothing.
const b64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
export async function hmacKey(secret) {
  return crypto.subtle.importKey("raw", new TextEncoder().encode(String(secret)), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
}
export async function hashId(key, prefix, text) {
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(text)));
  return `${prefix}${b64url(sig.slice(0, 18))}`; // 24 characters after the prefix
}
export async function assignIds(rows, key) { for (const r of rows) r.id = await hashId(key, "t", r.idKey); return rows; }

// ---------- rules (spec 4.5) ----------
// Rule: { order, pattern, action, months?, amountMin?, amountMax?, firstEachMonth?, account?, days?, on?, note? }
// pattern: case-insensitive regular expression tested against Original Description ("on": "desc" tests the
// short description instead: used by rules learned from "Always put X here?"). Lowest order that matches wins.
export function compileRules(ruleRecords) {
  return ruleRecords
    .map((r) => ({ id: r.id, ...r.data }))
    .filter((r) => r.pattern && r.action && r.action.type)
    .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0))
    .map((r) => {
      let re;
      try { re = new RegExp(r.pattern, "i"); } catch { re = new RegExp(String(r.pattern).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"); }
      return { ...r, re };
    });
}
export const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// used: Set of "ruleId|yyyy-MM" already taken by a firstEachMonth rule (from stored records and this import)
export function matchRule(row, rules, used, accountId = "") {
  const mo = Number(row.date.slice(5, 7)), day = Number(row.date.slice(8, 10)), ym = row.date.slice(0, 7);
  for (const r of rules) {
    const text = r.on === "desc" ? row.desc : row.orig || row.desc;
    if (!r.re.test(text)) continue;
    if (Array.isArray(r.months) && r.months.length && !r.months.map(Number).includes(mo)) continue;
    if (Number.isFinite(r.amountMin) && row.amount < r.amountMin) continue;
    if (Number.isFinite(r.amountMax) && row.amount > r.amountMax) continue;
    if (r.account && accountId && r.account !== accountId) continue;
    if (Array.isArray(r.days) && r.days.length === 2 && (day < r.days[0] || day > r.days[1])) continue;
    if (r.firstEachMonth) { const k = `${r.id}|${ym}`; if (used.has(k)) continue; used.add(k); }
    return r;
  }
  return null;
}

// What a matched rule does to a transaction.
function ruleOutcome(rule, base) {
  const a = rule.action;
  if (a.type === "line" && a.line) return { ...base, lineId: a.line, status: "auto", ruleId: rule.id };
  if (a.type === "transfer") return { ...base, kind: "transfer", lineId: "", status: "auto", ruleId: rule.id };
  if (a.type === "income") return { ...base, kind: "income", lineId: "", status: "auto", ruleId: rule.id };
  if (a.type === "ignore") return { ...base, kind: "ignore", lineId: "", status: "auto", ruleId: rule.id };
  if (a.type === "ask" && Array.isArray(a.choices)) return { ...base, status: "review", ruleId: rule.id, choices: a.choices.slice(0, 4) };
  return base;
}

// ---------- the whole import ----------
// files: [{ fmt, rows (with ids), range: {from,to}, name }]. acctMap: acctKey -> app account id.
// records: everything stored now (to skip duplicates, seed firstEachMonth, match history rows, keep balances).
// Returns what to write and a summary. Writes nothing itself.
export function planImport({ files, records, acctMap, batchId, now = Date.now() }) {
  const existing = new Map(records.filter((r) => r.type === "tx").map((r) => [r.id, r]));
  const rules = compileRules(records.filter((r) => r.type === "rule"));
  const used = new Set();
  for (const r of existing.values()) if (r.data.ruleId) used.add(`${r.data.ruleId}|${String(r.data.date).slice(0, 7)}`);
  const s = { read: 0, new: 0, dupes: 0, pending: 0, bad: 0, refunds: 0, transfers: 0, income: 0, auto: 0, review: 0, matched: 0, hidden: 0, ranges: [] };
  const add = [];
  const seen = new Set();
  const spendPool = []; // spending rows (new and stored) that history rows may duplicate
  for (const r of existing.values()) if (r.data.src === "spend" && r.data.kind !== "ignore") spendPool.push({ date: r.data.date, amount: r.data.amount, dir: r.data.dir, used: false, old: true });

  const base = (row, f) => ({
    v: 1, date: row.date, amount: row.amount, dir: row.dir, desc: row.desc, orig: row.orig, bankCat: row.bankCat,
    account: acctMap[row.acctKey] || "", src: row.src, cls: row.cls, kind: "", lineId: "", splits: [], status: "review",
    ruleId: "", choices: [], note: "", batch: batchId, histOnly: false, at: now,
  });

  // spending files first: they are the only source of spending (spec 2)
  const ordered = [...files].sort((a, b) => (a.fmt.kind === b.fmt.kind ? 0 : a.fmt.kind === "spend" ? -1 : 1));
  for (const f of ordered) {
    s.read += f.read || f.rows.length; s.pending += f.skipped ? f.skipped.pending : 0; s.bad += f.skipped ? f.skipped.bad : 0;
    if (f.range) s.ranges.push({ kind: f.fmt.kind, name: f.name || "", accounts: [...new Set(f.rows.map((r) => acctMap[r.acctKey] || ""))], from: f.range.from, to: f.range.to });
    for (const row of f.rows) {
      if (existing.has(row.id) || seen.has(row.id)) { s.dupes += 1; continue; }
      seen.add(row.id);
      const b = base(row, f);
      let tx;
      if (row.src === "spend") {
        b.kind = row.dir === "in" ? "refund" : "spend";
        const rule = matchRule(row, rules, used, b.account);
        tx = rule ? ruleOutcome(rule, b) : b;
        spendPool.push({ date: row.date, amount: row.amount, dir: row.dir, used: false });
      } else {
        // account history: paychecks are income, transfers are transfers, anything else is checked against the
        // spending export (same amount, same direction, within 3 days) and skipped when found there.
        if (row.cls === "paycheck") tx = { ...b, kind: "income", status: "auto" };
        else {
          const hit = findMatch(spendPool, row);
          if (row.cls === "transfer") {
            const rule = matchRule(row, rules, used, b.account);
            if (rule && rule.action.type === "line" && hit) { hit.used = true; s.matched += 1; continue; }
            tx = rule ? ruleOutcome(rule, { ...b, kind: row.dir === "in" ? "refund" : "spend" }) : { ...b, kind: "transfer", status: "auto" };
          } else if (hit) { hit.used = true; s.matched += 1; continue; }
          else {
            const rule = matchRule(row, rules, used, b.account);
            const hb = { ...b, kind: row.dir === "in" ? "refund" : "spend", histOnly: true };
            tx = rule ? ruleOutcome(rule, hb) : hb;
          }
        }
      }
      count(s, tx);
      add.push({ id: row.id, type: "tx", data: tx });
    }
  }

  // stored "only in account history" rows still waiting for review that a new spending row now explains
  const updates = [];
  for (const r of existing.values()) {
    const d = r.data;
    if (!d.histOnly || d.status !== "review" || d.kind === "matched") continue;
    const hit = findMatch(spendPool.filter((p) => !p.old), d);
    if (hit) { hit.used = true; updates.push({ id: r.id, type: "tx", data: { ...d, kind: "matched", status: "auto" } }); s.matched += 1; }
  }

  const balances = balancesFromHistory(files, acctMap);
  return { add, updates, balances, summary: s };
}

function count(s, tx) {
  s.new += 1;
  if (tx.kind === "refund" && !tx.histOnly) s.refunds += 1;
  if (tx.kind === "transfer") s.transfers += 1;
  if (tx.kind === "income") s.income += 1;
  if (tx.kind === "ignore") s.hidden += 1;
  if (tx.status === "review") s.review += 1; else s.auto += 1;
}

const dayNum = (d) => Math.round(Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10))) / 86400000);
export function findMatch(pool, row) {
  let best = null, bestGap = 99;
  for (const p of pool) {
    if (p.used || p.dir !== row.dir || Math.abs(p.amount - row.amount) > 0.004) continue;
    const gap = Math.abs(dayNum(p.date) - dayNum(row.date));
    if (gap <= 3 && gap < bestGap) { best = p; bestGap = gap; }
  }
  return best;
}

// Closing balance per account per month from the history files' Balance column (last balance of the last
// day seen in the month). Bank files list newest first or oldest first: the order is read from the file.
export function balancesFromHistory(files, acctMap) {
  const out = new Map(); // "acct|yyyy-MM" -> { accountId, month, amount, asOf }
  for (const f of files) {
    if (f.fmt.kind !== "hist" || !f.rows.length) continue;
    const rows = f.rows.filter((r) => r.balance !== null && r.balance !== undefined);
    if (!rows.length) continue;
    const desc = rows[0].date >= rows[rows.length - 1].date; // newest first (also the guess when all one day)
    const ordered = desc ? [...rows].reverse() : rows; // oldest -> newest, so the last write of a day wins
    for (const r of ordered) {
      const accountId = acctMap[r.acctKey];
      if (!accountId) continue;
      const month = r.date.slice(0, 7);
      const k = `${accountId}|${month}`;
      const cur = out.get(k);
      if (!cur || r.date >= cur.asOf) out.set(k, { accountId, month, amount: r.balance, asOf: r.date });
    }
  }
  return [...out.values()];
}

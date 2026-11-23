// The Hoard, round B2: CSV imports (both bank formats + the column mapper), duplicate skipping, transfers,
// refunds, the rules engine, the review list, splits, coverage ("no data", never $0), automatic balances, the
// card's balance owed, and Overview's plan vs actual. FAKE DATA ONLY: every name and number is made up.
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor, act, configure, within } from "@testing-library/react";
import App from "../src/shell/App.jsx";
import { sync, db, data, vault, collectionsFor, registerAppCollections } from "../src/core/index.js";
import { APPS } from "../src/apps/registry.js";
import { setSyncStatus } from "../src/core/syncStatus.js";
import { createBackend } from "./sim/sheetsSim.js";
import { parseCsv, csvTable, toCsv } from "../src/apps/budget/csv.js";
import {
  parseDate, parseAmount, maskAccount, detectFormat, readFile, readText, fileRange, hmacKey, assignIds, hashId,
  compileRules, matchRule, planImport, balancesFromHistory, SPEND_HEADERS, HIST_HEADERS, headerKey, profileProblem,
} from "../src/apps/budget/imports.js";
import { monthCoverage, monthActuals, makeDerive, savedActual, actualSeries, txParts, paceLabel } from "../src/apps/budget/actuals.js";
import { balanceAt, balanceTotals, addMonths, monthOf } from "../src/apps/budget/plan.js";
import { demoFiles, demoRecords } from "../src/apps/budget/demo.js";
import { resetStoreCache, setDemoOn } from "../src/apps/budget/store.js";
import { idKeyFor, IDKEY_ID } from "../src/apps/budget/txids.js";

configure({ asyncUtilTimeout: 6000 });
const KEY = "K".repeat(48);
const URL_ = "https://script.google.com/macros/s/TESTID/exec";
const PASS = "fake passphrase for tests only";

// ---------- made-up files ----------
const spendRow = (o) => ({ Date: "10/3/2026", Description: "Fake Grocer", "Original Description": "FAKE GROCER #9, TESTVILLE, ZZ", Amount: "50.00", Type: "Debit", "Parent Category": "", Category: "Groceries", Account: "Fake Card", Tags: "", Memo: "", Pending: "FALSE", ...o });
const histRow = (o) => ({ "Account Number": "000099998888", "Post Date": "10/8/2026", Check: "", Description: "FAKE EMPLOYER PAYROLL", Debit: "", Credit: "1500.00", Status: "Posted", Balance: "3000.00", Classification: "Paycheck", ...o });
const SPEND = toCsv(SPEND_HEADERS, [
  spendRow({ Date: "10/1/2026" }),
  spendRow({ Date: "10/3/2026", Amount: "50.00" }),
  spendRow({ Date: "10/3/2026", Amount: "50.00" }), // identical twin on the same day: both kept
  spendRow({ Date: "10/12/2026", Description: "Fake Shoe Shop", "Original Description": "FAKE SHOE SHOP", Amount: "80.00", Category: "Groceries" }),
  spendRow({ Date: "10/20/2026", Description: "Fake Shoe Shop", "Original Description": "FAKE SHOE SHOP", Amount: "30.00", Type: "Credit" }),
  spendRow({ Date: "10/14/2026", Description: "Fake Lender", "Original Description": "FAKE LENDER PMT", Amount: "1000.00", Account: "Fake Savings" }),
  spendRow({ Date: "10/29/2026", Description: "Fake Ride", "Original Description": "FAKE RIDE *TRIP", Amount: "15.00" }),
  spendRow({ Date: "10/30/2026", Description: "Fake Ride", "Original Description": "FAKE RIDE *AIRPORT", Amount: "40.00" }),
  spendRow({ Date: "10/25/2026", Description: "Fake Card Payment", "Original Description": "FAKE CARD PAYMENT", Amount: "400.00", Type: "Credit" }),
  spendRow({ Date: "10/31/2026", Amount: "9.99", Pending: "TRUE" }),
]);
const HIST = toCsv(HIST_HEADERS, [ // newest first, like the bank
  histRow({ "Post Date": "10/28/2026", Description: "ATM CASH", Debit: "35.00", Credit: "", Balance: "2465.00", Classification: "Other" }),
  histRow({ "Post Date": "10/22/2026", Description: "FAKE CARD PAYMENT", Debit: "400.00", Credit: "", Balance: "2500.00", Classification: "Transfer" }),
  histRow({ "Post Date": "10/15/2026", Description: "FAKE LENDER PMT", Debit: "1000.00", Credit: "", Balance: "2900.00", Classification: "Other" }), // also in the spending export
  histRow({ "Post Date": "10/8/2026", Balance: "3900.00" }),
  histRow({ "Post Date": "9/30/2026", Description: "FAKE INTEREST", Debit: "", Credit: "1.00", Balance: "2400.00", Classification: "Other" }),
]);

async function readAll(files, key) {
  const out = [];
  for (const f of files) {
    const t = readText(f.text);
    const fmt = detectFormat(t.headers, f.profiles || []);
    const r = readFile(t, fmt);
    await assignIds(r.rows, key);
    out.push({ fmt, ...r, range: fileRange(r.rows), name: f.name });
  }
  return out;
}
let n = 0;
const R = (type, data, extra = {}) => ({ id: `r${++n}xxxxxxxx`, type, data, updatedAt: n, ...extra });
const BASE = () => [
  R("section", { name: "Bills", kind: "spend", order: 0 }, { id: "sec-bills" }),
  R("section", { name: "Saving", kind: "saving", order: 1 }, { id: "sec-save" }),
  R("linev", { lineId: "groc", effective: "2026-01", name: "Groceries", sectionId: "sec-bills", amount: 120, cadence: "monthly" }),
  R("linev", { lineId: "house", effective: "2026-01", name: "House", sectionId: "sec-bills", amount: 1000, cadence: "monthly" }),
  R("linev", { lineId: "fun", effective: "2026-01", name: "Going out", sectionId: "sec-bills", amount: 50, cadence: "monthly" }),
  R("linev", { lineId: "travel", effective: "2026-01", name: "Travel", sectionId: "sec-bills", amount: 600, cadence: "irregular" }),
  R("linev", { lineId: "ira", effective: "2026-01", name: "IRA", sectionId: "sec-save", amount: 100, cadence: "monthly" }),
  R("account", { name: "Fake Chk", kind: "checking", order: 0 }, { id: "acct-chk" }),
  R("account", { name: "Fake Sav", kind: "savings", order: 1 }, { id: "acct-sav" }),
  R("account", { name: "Fake Crd", kind: "card", order: 2 }, { id: "acct-card" }),
  R("rule", { order: 10, pattern: "FAKE GROCER", action: { type: "line", line: "groc" } }, { id: "rule-groc" }),
  R("rule", { order: 20, pattern: "FAKE LENDER", action: { type: "line", line: "house" } }, { id: "rule-house" }),
  R("rule", { order: 30, pattern: "RIDE.*AIRPORT", action: { type: "line", line: "travel" } }, { id: "rule-air" }),
  R("rule", { order: 40, pattern: "FAKE RIDE", action: { type: "ask", choices: ["fun", "travel"] } }, { id: "rule-ride" }),
  R("rule", { order: 50, pattern: "CARD PAYMENT", action: { type: "transfer" } }, { id: "rule-pay" }),
];
const MAP = { "Fake Card": "acct-card", "Fake Savings": "acct-sav", "…8888": "acct-chk" };
const asStored = (list) => list.map((x, i) => ({ ...x, updatedAt: 1e6 + i }));

// ---------------- pure logic ----------------
describe("CSV reading", () => {
  it("quotes, commas and line breaks inside quotes, doubled quotes, CRLF and a byte-order mark", () => {
    const rows = parseCsv('﻿a,b,c\r\n1,"x, y","say ""hi"""\r\n2,"line\nbreak",\r\n\r\n');
    expect(rows).toEqual([["a", "b", "c"], ["1", "x, y", 'say "hi"'], ["2", "line\nbreak", ""]]);
    expect(csvTable("A, B\n1,2").headers).toEqual(["A", "B"]);
    expect(parseCsv(toCsv(["h"], [{ h: 'a,"b"' }]))[1]).toEqual(['a,"b"']);
  });
  it("dates without timezones, amounts in bank formats, account numbers cut to four digits", () => {
    expect(parseDate("10/3/2026")).toBe("2026-10-03");
    expect(parseDate("1/31/26")).toBe("2026-01-31");
    expect(parseDate("2026-02-30")).toBeNull();
    expect(parseDate("3/10/2026", "dmy")).toBe("2026-10-03");
    expect(parseAmount("$1,234.50")).toBe(1234.5);
    expect(parseAmount("(12.30)")).toBe(-12.3);
    expect(parseAmount("")).toBeNull();
    expect(maskAccount("000099998888")).toBe("…8888");
    expect(maskAccount("Fake Card")).toBe("Fake Card");
  });
  it("recognises both bank formats by their headers, a saved profile by its exact headers, and nothing else", () => {
    expect(detectFormat(SPEND_HEADERS).kind).toBe("spend");
    expect(detectFormat([...HIST_HEADERS].reverse()).kind).toBe("hist");
    const odd = ["When", "What", "How much"];
    expect(detectFormat(odd)).toBeNull();
    const p = { kind: "spend", name: "Odd bank", headerKey: headerKey(odd), map: { date: "When", orig: "What", amount: "How much" }, sign: "negativeOut", dateFmt: "mdy" };
    expect(detectFormat(odd, [p]).name).toBe("Odd bank");
    expect(profileProblem(p, odd)).toBe("");
    expect(profileProblem({ ...p, map: { date: "When" } }, odd)).toMatch(/Description/);
  });
});

describe("reading a file", () => {
  it("spending export: pending skipped, Credit is money back, identical rows on one day both kept", async () => {
    const t = readText(SPEND);
    const r = readFile(t, detectFormat(t.headers));
    expect(r.read).toBe(10);
    expect(r.skipped.pending).toBe(1);
    expect(r.rows.length).toBe(9);
    expect(r.rows.find((x) => x.orig === "FAKE SHOE SHOP" && x.dir === "in").amount).toBe(30);
    expect(r.rows.filter((x) => x.date === "2026-10-03").map((x) => x.occ)).toEqual([0, 1]);
    expect(fileRange(r.rows)).toMatchObject({ from: "2026-10-01", to: "2026-10-31" });
  });
  it("ids: the same row in an overlapping file meets the same id; another secret gives other ids; the id hides the row", async () => {
    const k1 = await hmacKey("secret one"), k2 = await hmacKey("secret two");
    const a = await readAll([{ text: SPEND }], k1);
    const overlap = toCsv(SPEND_HEADERS, [spendRow({ Date: "10/3/2026" }), spendRow({ Date: "10/3/2026" }), spendRow({ Date: "11/2/2026" })]);
    const b = await readAll([{ text: overlap }], k1);
    const c = await readAll([{ text: SPEND }], k2);
    const ids = new Set(a[0].rows.map((r) => r.id));
    expect(ids.size).toBe(9);
    expect(b[0].rows.slice(0, 2).every((r) => ids.has(r.id))).toBe(true);
    expect(ids.has(b[0].rows[2].id)).toBe(false);
    expect(c[0].rows.some((r) => ids.has(r.id))).toBe(false);
    for (const r of a[0].rows) { expect(r.id).toMatch(/^t[A-Za-z0-9_-]{24}$/); expect(r.id).not.toMatch(/2026|GROCER/i); }
  });
});

describe("rules", () => {
  const row = (o) => ({ date: "2026-10-05", amount: 20, dir: "out", orig: "FAKE STORE 12", desc: "Fake Store", ...o });
  it("lowest order wins; months, amount range, day window and first-each-month narrow a rule; a bad pattern is read literally", () => {
    const rules = compileRules([
      R("rule", { order: 5, pattern: "FAKE CLUB", months: [10], amountMin: 99, amountMax: 99, action: { type: "line", line: "fee" } }, { id: "r-fee" }),
      R("rule", { order: 6, pattern: "FAKE CLUB", firstEachMonth: true, action: { type: "line", line: "member" } }, { id: "r-first" }),
      R("rule", { order: 7, pattern: "FAKE CLUB", action: { type: "line", line: "shop" } }, { id: "r-shop" }),
      R("rule", { order: 8, pattern: "a(b", action: { type: "line", line: "lit" } }, { id: "r-lit" }),
      R("rule", { order: 9, pattern: "^Fake Store$", on: "desc", action: { type: "line", line: "store" } }, { id: "r-desc" }),
      R("rule", { order: 1, pattern: "PAYDAY", days: [1, 3], action: { type: "income" } }, { id: "r-day" }),
    ]);
    const used = new Set();
    expect(matchRule(row({ orig: "FAKE CLUB 3", amount: 99 }), rules, used).id).toBe("r-fee");
    expect(matchRule(row({ orig: "FAKE CLUB 3", amount: 99, date: "2026-11-05" }), rules, used).id).toBe("r-first");
    expect(matchRule(row({ orig: "FAKE CLUB 3", amount: 10, date: "2026-11-09" }), rules, used).id).toBe("r-shop");
    expect(matchRule(row({ orig: "x a(b y" }), rules, used).id).toBe("r-lit");
    expect(matchRule(row({}), rules, used).id).toBe("r-desc");
    expect(matchRule(row({ orig: "PAYDAY", date: "2026-10-09" }), rules, used).id).toBe("r-desc"); // outside the day window
    expect(matchRule(row({ orig: "PAYDAY", desc: "x", date: "2026-10-02" }), rules, used).id).toBe("r-day");
    expect(matchRule(row({ orig: "PAYDAY", desc: "x", date: "2026-10-09" }), rules, used)).toBeNull();
  });
});

describe("planning an import", () => {
  it("sorts, skips pending and history rows already in the spending export, asks about rides, and counts it all", async () => {
    const key = await hmacKey("t");
    const files = await readAll([{ text: SPEND, name: "s.csv" }, { text: HIST, name: "h.csv" }], key);
    const { add, summary: s, balances } = planImport({ files, records: BASE(), acctMap: MAP, batchId: "b1" });
    const by = (orig) => add.find((x) => x.data.orig === orig).data;
    expect(s).toMatchObject({ read: 15, pending: 1, new: 13, dupes: 0, matched: 1, refunds: 1, income: 1, transfers: 2, review: 5 });
    expect(by("FAKE GROCER #9, TESTVILLE, ZZ")).toMatchObject({ kind: "spend", lineId: "groc", status: "auto", account: "acct-card" });
    expect(by("FAKE RIDE *AIRPORT")).toMatchObject({ lineId: "travel", status: "auto" });
    expect(by("FAKE RIDE *TRIP")).toMatchObject({ status: "review", choices: ["fun", "travel"] });
    expect(add.filter((x) => x.data.orig === "FAKE SHOE SHOP").map((x) => [x.data.kind, x.data.status])).toEqual([["spend", "review"], ["refund", "review"]]);
    expect(by("FAKE CARD PAYMENT")).toMatchObject({ kind: "transfer", status: "auto" }); // spending export, by rule
    expect(add.filter((x) => x.data.orig === "FAKE LENDER PMT").length).toBe(1); // history copy skipped
    expect(by("FAKE EMPLOYER PAYROLL")).toMatchObject({ kind: "income", src: "hist", account: "acct-chk" });
    expect(by("ATM CASH")).toMatchObject({ kind: "spend", histOnly: true, status: "review" });
    expect(by("FAKE INTEREST")).toMatchObject({ kind: "refund", histOnly: true, dir: "in" });
    expect(s.ranges.find((r) => r.kind === "hist")).toMatchObject({ from: "2026-09-30", to: "2026-10-31", accounts: ["acct-chk"] });
    // newest-first file: the month's closing balance is the latest row, not the first one read
    expect(balances).toEqual([{ accountId: "acct-chk", month: "2026-09", amount: 2400, asOf: "2026-09-30" }, { accountId: "acct-chk", month: "2026-10", amount: 2465, asOf: "2026-10-28" }]);
  });
  it("importing the same files again adds nothing; a later spending file explains a waiting history-only row", async () => {
    const key = await hmacKey("t");
    const base = BASE();
    const first = planImport({ files: await readAll([{ text: SPEND }, { text: HIST }], key), records: base, acctMap: MAP, batchId: "b1" });
    const stored = [...base, ...asStored(first.add)];
    const again = planImport({ files: await readAll([{ text: SPEND }, { text: HIST }], key), records: stored, acctMap: MAP, batchId: "b2" });
    expect(again.add.length).toBe(0);
    expect(again.summary.dupes).toBe(13); // the history copy of the mortgage is matched again, not stored
    expect(again.summary.matched).toBe(1);
    const later = toCsv(SPEND_HEADERS, [spendRow({ Date: "10/27/2026", Description: "Fake Cash", "Original Description": "FAKE CASH WITHDRAWAL", Amount: "35.00", Account: "Fake Card" })]);
    const res = planImport({ files: await readAll([{ text: later }], key), records: stored, acctMap: MAP, batchId: "b3" });
    expect(res.updates.map((u) => [u.data.orig, u.data.kind])).toEqual([["ATM CASH", "matched"]]);
  });
  it("a history transfer that a rule puts on a saving line counts as saving; oldest-first files work too", async () => {
    const hist = toCsv(HIST_HEADERS, [
      histRow({ "Post Date": "11/1/2026", Description: "FAKE ROBO IRA XFER", Debit: "100.00", Credit: "", Balance: "900.00", Classification: "Transfer" }),
      histRow({ "Post Date": "11/9/2026", Description: "TO SAVINGS", Debit: "200.00", Credit: "", Balance: "700.00", Classification: "Transfer" }),
    ]);
    const recs = [...BASE(), R("rule", { order: 1, pattern: "ROBO IRA", action: { type: "line", line: "ira" } }, { id: "rule-ira" })];
    const res = planImport({ files: await readAll([{ text: hist }], await hmacKey("t")), records: recs, acctMap: MAP, batchId: "b" });
    expect(res.add.map((x) => [x.data.desc, x.data.kind, x.data.lineId])).toEqual([["FAKE ROBO IRA XFER", "spend", "ira"], ["TO SAVINGS", "transfer", ""]]);
    expect(res.balances).toEqual([{ accountId: "acct-chk", month: "2026-11", amount: 700, asOf: "2026-11-09" }]);
    const all = [...recs, ...asStored(res.add), R("batch", { ranges: [{ kind: "spend", from: "2026-11-01", to: "2026-11-30" }] })];
    const a = monthActuals(all, "2026-11");
    expect(a.saving).toBe(100);
    expect(a.spent).toBe(0);
  });
});

describe("actuals", () => {
  const tx = (date, amount, o = {}) => R("tx", { date, amount, dir: "out", kind: "spend", lineId: "", splits: [], status: "auto", src: "spend", account: "acct-card", ...o });
  const recs = () => [
    ...BASE(),
    R("batch", { ranges: [{ kind: "spend", from: "2026-09-01", to: "2026-09-30" }, { kind: "spend", from: "2026-10-01", to: "2026-10-15" }] }),
    tx("2026-10-02", 100, { lineId: "groc" }),
    tx("2026-10-03", 40, { kind: "refund", dir: "in", lineId: "groc" }),
    tx("2026-10-04", 90, { splits: [{ lineId: "groc", amount: 60 }, { lineId: "fun", amount: 30 }] }),
    tx("2026-10-05", 25, { status: "review" }),
    tx("2026-10-06", 100, { lineId: "ira" }),
    tx("2026-10-07", 500, { kind: "transfer", dir: "in" }), // card payment
    tx("2026-10-09", 70, { lineId: "fun" }),
    tx("2026-10-10", 2000, { kind: "income", dir: "in", cls: "paycheck", src: "hist", account: "acct-chk" }),
    tx("2026-03-10", 200, { lineId: "travel" }),
  ];
  it("refunds come off their line, splits land on each line, saving is gold not spending, unsorted still counts", () => {
    const a = monthActuals(recs(), "2026-10");
    expect(a.byLine).toEqual({ groc: 120, fun: 100, ira: 100 });
    expect(a.unsorted).toBe(25);
    expect(a.spent).toBe(245); // 120 + 100 + 25
    expect(a.saving).toBe(100);
    expect(a.in).toBe(2000);
    expect(a.review).toBe(1);
    expect(txParts({ kind: "refund", amount: 5, lineId: "x" })).toEqual([{ lineId: "x", amount: -5 }]);
  });
  it("coverage: none, partial (through a date), full; months outside it are no data, never $0", () => {
    const r = recs();
    expect(monthCoverage(r, "2026-09")).toMatchObject({ status: "full" });
    expect(monthCoverage(r, "2026-10")).toMatchObject({ status: "partial", through: "2026-10-15" });
    expect(monthCoverage(r, "2026-08").status).toBe("none");
    expect(monthCoverage([R("batch", { ranges: [{ kind: "spend", from: "2026-07-01", to: "2026-07-10" }, { kind: "spend", from: "2026-07-11", to: "2026-07-31" }] })], "2026-07").status).toBe("full");
    const s = actualSeries(r, "2026-10", 3);
    expect(s.map((x) => x.spent)).toEqual([null, 0, 245]); // August: no data; September: imported, nothing spent
    expect(paceLabel(200, 500)).toBe("under pace");
    expect(paceLabel(480, 500)).toBe("on pace");
  });
  it("card owed = charges since the last payment, once a payment is seen; a typed balance still wins", () => {
    const r = recs();
    const derive = makeDerive(r);
    // after the Oct 7 payment: 70 (Oct 9); refunds and earlier charges don't count
    expect(derive("acct-card", "2026-10")).toEqual({ amount: 70, since: "2026-10-07" });
    expect(derive("acct-card", "2026-09")).toBeNull();
    expect(balanceAt(r, "acct-card", "2026-10", derive)).toMatchObject({ amount: 70, source: "derived" });
    const typed = [...r, R("bal", { accountId: "acct-card", month: "2026-10", amount: 333 })];
    expect(balanceAt(typed, "acct-card", "2026-10", makeDerive(typed))).toMatchObject({ amount: 333, source: "manual" });
  });
  it("automatic balances: a typed one beats an automatic one in the same month; the latest automatic one wins", () => {
    const r = [
      R("bal", { accountId: "a", month: "2026-10", amount: 10, auto: true, asOf: "2026-10-20" }),
      R("bal", { accountId: "a", month: "2026-10", amount: 20, auto: true, asOf: "2026-10-28" }),
      R("bal", { accountId: "a", month: "2026-09", amount: 5 }),
    ];
    expect(balanceAt(r, "a", "2026-10")).toMatchObject({ amount: 20, source: "auto", asOf: "2026-10-28" });
    expect(balanceAt([...r, R("bal", { accountId: "a", month: "2026-10", amount: 99 })], "a", "2026-10")).toMatchObject({ amount: 99, source: "manual" });
  });
  it("saved = change in cash + money put into saving lines; without balances it is an estimate", () => {
    const r = [...recs(),
      R("bal", { accountId: "acct-chk", month: "2026-09", amount: 1000, auto: true, asOf: "2026-09-30" }), R("bal", { accountId: "acct-sav", month: "2026-09", amount: 5000, auto: true, asOf: "2026-09-30" }),
      R("bal", { accountId: "acct-chk", month: "2026-10", amount: 2000, auto: true, asOf: "2026-10-31" }), R("bal", { accountId: "acct-sav", month: "2026-10", amount: 5100, auto: true, asOf: "2026-10-31" }),
      R("bal", { accountId: "acct-card", month: "2026-09", amount: 400 }),
    ];
    const a = monthActuals(r, "2026-10");
    // cash Sep = 1000 + 5000 − 400 = 5600; Oct = 2000 + 5100 − 70 (derived) = 7030; + 100 into the IRA line
    expect(savedActual(r, "2026-10", a, makeDerive(r), balanceTotals)).toEqual({ amount: 1530, how: "balances" });
    expect(savedActual(recs(), "2026-10", a, makeDerive(recs()), balanceTotals)).toEqual({ amount: 1755, how: "estimate" });
  });
});

describe("demo files", () => {
  it("a made-up quarter in both formats, only made-up names, imports cleanly against the demo plan", async () => {
    const now = new Date(2026, 10, 23);
    const files = demoFiles(now);
    expect(files.map((f) => detectFormat(readText(f.text).headers).kind)).toEqual(["spend", "hist", "hist"]);
    for (const f of files) expect(f.text).toMatch(/DEMO|FAKE|SAMPLE|TRANSFER|ATM|INTEREST|CARD PAYMENT/);
    const recs = demoRecords(now);
    const map = Object.fromEntries(recs.filter((r) => r.type === "acctmap").map((r) => [r.data.key, r.data.accountId]));
    const read = await readAll(files.map((f) => ({ text: f.text, name: f.name })), await hmacKey("demo"));
    const res = planImport({ files: read, records: recs, acctMap: map, batchId: "b" });
    expect(res.summary.pending).toBe(2);
    expect(res.summary.matched).toBe(9); // mortgage, gym and coffee in both files, three months
    expect(res.summary.ranges.find((r) => r.kind === "spend")).toMatchObject({ from: "2026-08-01", to: "2026-10-31" });
    expect(res.add.every((x) => x.data.account)).toBe(true);
    expect(res.balances.length).toBe(6);
  });
});

// ---------------- screens ----------------
let be;
const settle = async () => { await sync.syncNow("open"); await sync.syncNow("open"); };
const setWidth = (w) => Object.defineProperty(window, "innerWidth", { value: w, configurable: true });
const open = async () => { window.location.hash = "#/app/budget"; render(<App />); return screen.findByTestId("hx-app", {}, { timeout: 6000 }); };
const dataH = () => collectionsFor("budget").find((c) => c.name === "data");
const txH = () => collectionsFor("budget").find((c) => c.name === "tx");
const allCells = () => [...be.sheets.keys()].flatMap((name) => be.rows(name).flatMap((r) => Object.values(r).map(String)));
const file = (name, text) => new File([text], name, { type: "text/csv" });

async function wipeBudget() {
  await db.open();
  const mine = (await db.all()).filter((r) => r.app === "budget");
  await db.deleteMany(mine.map((r) => r.pk));
  for (const k of await db.metaKeys("cursor:budget")) await db.delMeta(k);
  await data.hydrate();
}
async function seedReal() {
  for (const r of BASE()) await dataH().put(r.id, { Type: r.type, Data: r.data });
}

beforeAll(async () => {
  if (!collectionsFor("budget").length) registerAppCollections(APPS);
  await db.open();
  await vault.init();
  if (!vault.setupDone) await vault.setup(PASS);
});
beforeEach(async () => {
  vi.spyOn(sync, "start").mockImplementation(() => {});
  cleanup();
  window.localStorage.clear();
  await wipeBudget();
  if (!vault.unlocked) await vault.unlock(PASS);
  resetStoreCache();
  window.location.hash = "";
  setSyncStatus({ pending: 0, lastSync: null, errors: [], configured: false, lastError: null, backendVersion: null });
  setWidth(390);
  be = createBackend({ key: KEY });
  window.fetch = be.fetch;
  window.localStorage.setItem("grimoire:sync:config", JSON.stringify({ url: URL_, key: KEY }));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("importing in the app (real data path, fake files)", () => {
  it("asks for unknown accounts once, shows the summary, saves encrypted, and a second import adds nothing", async () => {
    await seedReal();
    await open();
    fireEvent.click(screen.getByTestId("hx-tab-transactions"));
    expect((await screen.findByTestId("tx-last-import")).textContent).toBe("No imports yet");
    fireEvent.click(screen.getByTestId("tx-import"));
    fireEvent.change(await screen.findByTestId("imp-files"), { target: { files: [file("spend.csv", SPEND), file("hist.csv", HIST)] } });
    // three account names in the files the app has never seen
    await screen.findByTestId("imp-accounts");
    fireEvent.click(screen.getByTestId("imp-acct-save"));
    expect(screen.getByTestId("imp-acct-error").textContent).toMatch(/Say which account/);
    fireEvent.change(screen.getByTestId("imp-acct-Fake Card"), { target: { value: "acct-card" } });
    fireEvent.change(screen.getByTestId("imp-acct-Fake Savings"), { target: { value: "acct-sav" } });
    fireEvent.change(screen.getByTestId("imp-acct-…8888"), { target: { value: "acct-chk" } });
    fireEvent.click(screen.getByTestId("imp-acct-save"));
    fireEvent.click(await screen.findByTestId("imp-continue"));
    const sum = await screen.findByTestId("imp-summary");
    expect(within(sum).getByTestId("imp-sum-New").textContent).toBe("13");
    expect(within(sum).getByTestId("imp-sum-Pending (skipped)").textContent).toBe("1");
    expect(within(sum).getByTestId("imp-sum-Need review").textContent).toBe("5");
    expect(screen.getByTestId("imp-from-0").value).toBe("2026-10-01");
    fireEvent.click(screen.getByTestId("imp-save"));
    expect((await screen.findByTestId("imp-done")).textContent).toMatch(/Imported 13 new transactions.*2 month-end balances/);
    fireEvent.click(screen.getByTestId("imp-finish"));
    expect(screen.getByTestId("tx-review-count").textContent).toBe("5 to review");
    expect(screen.getByTestId("tx-last-import").textContent).toBe("Last import: today");
    expect((await txH().list()).length).toBe(13);

    // the Sheet only ever sees envelope + scrambled payload, and ids that reveal nothing
    await act(settle);
    expect(be.rows("budget_txenc").length).toBe(13);
    expect(be.sheets.has("budget_tx")).toBe(false);
    expect(be.headers("budget_txenc")).toEqual(["Id", "CreatedAt", "UpdatedAt", "SyncedAt", "Deleted", "SchemaVersion", "Payload"]);
    const cells = allCells();
    for (const secret of ["FAKE GROCER", "Fake Shoe", "1000.00", "1500", "2026-10", "…8888", "8888", "Fake Card", "acctmap", "\"tx\""]) expect(cells.some((c) => c.includes(secret)), secret).toBe(false);
    for (const r of be.rows("budget_txenc")) expect(r.Id).toMatch(/^t[A-Za-z0-9_-]{24}$/);

    // the same files again: nothing new, no questions about accounts
    fireEvent.click(screen.getByTestId("tx-import"));
    fireEvent.change(await screen.findByTestId("imp-files"), { target: { files: [file("spend.csv", SPEND), file("hist.csv", HIST)] } });
    fireEvent.click(await screen.findByTestId("imp-continue"));
    expect(within(await screen.findByTestId("imp-summary")).getByTestId("imp-sum-New").textContent).toBe("0");
    expect(screen.getByTestId("imp-sum-Already here (skipped)").textContent).toBe("13");
    fireEvent.click(screen.getByTestId("imp-save"));
    await screen.findByTestId("imp-done");
    expect((await txH().list()).length).toBe(13);
  });

  it("review: a ride asks, a manual sort offers a rule, a split, and Overview shows plan vs actual", async () => {
    await seedReal();
    for (const [key, accountId] of Object.entries(MAP)) await dataH().put(null, { Type: "acctmap", Data: { key, accountId } });
    await open();
    fireEvent.click(screen.getByTestId("hx-tab-transactions"));
    fireEvent.click(await screen.findByTestId("tx-import"));
    fireEvent.change(await screen.findByTestId("imp-files"), { target: { files: [file("spend.csv", SPEND), file("hist.csv", HIST)] } });
    fireEvent.click(await screen.findByTestId("imp-continue"));
    fireEvent.click(await screen.findByTestId("imp-save"));
    fireEvent.click(await screen.findByTestId("imp-finish"));
    // the ride: its rule's two choices as buttons
    fireEvent.click(await screen.findByTestId("rv-choice-Going out"));
    await waitFor(() => expect(screen.queryByTestId("rv-Fake Ride")).toBeNull());
    expect(screen.queryByTestId("tx-offer")).toBeNull(); // "ask" rows never learn a rule
    // the shoe purchase (bank says Groceries): put it on Going out by hand -> offered a rule
    fireEvent.change(screen.getAllByTestId("rv-line-Fake Shoe Shop")[0], { target: { value: "fun" } });
    expect((await screen.findByTestId("tx-offer")).textContent).toMatch(/Always put Fake Shoe Shop on Going out/);
    fireEvent.click(screen.getByTestId("tx-offer-yes"));
    expect((await screen.findByTestId("tx-offer-done")).textContent).toMatch(/1 more waiting here was sorted/); // the refund
    const rules = (await dataH().list()).filter((r) => r.Type === "rule" && r.Data.on === "desc");
    expect(rules.map((r) => [r.Data.pattern, r.Data.order])).toEqual([["^Fake Shoe Shop$", 9]]);
    // the ATM row: split it
    fireEvent.click(screen.getByTestId("rv-more-ATM CASH"));
    fireEvent.click(await screen.findByTestId("te-split-toggle"));
    fireEvent.change(screen.getByTestId("te-part-line-0"), { target: { value: "groc" } });
    fireEvent.change(screen.getByTestId("te-part-amt-0"), { target: { value: "25" } });
    fireEvent.change(screen.getByTestId("te-part-line-1"), { target: { value: "fun" } });
    fireEvent.change(screen.getByTestId("te-part-amt-1"), { target: { value: "5" } });
    fireEvent.click(screen.getByTestId("te-save"));
    expect(screen.getByTestId("te-error").textContent).toMatch(/add up to \$35\.00 \(\$5\.00 left\)/);
    fireEvent.change(screen.getByTestId("te-part-amt-1"), { target: { value: "10" } });
    fireEvent.click(screen.getByTestId("te-save"));
    await waitFor(() => expect(screen.queryByTestId("tx-editor")).toBeNull());
    // the interest: income
    fireEvent.click(screen.getByTestId("rv-more-FAKE INTEREST"));
    fireEvent.click(await screen.findByTestId("te-kind-income"));
    fireEvent.click(screen.getByTestId("te-save"));
    await waitFor(() => expect(screen.getByTestId("tx-review-count").textContent).toBe("0 to review"));

    // Overview, October 2026 (fully imported)
    fireEvent.click(screen.getByTestId("hx-tab-overview"));
    const now = monthOf();
    for (let m = now; m > "2026-10"; m = addMonths(m, -1)) fireEvent.click(screen.getByTestId("ov-month-prev"));
    for (let m = now; m < "2026-10"; m = addMonths(m, 1)) fireEvent.click(screen.getByTestId("ov-month-next"));
    await waitFor(() => expect(screen.getByTestId("ov-coverage").textContent).toMatch(/Actual/));
    // spent: groceries 150 (+25 split) = 175, house 1000, going out 15 + 80 − 30 + 10 = 75, travel 40 -> 1290
    expect(screen.getByTestId("ov-spent").textContent).toBe("$1,290");
    expect(screen.getByTestId("ov-in").textContent).toBe("$1,500");
    expect(screen.getByTestId("ov-act-Bills").textContent).toBe("$1,290");
    expect(screen.getByTestId("ov-over-Bills")).toBeTruthy(); // plan for Bills is 1,170 + 50 travel pace
    fireEvent.click(screen.getByTestId("ov-sec-Bills"));
    expect(screen.getByTestId("ov-lact-Groceries").textContent).toBe("$175");
    expect(screen.getByTestId("ov-ytd-Travel").textContent).toMatch(/Year to date: \$40 spent of \$500 planned.*under pace/);
    // a month never imported: no data, never $0
    fireEvent.click(screen.getByTestId("ov-month-prev"));
    fireEvent.click(screen.getByTestId("ov-month-prev"));
    expect(screen.getByTestId("ov-coverage").textContent).toMatch(/no data, not \$0/);
    // Balances: checking filled from the history file
    fireEvent.click(screen.getByTestId("hx-tab-balances"));
    for (let i = 0; i < 2; i++) fireEvent.click(screen.getByTestId("bal-month-next"));
    expect((await screen.findByTestId("acct-src-Fake Chk")).textContent).toMatch(/from account history, 2026-10-28/);
    expect(screen.getByTestId("acct-amt-Fake Chk").textContent).toBe("$2,465");
    expect(screen.getByTestId("acct-src-Fake Crd").textContent).toMatch(/charges since the payment on 2026-10-25/);
    expect(screen.getByTestId("acct-amt-Fake Crd").textContent).toBe("−$55"); // the two rides after the payment
  });

  it("an unknown bank layout opens the column mapper once; the next file in that layout just works", async () => {
    await seedReal();
    await dataH().put(null, { Type: "acctmap", Data: { key: "(no account)", accountId: "acct-card" } });
    const odd = "When,What,How much\r\n10/2/2026,FAKE GROCER 1,-12.50\r\n10/9/2026,FAKE REFUND,4.00\r\n";
    await open();
    fireEvent.click(screen.getByTestId("hx-tab-transactions"));
    fireEvent.click(await screen.findByTestId("tx-import"));
    fireEvent.change(await screen.findByTestId("imp-files"), { target: { files: [file("odd.csv", odd)] } });
    await screen.findByTestId("imp-mapper");
    expect(screen.getByTestId("map-problem").textContent).toMatch(/Date/);
    fireEvent.change(screen.getByTestId("map-sign"), { target: { value: "negativeOut" } });
    fireEvent.change(screen.getByTestId("map-orig"), { target: { value: "What" } });
    fireEvent.change(screen.getByTestId("map-amount"), { target: { value: "How much" } });
    expect(screen.getByTestId("map-problem").textContent).toMatch(/Date/);
    fireEvent.change(screen.getByTestId("map-date-col"), { target: { value: "When" } });
    expect(screen.getByTestId("map-preview").textContent).toMatch(/2026-10-02 · out \$12\.50.*2026-10-09 · in \$4\.00/);
    fireEvent.change(screen.getByTestId("map-name"), { target: { value: "Fake odd bank" } });
    fireEvent.click(screen.getByTestId("map-save"));
    expect((await screen.findByTestId("imp-recognised")).textContent).toMatch(/Fake odd bank \(your saved format\)/);
    fireEvent.click(screen.getByTestId("imp-continue"));
    expect(within(await screen.findByTestId("imp-summary")).getByTestId("imp-sum-New").textContent).toBe("2");
    fireEvent.click(screen.getByTestId("imp-save"));
    fireEvent.click(await screen.findByTestId("imp-finish"));
    // next time: recognised straight away
    fireEvent.click(screen.getByTestId("tx-import"));
    fireEvent.change(await screen.findByTestId("imp-files"), { target: { files: [file("odd2.csv", "When,What,How much\r\n10/12/2026,FAKE GROCER 2,-3.00\r\n")] } });
    expect((await screen.findByTestId("imp-recognised")).textContent).toMatch(/Fake odd bank/);
    expect(screen.queryByTestId("imp-mapper")).toBeNull();
  });

  it("the id secret is kept in the Vault as a record, so a re-key cannot change transaction ids", async () => {
    const stored = [];
    const k1 = await idKeyFor({ demoOn: false, realRecords: [], putReal: async (id, type, d) => { stored.push({ id, type, data: d }); } });
    expect(stored.map((r) => [r.id, r.type])).toEqual([[IDKEY_ID, "idkey"]]);
    const k2 = await idKeyFor({ demoOn: false, realRecords: stored, putReal: async () => { throw new Error("should not write again"); } });
    expect(await hashId(k1, "t", "x")).toBe(await hashId(k2, "t", "x"));
    // deriving twice from the same Vault key gives the same secret (two devices importing before they sync)
    const again = [];
    await idKeyFor({ demoOn: false, realRecords: [], putReal: async (id, type, d) => { again.push(d); } });
    expect(again[0].secret).toBe(stored[0].data.secret);
  });
});

describe("demo mode import", () => {
  it("imports a made-up quarter into the device-only demo store and never reaches the Sheet", async () => {
    setDemoOn(true);
    await open();
    fireEvent.click(screen.getByTestId("hx-tab-transactions"));
    fireEvent.click(await screen.findByTestId("tx-demo-import"));
    fireEvent.click(await screen.findByTestId("imp-continue"));
    const sum = await screen.findByTestId("imp-summary");
    expect(Number(within(sum).getByTestId("imp-sum-New").textContent)).toBeGreaterThan(90);
    fireEvent.click(screen.getByTestId("imp-save"));
    await screen.findByTestId("imp-done");
    fireEvent.click(screen.getByTestId("imp-finish"));
    expect(Number(screen.getByTestId("tx-review-count").textContent.split(" ")[0])).toBeGreaterThan(5);
    fireEvent.click(screen.getByTestId("hx-tab-overview"));
    fireEvent.click(screen.getByTestId("ov-month-prev"));
    await waitFor(() => expect(screen.getByTestId("ov-coverage").textContent).toMatch(/Actual/));
    expect(screen.getByTestId("ov-saved-how").textContent).toBe("from balances");
    expect(screen.getByTestId("ov-chart-actual")).toBeTruthy();
    await act(settle);
    expect(be.rows("budget_txenc").length).toBe(0);
    expect(allCells().some((c) => /DEMO/.test(c))).toBe(false);
    expect((await txH().list()).length).toBe(0);
    const demo = JSON.parse(window.localStorage.getItem("grimoire:budget:demo"));
    expect(demo.records.filter((r) => r.type === "tx").length).toBeGreaterThan(90);
    // Clear demo data takes the imported demo transactions too
    fireEvent.click(screen.getByTestId("app-settings"));
    fireEvent.click(await screen.findByTestId("hx-clear-demo"));
    expect(JSON.parse(window.localStorage.getItem("grimoire:budget:demo")).records).toEqual([]);
  });
});

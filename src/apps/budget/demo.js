// Demo mode data: entirely made up, round numbers, generic names. Never real values (charter section 5).
// Built relative to today so the Overview always has a year of history to show. Includes a raise and a
// changed budget amount part-way through, so effective dates can be seen working.
import { addMonths, monthOf, round2 } from "./plan.js";
import { toCsv } from "./csv.js";
import { SPEND_HEADERS, HIST_HEADERS } from "./imports.js";

export function demoRecords(now = new Date()) {
  const m0 = monthOf(now);
  const start = addMonths(m0, -11);
  const raise = addMonths(m0, -4);
  const t = now.getTime() - 86400000 * 30;
  let n = 0;
  const rec = (type, data, id) => ({ id: id || `demo-${type}-${++n}`, type, data, createdAt: t + n, updatedAt: t + n, demo: true });
  const out = [];

  // sections
  const secs = [["House/Car", "spend"], ["Saving", "saving"], ["Subscriptions", "spend"], ["Staples", "spend"], ["Spending", "spend"], ["One-time/Annual", "spend"]];
  const sid = {};
  secs.forEach(([name, kind], i) => { const r = rec("section", { name, kind, order: i }, `demo-sec-${i}`); sid[name] = r.id; out.push(r); });

  // accounts
  const accts = [["Demo Checking", "checking"], ["Demo Savings", "savings"], ["Demo Card", "card"], ["Demo Brokerage", "brokerage"], ["Demo Robo IRA", "ira"], ["Demo HSA", "hsa"], ["Demo Home", "home"], ["Demo Mortgage", "mortgage"]];
  const aid = {};
  accts.forEach(([name, kind], i) => { const r = rec("account", { name, kind, order: i, archived: false }, `demo-acct-${i}`); aid[kind] = r.id; out.push(r); });

  // income: a raise four months ago
  const incLines = [{ name: "Federal tax", kind: "tax", perCheck: 280 }, { name: "Social Security", kind: "tax", perCheck: 170 }, { name: "Medicare", kind: "tax", perCheck: 40 }, { name: "Medical", kind: "benefit", perCheck: 45 }, { name: "Dental", kind: "benefit", perCheck: 8 }];
  out.push(rec("income", { effective: start, grossYear: 72000, checksPerYear: 26, lines: incLines }, "demo-income-1"));
  out.push(rec("income", { effective: raise, grossYear: 78000, checksPerYear: 26, lines: incLines.map((l) => (l.name === "Federal tax" ? { ...l, perCheck: 320 } : l.name === "Social Security" ? { ...l, perCheck: 184 } : l.name === "Medicare" ? { ...l, perCheck: 43 } : l)) }, "demo-income-2"));

  // plan lines
  const lines = [
    ["House/Car", "Mortgage (P&I + escrow)", 1800, "monthly", { pullDate: "1st", account: aid.savings, provider: "Demo Lender" }],
    ["House/Car", "Electric", 140, "monthly", { pullDate: "12th", account: aid.card }],
    ["House/Car", "Internet", 65, "monthly", { pullDate: "20th", account: aid.card }],
    ["House/Car", "Car insurance", 90, "monthly", { pullDate: "5th", account: aid.card }],
    ["Saving", "Robo IRA transfer", 150, "monthly", { pullDate: "15th", account: aid.checking }],
    ["Subscriptions", "Music streaming", 12, "monthly", { pullDate: "3rd", account: aid.card }],
    ["Subscriptions", "Video streaming", 18, "monthly", { pullDate: "9th", account: aid.card }],
    ["Subscriptions", "Gym", 40, "monthly", { pullDate: "1st–3rd", account: aid.savings }],
    ["Staples", "Groceries", 400, "monthly", { account: aid.card, notes: "Two stores" }],
    ["Staples", "Fast food", 150, "monthly", { account: aid.card, notes: "Delivery counts here" }],
    ["Staples", "Car fuel", 120, "monthly", { account: aid.card }],
    ["Spending", "Going out", 300, "monthly", { account: aid.card, notes: "Restaurants, bars, rides, events" }],
    ["Spending", "Personal", 350, "monthly", { account: aid.card }],
    ["Spending", "Air travel", 1200, "irregular", { account: aid.card, notes: "Judged on year-to-date pace" }],
    ["One-time/Annual", "Annual shopping membership", 139, "annual", { month: 10, account: aid.card }],
    ["One-time/Annual", "Car registration", 75, "annual", { month: 3, account: aid.card }],
    ["One-time/Annual", "Music festival", 350, "onetime", { date: `${addMonths(m0, 2)}-03`, account: aid.card }],
  ];
  const order = {};
  lines.forEach(([sec, name, amount, cadence, extra], i) => {
    order[sec] = (order[sec] || 0) + 1;
    out.push(rec("linev", { lineId: `demo-line-${i}`, effective: start, name, sectionId: sid[sec], amount, cadence, month: 0, date: "", account: "", pullDate: "", provider: "", notes: "", order: order[sec], ended: false, ...extra }));
  });
  // groceries went up at the raise (shows an effective-dated change)
  const g = out.find((r) => r.type === "linev" && r.data.name === "Groceries");
  out.push(rec("linev", { ...g.data, effective: raise, amount: 450 }));

  // a year of monthly balances: savings and investments climb, card bounces around. Checking, savings and
  // the card are left out for the last four months: the demo import fills those from its made-up files.
  for (let i = 0; i < 12; i++) {
    const m = addMonths(start, i);
    const imported = i >= 8;
    const vals = demoBalanceValues(i);
    for (const [kind, amount] of Object.entries(vals)) {
      if (imported && (kind === "checking" || kind === "savings" || kind === "card")) continue;
      out.push(rec("bal", { accountId: aid[kind], month: m, amount: round2(amount) }));
    }
  }
  out.push(...demoRulesAndMaps(t));
  return out;
}

const wobble = (i, k) => Math.round(Math.sin(i * 1.7 + k) * 100);
function demoBalanceValues(i) {
  return {
    checking: 2500 + wobble(i, 1) * 3, savings: 9000 + i * 450 + wobble(i, 2) * 4, card: i === 7 ? 300 : 1200 + wobble(i, 3) * 4, // month 7 is just after a card payment, like the imported months
    brokerage: 5000 + i * 120 + wobble(i, 4) * 2, ira: 12000 + i * 260 + wobble(i, 5) * 3, hsa: 1500 + i * 60,
    home: 400000, mortgage: 300000 - i * 400,
  };
}

// Demo sorting rules and account mappings (fixed ids, so they can be added to an older demo store).
const L = (i) => `demo-line-${i}`;
export function demoRulesAndMaps(t = Date.now()) {
  const rules = [
    ["DEMO LENDER", { type: "line", line: L(0) }], ["DEMO POWER", { type: "line", line: L(1) }], ["DEMO NET\\b", { type: "line", line: L(2) }],
    ["DEMO INSURANCE", { type: "line", line: L(3) }], ["ROBO IRA", { type: "line", line: L(4) }], ["DEMO MUSIC", { type: "line", line: L(5) }],
    ["DEMO VIDEO", { type: "line", line: L(6) }], ["DEMO GYM", { type: "line", line: L(7) }], ["DEMO GROCER", { type: "line", line: L(8) }],
    ["FAKE BURGER|DEMO DELIVERY", { type: "line", line: L(9) }], ["DEMO FUEL", { type: "line", line: L(10) }], ["DEMO BISTRO|DEMO TAVERN", { type: "line", line: L(11) }],
    ["RIDESHARE.*AIRPORT", { type: "line", line: L(13) }], ["RIDESHARE", { type: "ask", choices: [L(11), L(13)] }], ["DEMO AIRLINE", { type: "line", line: L(13) }],
    ["WAREHOUSE CLUB", { type: "line", line: L(14) }, { months: [10], amountMin: 139, amountMax: 139, note: "the yearly membership; other purchases there go to review" }],
    ["CARD PAYMENT|TRANSFER (TO|FROM) (SAVINGS|CHECKING)", { type: "transfer" }], ["INTEREST PAID", { type: "income" }],
  ];
  const out = rules.map(([pattern, action, extra], i) => ({ id: `demo-rule-${i}`, type: "rule", data: { order: (i + 1) * 10, pattern, action, ...(extra || {}) }, createdAt: t, updatedAt: t, demo: true }));
  const maps = [["Demo Card", "demo-acct-2"], ["Demo Savings", "demo-acct-1"], ["Demo Checking", "demo-acct-0"], ["…1111", "demo-acct-0"], ["…2222", "demo-acct-1"]];
  maps.forEach(([key, accountId], i) => out.push({ id: `demo-map-${i}`, type: "acctmap", data: { key, accountId }, createdAt: t, updatedAt: t, demo: true }));
  return out;
}

// ---------- made-up bank files for a demo import (spec: "generated fake CSVs in both bank formats") ----------
// The three full months before this one: a spending export (card, checking and savings), a checking history
// and a savings history. Includes everything the import has to handle: pending rows, a refund, a wrong bank
// category, a ride that asks, an airport ride, a warehouse-club purchase to split, card payments, a paycheck,
// transfers, rows that are in both files (skipped from the history), and a few only in the history.
export function demoFiles(now = new Date()) {
  const m0 = monthOf(now);
  const months = [addMonths(m0, -3), addMonths(m0, -2), addMonths(m0, -1)];
  let seed = 7;
  const rnd = (lo, hi) => { seed = (seed * 9301 + 49297) % 233280; return round2(lo + (seed / 233280) * (hi - lo)); };
  const md = (m, d) => `${Number(m.slice(5, 7))}/${d}/${m.slice(0, 4)}`;
  const spend = [], chk = [], sav = [];
  const S = (m, d, desc, orig, amount, acct, cat, extra = {}) => spend.push({ Date: md(m, d), Description: desc, "Original Description": orig, Amount: amount.toFixed(2), Type: "Debit", "Parent Category": "", Category: cat, Account: acct, Tags: "", Memo: "", Pending: "FALSE", ...extra, _d: d, _m: m });
  months.forEach((m, k) => {
    let card = 0;
    const C = (d, desc, orig, amount, cat) => { S(m, d, desc, orig, amount, "Demo Card", cat); card += amount; };
    S(m, 1, "Demo Lender", "DEMO LENDER MORTGAGE PMT", 1800, "Demo Savings", "Mortgage");
    S(m, 2, "Demo Gym", "DEMO GYM MEMBERSHIP", 40, "Demo Savings", "Fitness");
    S(m, 1, "Demo Coffee Cart", "DEMO COFFEE CART", 4.5, "Demo Checking", "Coffee Shops");
    C(3, "Demo Music", "DEMO MUSIC *SUBSCRIPTION", 12, "Entertainment");
    C(5, "Demo Insurance", "DEMO INSURANCE AUTO POLICY", 90, "Insurance");
    C(9, "Demo Video", "DEMO VIDEO STREAMING", 18, "Entertainment");
    C(12, "Demo Power Co", "DEMO POWER CO UTILITY", rnd(110, 160), "Utilities");
    C(20, "Demo Net", "DEMO NET INTERNET SVC", 65, "Utilities");
    [2, 9, 16, 28].forEach((d) => C(d, "Demo Grocer", `DEMO GROCER #12, ANYTOWN, ST ${d}`, rnd(70, 120), "Groceries"));
    [4, 11, 17, 23, 27].forEach((d) => C(d, d % 2 ? "Fake Burger" : "Demo Delivery", d % 2 ? "FAKE BURGER 0042, ANYTOWN" : "DEMO DELIVERY *ORDER", rnd(9, 22), "Restaurants"));
    [6, 14, 24].forEach((d) => C(d, "Demo Fuel", "DEMO FUEL STATION 7", rnd(32, 48), "Gas"));
    C(8, "Demo Bistro", "DEMO BISTRO, ANYTOWN, ST", rnd(35, 60), "Restaurants");
    C(19, "Demo Tavern", "DEMO TAVERN", rnd(25, 40), "Bars");
    C(13, "Sample Rideshare", "SAMPLE RIDESHARE *TRIP", rnd(12, 24), "Travel");
    if (k === 1) { C(21, "Sample Rideshare", "SAMPLE RIDESHARE *TRIP AIRPORT", 42.5, "Travel"); C(22, "Demo Airline", "DEMO AIRLINE TICKET", 320, "Travel"); }
    C(15, "Demo Warehouse Club", "DEMO WAREHOUSE CLUB #3", rnd(110, 150), "Shopping");
    if (k === 0) C(18, "Demo Shoe Shop", "DEMO SHOE SHOP, ANYTOWN", 85, "Groceries"); // the bank's category is wrong on purpose
    if (k === 1) { S(m, 7, "Demo Shoe Shop", "DEMO SHOE SHOP, ANYTOWN", 40, "Demo Card", "Groceries", { Type: "Credit" }); card -= 40; }
    // card payment (the export shows it as money in on the card)
    S(m, 25, "Demo Card Payment", "DEMO CARD PAYMENT THANK YOU", round2(card * 0.9), "Demo Card", "Credit Card Payment", { Type: "Credit" });
    // checking history
    const H = (list, d, desc, debit, credit, cls) => list.push({ _m: m, _d: d, desc, debit, credit, cls });
    H(chk, 1, "DEMO COFFEE CART", 4.5, 0, "Other"); // also in the spending export: skipped
    H(chk, 8, "DEMO EMPLOYER PAYROLL", 0, 2400, "Paycheck");
    H(chk, 22, "DEMO EMPLOYER PAYROLL", 0, 2400, "Paycheck");
    H(chk, 10, "TRANSFER TO SAVINGS", 2600, 0, "Transfer");
    H(chk, 15, "DEMO ROBO IRA TRANSFER", 150, 0, "Transfer");
    H(chk, 25, "DEMO CARD PAYMENT", round2(card * 0.9), 0, "Transfer");
    H(chk, 18, "ATM WITHDRAWAL", 60, 0, "Other"); // only in the account history: goes to review
    // savings history
    H(sav, 1, "DEMO LENDER MORTGAGE PMT", 1800, 0, "Other"); // also in the spending export: skipped
    H(sav, 2, "DEMO GYM MEMBERSHIP", 40, 0, "Other"); // likewise
    H(sav, 10, "TRANSFER FROM CHECKING", 0, 2600, "Transfer");
    H(sav, 28, "INTEREST PAID", 0, 3.25 + k, "Other");
  });
  // two pending charges on the last day: skipped by the import
  const last = months[2];
  const ld = new Date(Number(last.slice(0, 4)), Number(last.slice(5, 7)), 0).getDate();
  S(last, ld, "Demo Grocer", "DEMO GROCER #12, ANYTOWN, ST", 23.1, "Demo Card", "Groceries", { Pending: "TRUE" });
  S(last, ld, "Fake Burger", "FAKE BURGER 0042, ANYTOWN", 11.4, "Demo Card", "Restaurants", { Pending: "TRUE" });

  const sortNewest = (list) => list.sort((a, b) => (a._m === b._m ? b._d - a._d : a._m < b._m ? 1 : -1));
  const history = (list, number, start) => {
    // running balance oldest -> newest, then listed newest first like the bank does
    const asc = [...list].sort((a, b) => (a._m === b._m ? a._d - b._d : a._m < b._m ? -1 : 1));
    let bal = start;
    for (const r of asc) { bal = round2(bal - r.debit + r.credit); r.bal = bal; }
    return sortNewest(asc).map((r) => ({ "Account Number": number, "Post Date": md(r._m, r._d), Check: "", Description: r.desc, Debit: r.debit ? r.debit.toFixed(2) : "", Credit: r.credit ? r.credit.toFixed(2) : "", Status: "Posted", Balance: r.bal.toFixed(2), Classification: r.cls }));
  };
  return [
    { name: "demo-spending-export.csv", text: toCsv(SPEND_HEADERS, sortNewest(spend)) },
    { name: "demo-checking-history.csv", text: toCsv(HIST_HEADERS, history(chk, "000000001111", round2(demoBalanceValues(7).checking))) },
    { name: "demo-savings-history.csv", text: toCsv(HIST_HEADERS, history(sav, "000000002222", round2(demoBalanceValues(7).savings))) },
  ];
}

// Demo mode data: entirely made up, round numbers, generic names. Never real values (charter section 5).
// Built relative to today so the Overview always has a year of history to show. Includes a raise and a
// changed budget amount part-way through, so effective dates can be seen working.
import { addMonths, monthOf, round2 } from "./plan.js";

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

  // a year of monthly balances: savings and investments climb, card bounces around
  const wobble = (i, k) => Math.round(Math.sin(i * 1.7 + k) * 100);
  for (let i = 0; i < 12; i++) {
    const m = addMonths(start, i);
    const vals = {
      checking: 2500 + wobble(i, 1) * 3, savings: 9000 + i * 450 + wobble(i, 2) * 4, card: 1200 + wobble(i, 3) * 4,
      brokerage: 5000 + i * 120 + wobble(i, 4) * 2, ira: 12000 + i * 260 + wobble(i, 5) * 3, hsa: 1500 + i * 60,
      home: 400000, mortgage: 300000 - i * 400,
    };
    for (const [kind, amount] of Object.entries(vals)) out.push(rec("bal", { accountId: aid[kind], month: m, amount: round2(amount) }));
  }
  return out;
}

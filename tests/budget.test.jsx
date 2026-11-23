// The Hoard, round B1: plan maths (effective dates, cadence, income, totals), balances, the calendar feed,
// the seed file, the screens, demo mode, and the security checks (the Sheet only ever sees ciphertext).
// FAKE DATA ONLY: every name and number here is made up (charter section 5).
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor, act, configure } from "@testing-library/react";
import App from "../src/shell/App.jsx";
import { sync, db, data, vault, collectionsFor } from "../src/core/index.js";
import { setSyncStatus } from "../src/core/syncStatus.js";
import { createBackend } from "./sim/sheetsSim.js";
import {
  versionAt, planForMonth, incomeFigures, lineMonthAmount, lineMonthlyEquivalent, lineYearAmount, lineYtdPlan,
  balanceAt, balanceTotals, calendarFeed, addMonths, monthOf, pullDay, planSeries,
} from "../src/apps/budget/plan.js";
import { fmt, parseMoney, fmtShort } from "../src/apps/budget/money.js";
import { parseSeed, importSeed } from "../src/apps/budget/seed.js";
import { demoRecords } from "../src/apps/budget/demo.js";
import { resetStoreCache, setDemoOn } from "../src/apps/budget/store.js";

configure({ asyncUtilTimeout: 4000 }); // the first open also starts the Vault and the record store
const KEY = "K".repeat(48);
const URL_ = "https://script.google.com/macros/s/TESTID/exec";
const PASS = "fake passphrase for tests only";
let n = 0;
const R = (type, data, extra = {}) => ({ id: `r${++n}xxxxxxxx`, type, data, updatedAt: n, ...extra });
const L = (lineId, effective, fields, extra) => R("linev", { lineId, effective, name: lineId, sectionId: "s1", amount: 0, cadence: "monthly", ...fields }, extra);

// ---------------- pure logic ----------------
describe("effective dates", () => {
  it("the version in force is the latest one not after the month; ties go to the newest edit", () => {
    const vs = [L("a", "2026-01", { amount: 10 }, { updatedAt: 1 }), L("a", "2026-05", { amount: 20 }, { updatedAt: 2 }), L("a", "2026-05", { amount: 25 }, { updatedAt: 3 })];
    expect(versionAt(vs, "2025-12")).toBeNull();
    expect(versionAt(vs, "2026-01").data.amount).toBe(10);
    expect(versionAt(vs, "2026-04").data.amount).toBe(10);
    expect(versionAt(vs, "2026-05").data.amount).toBe(25);
    expect(versionAt(vs, "2027-09").data.amount).toBe(25);
  });
  it("a raise never rewrites past months, and an ended line drops out from its month", () => {
    const recs = [
      R("section", { name: "Bills", kind: "spend", order: 0 }, { id: "s1xxxxxxxx" }),
      R("income", { effective: "2026-01", grossYear: 52000, checksPerYear: 26, lines: [{ name: "Tax", kind: "tax", perCheck: 300 }] }),
      R("income", { effective: "2026-07", grossYear: 65000, checksPerYear: 26, lines: [{ name: "Tax", kind: "tax", perCheck: 400 }] }),
      { ...L("rent", "2026-01", { amount: 1000 }), data: { ...L("rent", "2026-01", { amount: 1000 }).data, sectionId: "s1xxxxxxxx" } },
      { ...L("gym", "2026-01", { amount: 50 }), data: { ...L("gym", "2026-01", { amount: 50 }).data, sectionId: "s1xxxxxxxx" } },
      { ...L("gym", "2026-04", { amount: 50, ended: true }), data: { ...L("gym", "2026-04", { amount: 50, ended: true }).data, sectionId: "s1xxxxxxxx" } },
    ];
    const mar = planForMonth(recs, "2026-03"), aug = planForMonth(recs, "2026-08");
    // 52000/26 = 2000 per check, minus 300 tax = 1700; 1700*26/12 = 3683.33
    expect(mar.income.takeHomeCheck).toBe(1700);
    expect(mar.income.takeHomeMonth).toBe(3683.33);
    // 65000/26 = 2500 - 400 = 2100; *26/12 = 4550
    expect(aug.income.takeHomeMonth).toBe(4550);
    expect(mar.totals.spendThisMonth).toBe(1050);
    expect(aug.totals.spendThisMonth).toBe(1000);
    expect(aug.sections[0].lines.map((l) => l.name)).toEqual(["rent"]);
  });
});

describe("cadence", () => {
  const monthly = { cadence: "monthly", amount: 15 };
  const annual = { cadence: "annual", amount: 120, month: 10 };
  const irregular = { cadence: "irregular", amount: 900 };
  const once = { cadence: "onetime", amount: 400, date: "2026-10-04" };
  it("what hits a given month", () => {
    expect(lineMonthAmount(monthly, "2026-02")).toBe(15);
    expect(lineMonthAmount(annual, "2026-10")).toBe(120);
    expect(lineMonthAmount(annual, "2026-09")).toBe(0);
    expect(lineMonthAmount(irregular, "2026-02")).toBe(75);
    expect(lineMonthAmount(once, "2026-10")).toBe(400);
    expect(lineMonthAmount(once, "2027-10")).toBe(0);
  });
  it("average month and whole year", () => {
    expect(lineMonthlyEquivalent(annual, "2026-01")).toBe(10);
    expect(lineMonthlyEquivalent(once, "2026-01")).toBe(33.33);
    expect(lineMonthlyEquivalent(once, "2027-01")).toBe(0);
    expect(lineYearAmount(monthly, "2026-01")).toBe(180);
    expect(lineYearAmount(irregular, "2026-01")).toBe(900);
  });
  it("irregular lines are judged on year-to-date pace", () => {
    expect(lineYtdPlan(irregular, "2026-04")).toBe(300);
    expect(lineYtdPlan(irregular, "2026-12")).toBe(900);
    expect(lineYtdPlan(annual, "2026-09")).toBe(0);
    expect(lineYtdPlan(annual, "2026-10")).toBe(120);
  });
  it("totals: saving sections are never spending; In − Out counts planned saving as out", () => {
    const recs = [
      R("section", { name: "Bills", kind: "spend", order: 0 }, { id: "sAxxxxxxxx" }),
      R("section", { name: "Put away", kind: "saving", order: 1 }, { id: "sBxxxxxxxx" }),
      R("income", { effective: "2026-01", grossYear: 48000, checksPerYear: 12, lines: [] }),
      R("linev", { lineId: "x1", effective: "2026-01", name: "Rent", sectionId: "sAxxxxxxxx", amount: 1500, cadence: "monthly" }),
      R("linev", { lineId: "x2", effective: "2026-01", name: "Fees", sectionId: "sAxxxxxxxx", amount: 240, cadence: "annual", month: 3 }),
      R("linev", { lineId: "x3", effective: "2026-01", name: "IRA", sectionId: "sBxxxxxxxx", amount: 500, cadence: "monthly" }),
    ];
    const p = planForMonth(recs, "2026-03");
    expect(p.totals).toMatchObject({ in: 4000, spendThisMonth: 1740, spendPerMonth: 1520, savingThisMonth: 500, leftThisMonth: 1760, leftPerMonth: 1980, savedThisMonth: 2260 });
    expect(planSeries(recs, "2026-03", 3).map((r) => r.spent)).toEqual([1500, 1500, 1740]);
  });
});

describe("income", () => {
  it("per check, per month, per year, taxes apart from benefits", () => {
    const f = incomeFigures({ grossYear: 78000, checksPerYear: 26, lines: [{ name: "Fed", kind: "tax", perCheck: 320 }, { name: "Med", kind: "benefit", perCheck: 45 }] });
    expect(f).toMatchObject({ grossCheck: 3000, grossMonth: 6500, taxesCheck: 320, benefitsCheck: 45, takeHomeCheck: 2635, takeHomeYear: 68510, takeHomeMonth: 5709.17 });
  });
});

describe("balances", () => {
  const recs = [
    R("account", { name: "Chk", kind: "checking" }, { id: "a1xxxxxxxx" }),
    R("account", { name: "Card", kind: "card" }, { id: "a2xxxxxxxx" }),
    R("account", { name: "Robo", kind: "ira" }, { id: "a3xxxxxxxx" }),
    R("bal", { accountId: "a1xxxxxxxx", month: "2026-01", amount: 1000 }),
    R("bal", { accountId: "a1xxxxxxxx", month: "2026-03", amount: 1500 }),
    R("bal", { accountId: "a2xxxxxxxx", month: "2026-02", amount: 300 }),
    R("bal", { accountId: "a3xxxxxxxx", month: "2026-02", amount: 5000 }),
  ];
  it("a month without an entry carries the last one forward, never backward", () => {
    expect(balanceAt(recs, "a1xxxxxxxx", "2025-12")).toBeNull();
    expect(balanceAt(recs, "a1xxxxxxxx", "2026-02")).toMatchObject({ amount: 1000, month: "2026-01", carried: true });
    expect(balanceAt(recs, "a1xxxxxxxx", "2026-03")).toMatchObject({ amount: 1500, month: "2026-03", carried: false });
  });
  it("owed amounts are subtracted; cash, investments and net worth", () => {
    expect(balanceTotals(recs, "2026-01")).toMatchObject({ cash: 1000, invest: 0, netWorth: 1000 });
    expect(balanceTotals(recs, "2026-03")).toMatchObject({ cash: 1200, invest: 5000, netWorth: 6200 });
  });
});

describe("calendar feed (standard format)", () => {
  it("monthly pull dates, yearly and one-time charges, clamped to the month's last day", () => {
    const recs = [
      R("linev", { lineId: "m", effective: "2026-01", name: "Phone", sectionId: "s", amount: 30, cadence: "monthly", pullDate: "2nd–5th" }),
      R("linev", { lineId: "q", effective: "2026-01", name: "Late", sectionId: "s", amount: 9, cadence: "monthly", pullDate: "31" }),
      R("linev", { lineId: "y", effective: "2026-01", name: "Dues", sectionId: "s", amount: 99, cadence: "annual", month: 2 }),
      R("linev", { lineId: "o", effective: "2026-01", name: "Show", sectionId: "s", amount: 80, cadence: "onetime", date: "2026-02-14" }),
      R("linev", { lineId: "n", effective: "2026-01", name: "No date", sectionId: "s", amount: 5, cadence: "monthly" }),
    ];
    const f = calendarFeed(recs, "2026-02", "2026-02");
    expect(f.map((x) => `${x.date} ${x.title}`)).toEqual(["2026-02-01 Dues", "2026-02-02 Phone", "2026-02-14 Show", "2026-02-28 Late"]);
    expect(f[0]).toMatchObject({ app: "budget", target: "#/app/budget?line=y" });
    expect(pullDay("around the 15th")).toBe(15); expect(pullDay("")).toBe(0); expect(pullDay("45")).toBe(0);
  });
});

describe("money", () => {
  it("formats and reads amounts", () => {
    expect(fmt(1234)).toBe("$1,234"); expect(fmt(1234.5)).toBe("$1,234.50"); expect(fmt(-12)).toBe("−$12"); expect(fmt(null)).toBe("–");
    expect(parseMoney("$1,234.56")).toBe(1234.56); expect(parseMoney(" 12 ")).toBe(12); expect(parseMoney(".5")).toBe(0.5);
    for (const bad of ["", "abc", "1.2.3", "12a"]) expect(parseMoney(bad)).toBeNull();
    expect(fmtShort(1500)).toBe("$1.5k"); expect(fmtShort(35000)).toBe("$35k"); expect(fmtShort(2400000)).toBe("$2.4M");
  });
});

const seedText = (records) => JSON.stringify({ format: "thehoard-seed", v: 1, records });
const SEED = [
  { id: "seed-sec-aa", type: "section", data: { name: "Bills", kind: "spend", order: 0 } },
  { id: "seed-acct-aa", type: "account", data: { name: "Fake Checking", kind: "checking", order: 0 } },
  { id: "seed-inc-aa", type: "income", data: { effective: "2026-01", grossYear: 50000, checksPerYear: 26, lines: [{ name: "Tax", kind: "tax", perCheck: 200 }] } },
  { id: "seed-line-aa", type: "linev", data: { lineId: "seedlineaa", effective: "2026-01", name: "Fake rent", sectionId: "seed-sec-aa", amount: 1200, cadence: "monthly", account: "seed-acct-aa", pullDate: "1st" } },
  { id: "seed-rule-aa", type: "rule", data: { match: "FAKE STORE", line: "seedlineaa" } },
];

describe("seed file", () => {
  it("reads a good file and counts what is in it", () => {
    expect(parseSeed(seedText(SEED)).counts).toEqual({ section: 1, account: 1, income: 1, linev: 1, rule: 1 });
  });
  it("refuses anything wrong, naming the record, and imports nothing", () => {
    expect(() => parseSeed("not json")).toThrow(/could not be read/);
    expect(() => parseSeed(JSON.stringify({ format: "grimoire-export", v: 1, records: [] }))).toThrow(/not a seed file/);
    expect(() => parseSeed(seedText([{ ...SEED[0], id: "x" }]))).toThrow(/Record 1 has a bad id/);
    expect(() => parseSeed(seedText([SEED[0], SEED[0]]))).toThrow(/repeats the id/);
    expect(() => parseSeed(seedText([{ ...SEED[3], data: { ...SEED[3].data, cadence: "weekly" } }]))).toThrow(/Record 1 \(linev\)/);
    expect(() => parseSeed(seedText([{ ...SEED[3], data: { ...SEED[3].data, cadence: "annual" } }]))).toThrow(/missing/);
    expect(() => parseSeed(seedText([{ id: "seed-zz-aa", type: "mystery", data: {} }]))).toThrow(/unknown type/);
  });
  it("importing twice adds nothing the second time and never overwrites", async () => {
    const store = new Map();
    const put = async (id, type, d) => store.set(id, { type, d });
    const p = parseSeed(seedText(SEED));
    expect(await importSeed(p, [], put)).toEqual({ added: 5, skipped: 0 });
    store.set("seed-line-aa", { type: "linev", d: { edited: true } });
    expect(await importSeed(p, [...store.keys()], put)).toEqual({ added: 0, skipped: 5 });
    expect(store.get("seed-line-aa").d.edited).toBe(true);
  });
});

describe("demo data", () => {
  it("has a full year of balances, a raise and a changed line, and only made-up names", () => {
    const d = demoRecords(new Date(2026, 10, 23));
    const m = "2026-11";
    expect(d.every((r) => r.demo && String(r.id).startsWith("demo-"))).toBe(true);
    const p1 = planForMonth(d, addMonths(m, -6)), p2 = planForMonth(d, m);
    expect(p2.income.takeHomeMonth).toBeGreaterThan(p1.income.takeHomeMonth);
    const gro = (p) => p.sections.flatMap((s) => s.lines).find((l) => l.name === "Groceries").amount;
    expect([gro(p1), gro(p2)]).toEqual([400, 450]);
    expect(balanceTotals(d, m).any).toBe(true);
    expect(d.filter((r) => r.type === "account").every((r) => r.data.name.startsWith("Demo "))).toBe(true);
  });
});

// ---------------- the app ----------------
let be;
const settle = async () => { await sync.syncNow("open"); await sync.syncNow("open"); };
const setWidth = (w) => Object.defineProperty(window, "innerWidth", { value: w, configurable: true });
const open = async () => { window.location.hash = "#/app/budget"; render(<App />); return screen.findByTestId("hx-app", {}, { timeout: 4000 }); };
const handle = () => collectionsFor("budget").find((c) => c.name === "data");
const allCells = () => [...be.sheets.keys()].flatMap((name) => be.rows(name).flatMap((r) => Object.values(r).map(String)));

async function wipeBudget() {
  await db.open();
  const mine = (await db.all()).filter((r) => r.app === "budget");
  await db.deleteMany(mine.map((r) => r.pk));
  for (const k of await db.metaKeys("cursor:budget")) await db.delMeta(k);
  await data.hydrate();
}

beforeAll(async () => {
  await db.open();
  await vault.init();
  if (!vault.setupDone) await vault.setup(PASS); // one real (slow) key derivation for the whole file
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

describe("The Hoard screens", () => {
  it("is in the Vault: the tile has a lock and it is called The Hoard", async () => {
    render(<App />);
    const tile = await screen.findByTestId("tile-budget");
    expect(tile.textContent).toMatch(/The Hoard/);
    expect(tile.querySelector("svg[aria-label='In the Vault']")).toBeTruthy();
  });
  it("opens on Overview with seven sections; an empty Plan offers the six standard sections", async () => {
    await open();
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["Overview", "Plan", "Transactions", "Balances", "Mortgage", "Retirement", "Goals"]);
    expect(screen.getByTestId("hx-overview")).toBeTruthy();
    expect(screen.getByTestId("ov-coverage").textContent).toMatch(/no data/);
    fireEvent.click(screen.getByTestId("hx-tab-plan"));
    fireEvent.click(await screen.findByTestId("plan-add-standard"));
    for (const s of ["House/Car", "Saving", "Subscriptions", "Staples", "Spending", "One-time/Annual"]) expect(await screen.findByTestId(`section-${s}`)).toBeTruthy();
    fireEvent.click(screen.getByTestId("hx-tab-goals"));
    expect(screen.getByTestId("hx-later-goals").textContent).toMatch(/B3/);
  });

  it("income, a line, and a change from next month that leaves this month alone", async () => {
    await open();
    fireEvent.click(screen.getByTestId("hx-tab-plan"));
    fireEvent.click(await screen.findByTestId("plan-add-standard"));
    await screen.findByTestId("line-add-One-time/Annual");
    // income: 52,000 a year, 26 checks, 300 tax per check -> 1,700 per check, 3,683.33 per month
    fireEvent.click(screen.getByTestId("income-edit"));
    fireEvent.change(screen.getByTestId("ie-gross"), { target: { value: "52,000" } });
    fireEvent.change(screen.getByTestId("ie-checks"), { target: { value: "26" } });
    fireEvent.click(screen.getByTestId("ie-add-line"));
    fireEvent.change(screen.getByTestId("ie-line-name-0"), { target: { value: "Fake tax" } });
    fireEvent.change(screen.getByTestId("ie-line-amt-0"), { target: { value: "300" } });
    expect(screen.getByTestId("ie-preview").textContent).toMatch(/\$1,700 per check, \$3,683\.33 per month/);
    fireEvent.click(screen.getByTestId("ie-save"));
    expect((await screen.findByTestId("income-takehome-month")).textContent).toMatch(/\$3,683\.33/);
    // a line in Staples
    fireEvent.click(screen.getByTestId("line-add-Staples"));
    fireEvent.change(screen.getByTestId("le-name"), { target: { value: "Fake groceries" } });
    fireEvent.change(screen.getByTestId("le-amount"), { target: { value: "400" } });
    fireEvent.change(screen.getByTestId("le-pull"), { target: { value: "weekly" } });
    fireEvent.click(screen.getByTestId("le-save"));
    expect((await screen.findByTestId("line-amount-Fake groceries")).textContent).toBe("$400");
    expect(screen.getByTestId("plan-spend-month").textContent).toBe("$400");
    // change it to 450 from NEXT month
    const next = addMonths(monthOf(), 1);
    fireEvent.click(screen.getByTestId("line-Fake groceries"));
    fireEvent.change(screen.getByTestId("le-amount"), { target: { value: "450" } });
    fireEvent.change(screen.getByTestId("le-effective-m"), { target: { value: next.slice(5) } });
    fireEvent.change(screen.getByTestId("le-effective-y"), { target: { value: next.slice(0, 4) } });
    fireEvent.click(screen.getByTestId("le-save"));
    await waitFor(() => expect(screen.queryByTestId("line-editor")).toBeNull());
    expect(screen.getByTestId("line-amount-Fake groceries").textContent).toBe("$400"); // this month unchanged
    fireEvent.click(screen.getByTestId("plan-month-next"));
    expect((await screen.findByTestId("line-amount-Fake groceries")).textContent).toBe("$450");
    // the line's history lists both versions
    fireEvent.click(screen.getByTestId("line-Fake groceries"));
    expect(screen.getByTestId("le-history").textContent).toMatch(/\$400 monthly.*\$450 monthly/);
    // stop it from next month: gone next month, still there this month
    fireEvent.change(screen.getByTestId("le-effective-m"), { target: { value: next.slice(5) } });
    fireEvent.change(screen.getByTestId("le-effective-y"), { target: { value: next.slice(0, 4) } });
    fireEvent.click(screen.getByTestId("le-stop"));
    await waitFor(() => expect(screen.queryByTestId("line-Fake groceries")).toBeNull());
    fireEvent.click(screen.getByTestId("plan-month-prev"));
    expect(await screen.findByTestId("line-Fake groceries")).toBeTruthy();
  });

  it("yearly, irregular and one-time lines; Overview shows the year-to-date pace", async () => {
    await open();
    fireEvent.click(screen.getByTestId("hx-tab-plan"));
    fireEvent.click(await screen.findByTestId("plan-add-standard"));
    fireEvent.click(await screen.findByTestId("line-add-Spending"));
    fireEvent.change(screen.getByTestId("le-name"), { target: { value: "Fake flights" } });
    fireEvent.click(screen.getByTestId("le-cadence-irregular"));
    fireEvent.change(screen.getByTestId("le-amount"), { target: { value: "1200" } });
    fireEvent.click(screen.getByTestId("le-save"));
    expect((await screen.findByTestId("line-amount-Fake flights")).textContent).toBe("$1,200/yr");
    fireEvent.click(screen.getByTestId("line-add-One-time/Annual"));
    fireEvent.change(screen.getByTestId("le-name"), { target: { value: "Fake show" } });
    fireEvent.click(screen.getByTestId("le-cadence-onetime"));
    fireEvent.change(screen.getByTestId("le-amount"), { target: { value: "300" } });
    fireEvent.click(screen.getByTestId("le-save"));
    expect(screen.getByTestId("le-error").textContent).toMatch(/date/);
    fireEvent.change(screen.getByTestId("le-date"), { target: { value: `${monthOf()}-15` } });
    fireEvent.click(screen.getByTestId("le-save"));
    await screen.findByTestId("line-amount-Fake show");
    fireEvent.click(screen.getByTestId("hx-tab-overview"));
    expect(screen.getByTestId("ov-spent").textContent).toBe("$400"); // 100 (a twelfth of 1200) + 300
    fireEvent.click(screen.getByTestId("ov-sec-Spending"));
    const m = Number(monthOf().slice(5));
    expect(screen.getByTestId("ov-ytd-Fake flights").textContent).toBe(`Year to date: ${fmt(100 * m)} planned of $1,200 a year`);
  });

  it("balances: update a month, carry forward, net worth with an owed card", async () => {
    await open();
    fireEvent.click(screen.getByTestId("hx-tab-balances"));
    for (const [name, kind] of [["Fake chk", "checking"], ["Fake card", "card"]]) {
      fireEvent.click(await screen.findByTestId("acct-add"));
      fireEvent.change(screen.getByTestId("ae-name"), { target: { value: name } });
      fireEvent.change(screen.getByTestId("ae-kind"), { target: { value: kind } });
      fireEvent.click(screen.getByTestId("ae-save"));
      await screen.findByTestId(`acct-${name}`);
    }
    fireEvent.click(screen.getByTestId("bal-update"));
    fireEvent.change(screen.getByTestId("be-Fake chk"), { target: { value: "2000" } });
    fireEvent.change(screen.getByTestId("be-Fake card"), { target: { value: "x" } });
    fireEvent.click(screen.getByTestId("be-save"));
    expect(screen.getByTestId("be-error").textContent).toMatch(/Fake card/);
    fireEvent.change(screen.getByTestId("be-Fake card"), { target: { value: "500" } });
    fireEvent.click(screen.getByTestId("be-save"));
    await waitFor(() => expect(screen.getByTestId("bal-net").textContent).toBe("$1,500"));
    expect(screen.getByTestId("acct-amt-Fake card").textContent).toBe("−$500");
    fireEvent.click(screen.getByTestId("bal-month-next"));
    expect((await screen.findByTestId("acct-Fake chk")).textContent).toMatch(/from /); // carried forward
    expect(screen.getByTestId("bal-cash").textContent).toBe("$1,500");
    expect(screen.getByTestId("bal-chart-net")).toBeTruthy();
  });

  it("a tap on a chart shows that month's numbers in words (never color alone)", async () => {
    setDemoOn(true);
    await open();
    const chart = await screen.findByTestId("ov-chart-plan");
    const svg = chart.querySelector("svg");
    svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 360, height: 190, right: 360, bottom: 190 });
    fireEvent.click(svg, { clientX: 340, clientY: 100 });
    expect(screen.getByTestId("ov-chart-plan-readout").textContent).toMatch(/In \$[\d,]+.*Spent \$[\d,]+.*Saved \$[\d,]+/);
  });
});

describe("demo mode", () => {
  it("shows the demo plan, never reaches the Sheet, and Clear demo data leaves real data alone", async () => {
    await handle().put("realline-0001", { Type: "section", Data: { name: "Real section", kind: "spend", order: 0 } });
    await open();
    fireEvent.click(screen.getByTestId("app-settings"));
    fireEvent.click(await screen.findByTestId("hx-set-demo"));
    fireEvent.click(screen.getByTestId("back"));
    expect(await screen.findByTestId("hx-demo-banner")).toBeTruthy();
    fireEvent.click(screen.getByTestId("hx-tab-plan"));
    expect(await screen.findByTestId("section-House/Car")).toBeTruthy();
    expect(screen.queryByTestId("section-Real section")).toBeNull();
    // an edit in demo mode
    fireEvent.click(screen.getByTestId("line-add-Staples"));
    fireEvent.change(screen.getByTestId("le-name"), { target: { value: "Demo extra" } });
    fireEvent.change(screen.getByTestId("le-amount"), { target: { value: "5" } });
    fireEvent.click(screen.getByTestId("le-save"));
    await screen.findByTestId("line-Demo extra");
    await act(settle);
    expect(be.rows("budget_dataenc").length).toBe(1); // only the real section
    expect(allCells().some((c) => c.includes("Demo"))).toBe(false);
    // clear demo data
    fireEvent.click(screen.getByTestId("app-settings"));
    fireEvent.click(await screen.findByTestId("hx-clear-demo"));
    expect(screen.getByTestId("hx-demo-cleared")).toBeTruthy();
    fireEvent.click(screen.getByTestId("back"));
    expect(await screen.findByTestId("section-Real section")).toBeTruthy();
    expect(JSON.parse(window.localStorage.getItem("grimoire:budget:demo")).records).toEqual([]);
    expect((await handle().list()).length).toBe(1);
  });
});

describe("seed import in the app", () => {
  it("imports real records (even in demo mode), a second import adds nothing", async () => {
    await open();
    fireEvent.click(screen.getByTestId("app-settings"));
    fireEvent.click(await screen.findByTestId("hx-set-demo"));
    fireEvent.change(screen.getByTestId("hx-seed-text"), { target: { value: seedText(SEED) } });
    fireEvent.click(screen.getByTestId("hx-seed-check"));
    expect(screen.getByTestId("hx-seed-preview").textContent).toMatch(/1 plan line versions/);
    fireEvent.click(screen.getByTestId("hx-seed-import"));
    expect((await screen.findByTestId("hx-seed-done")).textContent).toMatch(/Imported 5 records.*Turn demo mode off/);
    expect((await handle().list()).length).toBe(5);
    fireEvent.click(screen.getByTestId("hx-seed-check"));
    fireEvent.click(screen.getByTestId("hx-seed-import"));
    expect((await screen.findByTestId("hx-seed-done")).textContent).toMatch(/Imported 0 records \(5 were already here/);
    fireEvent.click(screen.getByTestId("hx-set-demo")); // demo off
    fireEvent.click(screen.getByTestId("back"));
    fireEvent.click(screen.getByTestId("hx-tab-plan"));
    expect((await screen.findByTestId("line-amount-Fake rent")).textContent).toBe("$1,200");
    expect(screen.getByTestId("line-Fake rent").textContent).toMatch(/pulls 1st · Fake Checking/);
  });
  it("a bad file is refused with a plain reason and nothing is written", async () => {
    await open();
    fireEvent.click(screen.getByTestId("app-settings"));
    fireEvent.change(await screen.findByTestId("hx-seed-text"), { target: { value: seedText([SEED[0], { ...SEED[1], id: "bad" }]) } });
    fireEvent.click(screen.getByTestId("hx-seed-check"));
    expect(screen.getByTestId("hx-seed-error").textContent).toMatch(/Record 2 has a bad id/);
    expect(screen.queryByTestId("hx-seed-import")).toBeNull();
    expect((await handle().list()).length).toBe(0);
  });
});

describe("security checklist (automated part)", () => {
  it("the Sheet holds only the envelope and scrambled Payload: no names, no amounts, no record types", async () => {
    await open();
    fireEvent.click(screen.getByTestId("app-settings"));
    fireEvent.change(await screen.findByTestId("hx-seed-text"), { target: { value: seedText([...SEED, { id: "seed-bal-aa", type: "bal", data: { accountId: "seed-acct-aa", month: "2026-01", amount: 98765.43 } }]) } });
    fireEvent.click(screen.getByTestId("hx-seed-check"));
    fireEvent.click(screen.getByTestId("hx-seed-import"));
    await screen.findByTestId("hx-seed-done");
    await act(settle);
    expect(be.rows("budget_dataenc").length).toBe(6);
    expect(be.headers("budget_dataenc")).toEqual(["Id", "CreatedAt", "UpdatedAt", "SyncedAt", "Deleted", "SchemaVersion", "Payload"]);
    expect(be.sheets.has("budget_data")).toBe(false); // no readable tab is ever created
    const cells = allCells();
    for (const secret of ["Fake rent", "Fake Checking", "FAKE STORE", "1200", "98765", "50000", "linev", "income", "section"]) {
      expect(cells.some((c) => c.includes(secret)), secret).toBe(false);
    }
  });
  it("locked: The Hoard does not open and its records cannot be read", async () => {
    await handle().put("realrec-0001", { Type: "section", Data: { name: "Locked test", kind: "spend", order: 0 } });
    await vault.lock();
    window.location.hash = "#/app/budget";
    render(<App />);
    expect(await screen.findByTestId("vault-gate-unlock")).toBeTruthy();
    expect(screen.queryByTestId("hx-app")).toBeNull();
    await expect(handle().list()).rejects.toThrow(/locked/);
  });
  it("tablet and computer: leaving The Hoard locks the Vault again", async () => {
    setWidth(1280);
    await open();
    expect(vault.unlocked).toBe(true);
    fireEvent.click(screen.getByTestId("back"));
    await waitFor(() => expect(vault.unlocked).toBe(false));
  });
  it("another device with the same Vault sees the same plan (records really round-trip)", async () => {
    await handle().put("realsec-0001", { Type: "section", Data: { name: "Round trip", kind: "saving", order: 0 } });
    await sync.syncNow("all");
    const row = be.rows("budget_dataenc")[0];
    expect(row.Payload.length).toBeGreaterThan(20);
    expect(row.Payload).not.toMatch(/Round trip/);
    // wipe this device's copy and pull it back from the Sheet
    await wipeBudget();
    expect((await handle().list()).length).toBe(0);
    await sync.syncNow("all");
    const back = await handle().list();
    expect(back.map((r) => r.Data.name)).toEqual(["Round trip"]);
  });
});

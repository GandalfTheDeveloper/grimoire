// Verifies the PRODUCTION build, not the source (charter: "build succeeded" is not a test).
//   1. runs the real production build and checks what it produced (stamped service worker, manifest, icons)
//   2. bundles the same production code as a single script, loads it in jsdom with an in-memory IndexedDB
//      and the simulated Sheets backend, and drives the app through its screens
// Run with:  npm run verify
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { build } from "vite";
import react from "@vitejs/plugin-react";
import { JSDOM } from "jsdom";
import { IDBFactory } from "fake-indexeddb";
import { webcrypto } from "node:crypto";
import { createBackend } from "../tests/sim/sheetsSim.js";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const results = [];
const check = (name, ok, extra = "") => { results.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`); };

// ---------- 1. the real production build ----------
execSync("npx vite build", { cwd: root, stdio: "pipe" });
const dist = path.join(root, "dist");
const sw = fs.readFileSync(path.join(dist, "sw.js"), "utf8");
check("production build produced index.html, manifest and icons", ["index.html", "manifest.webmanifest", "icon-192.png", "icon-512.png", "icon-maskable-512.png"].every((f) => fs.existsSync(path.join(dist, f))));
check("service worker is stamped with a build id", !sw.includes("__BUILD_ID__") && /grimoire-\d+\.\d+\.\d+-\d+/.test(sw));
const html = fs.readFileSync(path.join(dist, "index.html"), "utf8");
check("built page uses relative URLs (works under /grimoire/)", !/(src|href)="\/(?!\/)/.test(html));

// ---------- 2. the same code as one script, run in jsdom ----------
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const out = fs.mkdtempSync(path.join(os.tmpdir(), "gr-iife-"));
await build({
  root, configFile: false, logLevel: "silent", base: "./", plugins: [react()],
  define: { __BUILD__: JSON.stringify(`${pkg.version} · verify UTC`), __BUILD_ID__: JSON.stringify("verify") },
  build: { outDir: out, emptyOutDir: true, cssCodeSplit: false, rollupOptions: { input: path.join(root, "src/main.jsx"), output: { format: "iife", inlineDynamicImports: true, entryFileNames: "app.js", assetFileNames: "app.[ext]" } } },
});
const appJs = fs.readFileSync(path.join(out, "app.js"), "utf8");
const KEY = "K".repeat(48);
const URL_ = "https://script.google.com/macros/s/VERIFY/exec";
const backend = createBackend({ key: KEY });

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: "https://gandalfthedeveloper.github.io/grimoire/", pretendToBeVisual: true, runScripts: "outside-only" });
const w = dom.window;
Object.defineProperty(w, "innerWidth", { value: 390, configurable: true });
w.indexedDB = new IDBFactory();
Object.defineProperty(w, "crypto", { value: webcrypto, configurable: true }); // jsdom has no WebCrypto subtle; real browsers do
w.TextEncoder = TextEncoder; w.TextDecoder = TextDecoder; // likewise missing in jsdom, present in every browser
w.fetch = backend.fetch;
w.navigator.sendBeacon = () => true;
const cssFile = fs.readdirSync(out).find((f) => f.endsWith(".css"));
if (cssFile) { const st = w.document.createElement("style"); st.textContent = fs.readFileSync(path.join(out, cssFile), "utf8"); w.document.head.appendChild(st); }
const errors = [];
w.addEventListener("error", (e) => errors.push(String(e.message)));
w.console.error = (...a) => errors.push(a.map(String).join(" "));
w.eval(appJs);

const q = (id) => w.document.querySelector(`[data-testid="${id}"]`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 4000) { const t = Date.now(); for (;;) { try { const v = fn(); if (v) return v; } catch { /* keep waiting */ } if (Date.now() - t > ms) return null; await sleep(25); } }
const click = (el) => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true, cancelable: true }));
function type(el, value) {
  const setter = Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype, "value").set;
  setter.call(el, value);
  el.dispatchEvent(new w.Event("input", { bubbles: true }));
}
const text = (id) => (q(id) ? q(id).textContent : "");

check("app mounts and shows the home grid with 7 tiles", !!(await until(() => q("home-grid") && w.document.querySelectorAll('[data-testid^="tile-"]').length === 7)));
check("build number is visible", /Build \d+\.\d+\.\d+/.test(text("build-number")), text("build-number"));
check("status dot starts green", !!q("status-dot") && !/amber/.test(q("status-dot").className));

click(q("open-settings"));
await until(() => q("connection"));
type(q("conn-url"), URL_);
type(q("conn-key"), KEY);
click(q("conn-test"));
check("Save and test connects to the backend", !!(await until(() => /Connected. Backend version/.test(text("conn-msg")))), text("conn-msg"));
check("address and key are saved under grimoire:sync:*", !!w.localStorage.getItem("grimoire:sync:config"));

click(q("open-diagnostics"));
await until(() => q("diagnostics"));
click(q("diag-test"));
const passed = await until(() => /Sync test (passed|FAILED)/.test(text("diag-result")), 8000);
check("sync test passes against the (simulated) Sheet from the built bundle", /passed/.test(text("diag-result")), text("diag-result"));
check("the Sheet holds the three fake rows", backend.rows("selftest_items").length === 3);
check("nothing is pending afterwards", /Items pending0/.test(text("diagnostics")));

// offline: edits are kept, the dot turns amber, and catching up turns it green again
backend.offline = true;
click(q("diag-test"));
await until(() => /FAILED/.test(text("diag-result")), 8000);
check("while offline the test reports a plain failure and does not crash", /FAILED/.test(text("diag-result")), text("diag-result"));
check("status dot is amber with the waiting count", !!(await until(() => /amber/.test(q("status-dot").className) && q("status-dot").textContent === "3")));
backend.offline = false;
click(q("diag-sync"));
check("back online, Sync now empties the queue", !!(await until(() => !/amber/.test(q("status-dot").className))));
check("the Sheet has all six test rows", backend.rows("selftest_items").length === 6);

click(q("diag-clear"));
await until(() => /Cleared/.test(text("diag-result")), 8000);
check("Clear test data flags rows as deleted, never erases them", backend.rows("selftest_items").length === 6 && backend.rows("selftest_items").every((r) => r.Deleted === 1));
click(q("diag-resend"));
await until(() => /re-send/.test(text("diag-result")), 8000);
check("Re-send everything leaves the Sheet unchanged in size", backend.rows("selftest_items").length === 6 && /Items pending0/.test(text("diagnostics")));

// ---------- Round 3: Vault, files, backup, usage warnings (through the built app's screens) ----------
const pass = "correct horse battery staple";
w.location.hash = "#/settings";
await until(() => q("vault-card"));
check("Settings shows the Vault as not set up", /Not set up yet/.test(text("vault-card")));
type(q("vault-pass1"), pass); type(q("vault-pass2"), pass); click(q("vault-wrote"));
await sleep(30);
click(q("vault-create"));
check("Create the Vault: key derivation, wrapped key saved to the Sheet", !!(await until(() => /Unlocked/.test(text("vault-card")) && backend.rows("core_vault").length === 1, 20000)), text("vault-card"));
const vrows = backend.rows("core_vault");
check("the Sheet holds exactly one wrapped-key record and no passphrase", vrows.length === 1 && !JSON.stringify(vrows).includes(pass));
check("Settings now shows the Vault unlocked with a Lock now button", /Unlocked/.test(text("vault-card")) && !!q("vault-lock"));

w.location.hash = "#/diagnostics";
await until(() => q("diag-vtest"));
click(q("diag-vtest"));
await until(() => /Vault test (passed|FAILED)/.test(text("diag-result")), 15000);
check("vault test passes from the built bundle against the (simulated) Sheet", /Vault test passed/.test(text("diag-result")), text("diag-result"));
const venc = backend.rows("selftest_vaultedenc");
check("vault test rows in the Sheet are one scrambled Payload column", venc.length === 2 && venc.every((r) => String(r.Payload).startsWith("g1.")) && !JSON.stringify(venc).includes("vault-test"));
click(q("diag-vclear"));
await until(() => /Cleared 2 vault test/.test(text("diag-result")), 8000);
check("clearing vault test data flags the rows deleted, never erases them", backend.rows("selftest_vaultedenc").length === 2 && backend.rows("selftest_vaultedenc").every((r) => r.Deleted === 1));

click(q("diag-ftest"));
await until(() => /File test (passed|FAILED)|Problem/.test(text("diag-result")), 20000);
check("file test passes: plain and encrypted files through (simulated) Drive", /File test passed: plain 2.5 MB in 2 parts; encrypted 1.6 MB in 2 parts/.test(text("diag-result")), text("diag-result"));
check("the file test cleaned up after itself (Drive bin, nothing left live)", [...backend.drive.files.values()].filter((f) => /\.\d+$/.test(f.name) && !f.trashed).length === 0);

click(q("diag-backup"));
await until(() => /Backup made/.test(text("diag-result")), 8000);
check("Back up now makes a dated copy in Grimoire Backups", /Backup made: Grimoire backup \d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(text("diag-result")), text("diag-result"));

backend.drive.used = 90; backend.drive.limit = 100;
click(q("diag-usage"));
check("usage warning banner appears at 85%+ Google storage", !!(await until(() => q("usage-banner") && /90% full/.test(text("usage-banner")))), text("usage-banner"));
click(q("usage-dismiss"));
check("banner can be dismissed", !!(await until(() => !q("usage-banner"))));

w.location.hash = "#/settings";
await until(() => q("vault-lock"));
click(q("vault-lock"));
check("Lock now locks the Vault", !!(await until(() => /Locked/.test(text("vault-card")) && q("vault-unlock"))));
w.location.hash = "#/diagnostics";
await until(() => q("diag-vtest"));
click(q("diag-vtest"));
await until(() => /Unlock the Vault first/.test(text("diag-result")));
check("while locked, the vault test says to unlock first and writes nothing", /Unlock the Vault first/.test(text("diag-result")) && backend.rows("selftest_vaultedenc").length === 2);

w.location.hash = "#/app/journal";
check("a Vault app shows the unlock screen while locked (phone relocked by hand)", !!(await until(() => q("vault-gate-unlock"))) && !q("placeholder-journal"));
type(q("vault-pass"), "definitely the wrong one"); click(q("vault-unlock-btn"));
check("a wrong passphrase is refused plainly", !!(await until(() => /didn't work/.test(text("vault-msg")), 8000)));
type(q("vault-pass"), pass); click(q("vault-unlock-btn"));
check("the right passphrase opens the app", !!(await until(() => q("placeholder-journal"), 8000)));

// ---------- The Hoard, round B1 (app 0.12.0, backend 0.8.0): fake data only ----------
w.location.hash = "#/app/budget";
check("The Hoard opens (Vault unlocked) on Overview with its seven sections", !!(await until(() => q("hx-overview") && w.document.querySelectorAll('[role="tab"]').length === 7, 8000)));
click(q("hx-tab-plan"));
await until(() => q("plan-add-standard"));
click(q("plan-add-standard"));
check("an empty plan gets the six standard sections", !!(await until(() => q("line-add-Staples") && q("section-One-time/Annual"))));
click(q("line-add-Staples"));
await until(() => q("le-name"));
type(q("le-name"), "Verify fake groceries"); type(q("le-amount"), "321");
click(q("le-save"));
check("a plan line is saved and shown in white (typed)", !!(await until(() => text("line-amount-Verify fake groceries") === "$321" && /hx-typed/.test(q("line-amount-Verify fake groceries").className))));
check("it reaches the (simulated) Sheet only as budget_dataenc rows: envelope + scrambled Payload, no readable tab", !!(await until(() => backend.rows("budget_dataenc").length === 7, 8000))
  && !backend.sheets.has("budget_data") && JSON.stringify(backend.headers("budget_dataenc")) === JSON.stringify(["Id", "CreatedAt", "UpdatedAt", "SyncedAt", "Deleted", "SchemaVersion", "Payload"])
  && !JSON.stringify(backend.rows("budget_dataenc")).includes("Verify fake") && !JSON.stringify(backend.rows("budget_dataenc")).includes("321"), String(backend.rows("budget_dataenc").length));
click(q("app-settings"));
await until(() => q("hx-set-demo"));
click(q("hx-set-demo"));
click(q("back"));
click(q("hx-tab-balances"));
check("demo mode shows a year of made-up balances", !!(await until(() => q("hx-demo-banner") && q("bal-chart-net") && q("bal-chart-cash") && /\$/.test(text("bal-net")))));
await sleep(300);
check("demo mode wrote nothing to the Sheet", backend.rows("budget_dataenc").length === 7);
click(q("app-settings"));
await until(() => q("hx-clear-demo"));
click(q("hx-clear-demo"));
click(q("back"));
click(q("hx-tab-plan"));
check("Clear demo data brings the real plan back", !!(await until(() => q("line-Verify fake groceries") && !q("hx-demo-banner"))));

// ---------- The Hoard, round B2 (app 0.13.0): imports, fake files only ----------
function pick(el, value) {
  const setter = Object.getOwnPropertyDescriptor(w.HTMLSelectElement.prototype, "value").set;
  setter.call(el, value);
  el.dispatchEvent(new w.Event("change", { bubbles: true }));
}
function chooseFiles(el, files) {
  Object.defineProperty(el, "files", { value: files.map(([name, body]) => new w.File([body], name, { type: "text/csv" })), configurable: true });
  el.dispatchEvent(new w.Event("change", { bubbles: true }));
}
const vSpend = "Date,Description,Original Description,Amount,Type,Parent Category,Category,Account,Tags,Memo,Pending\r\n"
  + '10/2/2026,Verify Grocer,"VERIFY GROCER, TESTTOWN",12.34,Debit,,Groceries,Verify Card,,,FALSE\r\n'
  + '10/30/2026,Verify Grocer,"VERIFY GROCER, TESTTOWN",5.00,Credit,,Groceries,Verify Card,,,FALSE\r\n'
  + '10/31/2026,Verify Grocer,"VERIFY GROCER, TESTTOWN",1.00,Debit,,Groceries,Verify Card,,,TRUE\r\n';
const vHist = "Account Number,Post Date,Check,Description,Debit,Credit,Status,Balance,Classification\r\n"
  + "000011112222,10/9/2026,,VERIFY PAYROLL,,999.00,Posted,1999.00,Paycheck\r\n";
click(q("hx-tab-transactions"));
check("Transactions opens with No imports yet", !!(await until(() => q("tx-import") && text("tx-last-import") === "No imports yet")));
click(q("tx-import"));
await until(() => q("imp-files"));
chooseFiles(q("imp-files"), [["verify-spend.csv", vSpend], ["verify-hist.csv", vHist]]);
check("both bank formats are read and their new account names are asked about once", !!(await until(() => q("imp-acct-Verify Card") && q("imp-acct-…2222"))));
pick(q("imp-acct-Verify Card"), "new:card");
pick(q("imp-acct-…2222"), "new:checking");
click(q("imp-acct-save"));
await until(() => q("imp-continue"));
click(q("imp-continue"));
check("the summary counts new rows, the pending row and the refund", !!(await until(() => text("imp-sum-New") === "3" && text("imp-sum-Pending (skipped)") === "1" && text("imp-sum-Refunds") === "1", 8000)), text("imp-summary"));
click(q("imp-save"));
check("saving the import fills a month-end balance from the history file", !!(await until(() => /Imported 3 new transactions.*1 month-end balance/.test(text("imp-done")), 8000)), text("imp-done"));
click(q("imp-finish"));
check("the review list shows the rows no rule sorted", !!(await until(() => text("tx-review-count") === "2 to review")));
check("transactions reach the Sheet only as budget_txenc rows with scrambled Payload and ids that reveal nothing", !!(await until(() => backend.rows("budget_txenc").length === 3, 8000))
  && !backend.sheets.has("budget_tx") && backend.rows("budget_txenc").every((r) => /^t[A-Za-z0-9_-]{24}$/.test(r.Id))
  && !/VERIFY|12\.34|999|2222|Verify Card/.test(JSON.stringify(backend.rows("budget_txenc")) + JSON.stringify(backend.rows("budget_dataenc"))), String(backend.rows("budget_txenc").length));
click(q("tx-import"));
await until(() => q("imp-files"));
chooseFiles(q("imp-files"), [["verify-spend.csv", vSpend], ["verify-hist.csv", vHist]]);
await until(() => q("imp-continue"));
click(q("imp-continue"));
check("importing the same files again finds nothing new", !!(await until(() => text("imp-sum-New") === "0" && text("imp-sum-Already here (skipped)") === "3", 8000)));
click(q("imp-close"));

w.location.hash = "#/settings";
await until(() => q("vault-toggle-cookbook"));
click(q("vault-toggle-cookbook"));
await until(() => q("vault-start-cookbook"));
click(q("vault-start-cookbook"));
await until(() => q("vault-done-cookbook") || q("vault-error-cookbook"), 15000);
check("guided migration of an app runs (backup, check, switch) from the Settings screen", !!q("vault-done-cookbook"), text("vault-error-cookbook") || text("vault-done-cookbook"));
check("the app now shows as Encrypted", /Encrypted/.test(text("vault-state-cookbook")));
check("a backup was taken before the migration (two backups now)", [...backend.drive.files.values()].filter((f) => f.name.startsWith("Grimoire backup ")).length === 2);

// ---------- Re-key (lost-device plan) ----------
w.location.hash = "#/settings";
await until(() => q("vault-open-rekey"));
const oldKeyId = backend.rows("core_vault")[0].KeyId;
const oldPayloads = backend.rows("selftest_vaultedenc").map((r) => r.Payload);
check("there is encrypted data to re-key (the vault test rows)", oldPayloads.length > 0);
click(q("vault-open-rekey"));
await until(() => q("rekey-pass"));
check("Re-key stays disabled until a passphrase is typed and the box is ticked", q("rekey-go").disabled);
type(q("rekey-pass"), "definitely the wrong one"); click(q("rekey-ack"));
await until(() => !q("rekey-go").disabled);
click(q("rekey-go"));
check("a wrong passphrase is refused and nothing changes in the Sheet", !!(await until(() => /not the current one/.test(text("rekey-error")), 15000)) && backend.rows("core_vault")[0].KeyId === oldKeyId);
type(q("rekey-pass"), pass);
await until(() => !q("rekey-go").disabled);
click(q("rekey-go"));
await until(() => q("rekey-done") || /still|cannot|could not|missing/i.test(text("rekey-error")), 40000);
check("re-key runs, re-encrypts and reads everything back from the Sheet", !!q("rekey-done"), text("rekey-error") || text("rekey-done"));
check("the Sheet now holds a different key record", backend.rows("core_vault")[0].KeyId !== oldKeyId);
check("every encrypted record in the Sheet changed (none left on the old key)", backend.rows("selftest_vaultedenc").every((r) => !oldPayloads.includes(r.Payload)));
check("a backup was taken before re-keying (three backups now)", [...backend.drive.files.values()].filter((f) => f.name.startsWith("Grimoire backup ")).length === 3);
check("this device is still unlocked afterwards", /Unlocked/.test(text("vault-card")));
w.location.hash = "#/app/journal";
check("a Vault app still opens after the re-key", !!(await until(() => q("placeholder-journal"), 8000)));

// ---------- Start over (lost passphrase) ----------
w.location.hash = "#/settings";
await until(() => q("vault-lock"));
click(q("vault-lock"));
await until(() => q("vault-startover"));
click(q("vault-startover"));
check("Start over is offered on the unlock screen, and is disabled until RESET is typed", !!(await until(() => q("vault-reset-go"))) && q("vault-reset-go").disabled);
type(q("vault-reset-word"), "reset"); await sleep(30);
check("lower-case 'reset' does not enable it", q("vault-reset-go").disabled);
type(q("vault-reset-word"), "RESET");
await until(() => !q("vault-reset-go").disabled);
click(q("vault-reset-go"));
check("after RESET the Vault card goes back to setup", !!(await until(() => /Not set up yet/.test(text("vault-card")) && q("vault-setup"), 20000)));
check("the key record is flagged deleted in the Sheet, never erased", backend.rows("core_vault").length === 1 && backend.rows("core_vault")[0].Deleted === 1);

const keys = Object.keys(w.localStorage);
// ---------- Phase 2: Fitness runs from the production bundle (catches declaration-order crashes that "build succeeded" hides) ----------
w.location.hash = "#/app/fitness";
check("Fitness opens from the built bundle and shows the phone entry screen", !!(await until(() => q("fitness-root") && w.document.querySelector('input[placeholder="body weight"]'), 8000)));
check("Super Shrexy leaves Grimoire's top bar in charge (one title, no second header)", /Super Shrexy/.test(text("topbar")) && !/Super Shrexy Tracker/.test(text("frame-fitness")));
click(q("back"));
check("closing Fitness returns Home and unmounts it", !!(await until(() => q("home-grid") && !q("fitness-root"))));

// ---------- Golden Ratio (app 0.10.0, backend 0.6.0) ----------
check("Golden Ratio tile shows the spiral icon", !!(q("tile-goldenratio") && q("tile-goldenratio").querySelector("img")));
click(q("tile-goldenratio"));
check("Golden Ratio opens on the default screen with the graphic and three mm fields", !!(await until(() => q("gx") && q("gx").dataset.mode === "default" && q("gx-graphic") && ["a", "b", "whole"].every((f) => q(`gx-unit-${f}`).value === "mm"), 8000)));
click(q("gx-fval-a"));
check("tapping a field opens Golden Ratio's own number pad", !!(await until(() => q("gx-keypad") && q("gx").dataset.mode === "typing")));
for (const k of ["1", "0"]) click(q(`gx-key-${k}`));
check("a = 10 gives b = 6.1803 and a+b = 16.1803 (gold)", !!(await until(() => text("gx-fnum-b") === "6.1803" && text("gx-fnum-whole") === "16.1803" && /gx-calc/.test(q("gx-fnum-b").className))), `${text("gx-fnum-b")} / ${text("gx-fnum-whole")}`);
click(q("gx-done"));
check("Done saves one history card", !!(await until(() => w.document.querySelectorAll('[data-testid="gx-card"]').length === 1)));
check("the calculation reaches the (simulated) Sheet as goldenratio_history, typed value kept as text", !!(await until(() => backend.rows("goldenratio_history").length === 1 && backend.rows("goldenratio_history")[0].Typed === "10", 8000)), String(backend.rows("goldenratio_history").length));
// ---------- Golden Ratio round 2 (app 0.11.0, backend 0.7.0) ----------
click(q("gx-fval-b"));
await until(() => q("gx-keypad") && q("gx-key-5"));
for (const k of ["5", "0"]) click(q(`gx-key-${k}`));
await until(() => q("gx-fnum-b") && text("gx-fnum-b") === "50");
click(q("gx-clear"));
check("Clear empties every field and keeps the pad open", !!(await until(() => !q("gx-fnum-a") && !q("gx-fnum-b") && !q("gx-fnum-whole") && q("gx-keypad"))));
check("Clear saved the calculation first (b = 50 reaches the Sheet)", !!(await until(() => backend.rows("goldenratio_history").some((r) => r.Typed === "50" && r.Known === "b"), 8000)), String(backend.rows("goldenratio_history").length));
for (const k of ["8"]) click(q(`gx-key-${k}`));
click(q("gx-graphic"));
check("tapping the graphic clears the fields and closes the pad", !!(await until(() => !q("gx-fnum-b") && !q("gx-keypad") && q("gx").dataset.mode === "default")));
const hist = q("gx-hist");
hist.dispatchEvent(new w.WheelEvent("wheel", { deltaY: -30, bubbles: true }));
check("scrolling up opens the history screen", !!(await until(() => q("gx").dataset.mode === "history")));
await sleep(350);
hist.dispatchEvent(new w.WheelEvent("wheel", { deltaY: 30, bubbles: true }));
check("scrolling back down past the newest card returns to the fields", !!(await until(() => q("gx").dataset.mode === "default" && q("gx-fields"))));
await until(() => q("app-settings"));
click(q("app-settings"));
check("the gear opens Golden Ratio's settings", !!(await until(() => q("gx-settings") && /Golden Ratio settings/.test(text("topbar")))));
click(q("gx-set-copyunit"));
await sleep(50);
click(q("gx-set-demo"));
check("the settings reach the (simulated) Sheet as one goldenratio_settings row", !!(await until(() => backend.rows("goldenratio_settings").length === 1 && backend.rows("goldenratio_settings")[0].CopyUnit === "drop" && backend.rows("goldenratio_settings")[0].HideDemo === "TRUE", 8000)));
click(q("back"));
check("back closes the settings and stays in Golden Ratio", !!(await until(() => !q("gx-settings") && q("gx"))));
click(q("back"));
check("closing Golden Ratio returns Home and unmounts it", !!(await until(() => q("home-grid") && !q("gx"))));

check("every on-device storage key is prefixed grimoire:", keys.length > 0 && keys.every((k) => k.startsWith("grimoire:")), keys.join(", "));
check("no page errors were logged", errors.length === 0, errors.slice(0, 3).join(" | "));

w.close();
fs.rmSync(out, { recursive: true, force: true });
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);

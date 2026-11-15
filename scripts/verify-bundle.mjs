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

w.location.hash = "#/settings";
await until(() => q("vault-toggle-cookbook"));
click(q("vault-toggle-cookbook"));
await until(() => q("vault-start-cookbook"));
click(q("vault-start-cookbook"));
await until(() => q("vault-done-cookbook") || q("vault-error-cookbook"), 15000);
check("guided migration of an app runs (backup, check, switch) from the Settings screen", !!q("vault-done-cookbook"), text("vault-error-cookbook") || text("vault-done-cookbook"));
check("the app now shows as Encrypted", /Encrypted/.test(text("vault-state-cookbook")));
check("a backup was taken before the migration (two backups now)", [...backend.drive.files.values()].filter((f) => f.name.startsWith("Grimoire backup ")).length === 2);

const keys = Object.keys(w.localStorage);
check("every on-device storage key is prefixed grimoire:", keys.length > 0 && keys.every((k) => k.startsWith("grimoire:")), keys.join(", "));
check("no page errors were logged", errors.length === 0, errors.slice(0, 3).join(" | "));

w.close();
fs.rmSync(out, { recursive: true, force: true });
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);

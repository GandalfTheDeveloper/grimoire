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
const keys = Object.keys(w.localStorage);
check("every on-device storage key is prefixed grimoire:", keys.length > 0 && keys.every((k) => k.startsWith("grimoire:")), keys.join(", "));
check("no page errors were logged", errors.length === 0, errors.slice(0, 3).join(" | "));

w.close();
fs.rmSync(out, { recursive: true, force: true });
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);

// A simulated Google Sheets + Apps Script environment, used to run the real .gs files in Node.
// It deliberately mimics what Sheets does to values: in a cell that is not plain text,
//   "2026-11-15" becomes a Date, "8:45" / "32:15" become times anchored in 1899, "007" becomes 7,
//   "=1+1" becomes a formula result. Plain-text ("@") cells keep strings as they are.
// Options: ignoreTextFormat makes "@" cells convert anyway (to prove the self-test notices).
import vm from "node:vm";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../apps-script");
export const GS_FILES = ["Grim_Router.gs", "Grim_Core.gs", "Grim_App_selftest.gs"];

const EPOCH_1899 = Date.UTC(1899, 11, 30);

function convert(v, format, opts) {
  if (typeof v !== "string") return v;
  if (format === "@" && !opts.ignoreTextFormat) return v;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return new Date(Date.parse(v + "T00:00:00Z"));
  const t = /^(\d{1,3}):(\d{2})$/.exec(v);
  if (t) return new Date(EPOCH_1899 + (Number(t[1]) * 60 + Number(t[2])) * 60000);
  if (/^[=]/.test(v)) return 2; // any formula "calculates"
  if (/^[+-]?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(v)) return Number(v);
  if (v === "TRUE" || v === "FALSE") return v === "TRUE";
  return v;
}

class Sheet {
  constructor(name, stats, opts) {
    this.name = name; this.stats = stats; this.opts = opts;
    this.cells = new Map(); this.formats = new Map();
    this.maxRows = 1000; this.maxCols = 26; this.frozen = 0;
  }
  key(r, c) { return `${r},${c}`; }
  getMaxRows() { return this.maxRows; }
  getMaxColumns() { return this.maxCols; }
  insertRowsAfter(_after, n) { this.maxRows += n; }
  insertColumnsAfter(_after, n) { this.maxCols += n; }
  setFrozenRows(n) { this.frozen = n; }
  getLastRow() { let m = 0; for (const k of this.cells.keys()) { const [r] = k.split(",").map(Number); if (this.cells.get(k) !== "") m = Math.max(m, r); } return m; }
  getLastColumn() { let m = 0; for (const k of this.cells.keys()) { const [, c] = k.split(",").map(Number); if (this.cells.get(k) !== "") m = Math.max(m, c); } return m; }
  getRange(r, c, nr = 1, nc = 1) {
    const sh = this;
    if (r < 1 || c < 1 || r + nr - 1 > sh.maxRows || c + nc - 1 > sh.maxCols) throw new Error(`Range out of bounds: ${r},${c},${nr},${nc}`);
    return {
      getValues() { const out = []; for (let i = 0; i < nr; i++) { const row = []; for (let j = 0; j < nc; j++) { const v = sh.cells.get(sh.key(r + i, c + j)); row.push(v === undefined ? "" : v); } out.push(row); } return out; },
      setValues(vals) {
        sh.stats.setValuesCalls += 1;
        sh.stats.rowsWritten += vals.length;
        if (vals.length !== nr || vals.some((x) => x.length !== nc)) throw new Error("Dimension mismatch");
        for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) sh.cells.set(sh.key(r + i, c + j), convert(vals[i][j], sh.formats.get(sh.key(r + i, c + j)) || "General", sh.opts));
      },
      setValue(v) { sh.cells.set(sh.key(r, c), convert(v, sh.formats.get(sh.key(r, c)) || "General", sh.opts)); },
      setNumberFormat(f) { for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) sh.formats.set(sh.key(r + i, c + j), f); },
      setNumberFormats(fs2) { for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) sh.formats.set(sh.key(r + i, c + j), fs2[i][j]); },
    };
  }
}

export function createBackend({ key = "K".repeat(48), opts = {}, tz = "UTC" } = {}) {
  const stats = { setValuesCalls: 0, rowsWritten: 0, requests: 0 };
  const sheets = new Map();
  const props = { GRIMOIRE_KEY: key };
  const lock = { held: false };
  const ss = {
    getSheetByName: (n) => sheets.get(n) || null,
    insertSheet(n) { const s = new Sheet(n, stats, opts); sheets.set(n, s); return s; },
    getSpreadsheetTimeZone: () => tz,
  };
  const out = (txt) => ({ _t: txt, setMimeType() { return this; }, getContent() { return this._t; } });
  const sandbox = {
    console: { log() {}, error() {} },
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, openById: () => ss, flush() {} },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (k in props ? props[k] : null) }) },
    LockService: { getScriptLock: () => ({ tryLock() { if (lock.held) return false; lock.held = true; return true; }, releaseLock() { lock.held = false; } }) },
    ContentService: { createTextOutput: out, MimeType: { JSON: "json" } },
    Utilities: {
      formatDate(d, _tz, fmt) {
        const p = (n, w = 2) => String(n).padStart(w, "0");
        if (fmt !== "yyyy-MM-dd HH:mm:ss") throw new Error("sim supports one format");
        return `${p(d.getUTCFullYear(), 4)}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
      },
    },
  };
  const ctx = vm.createContext(sandbox);
  for (const f of GS_FILES) vm.runInContext(fs.readFileSync(path.join(dir, f), "utf8"), ctx, { filename: f });
  const run = (code) => vm.runInContext(code, ctx);

  function post(body) {
    stats.requests += 1;
    const res = run("doPost")({ postData: { contents: typeof body === "string" ? body : JSON.stringify(body) } });
    return JSON.parse(res.getContent());
  }
  // fetch-compatible function for the client. backend.offline = true simulates no network.
  const backend = {
    ss, sheets, stats, props, lock, ctx, run, post, offline: false, latency: null, beforeRespond: null,
    fetch: async (url, init) => {
      if (backend.offline) throw new TypeError("Failed to fetch");
      if (backend.latency) await backend.latency();
      const body = JSON.parse(init.body);
      const result = post(body);
      if (backend.beforeRespond) await backend.beforeRespond(body, result);
      return { json: async () => result };
    },
    tab: (name) => sheets.get(name),
    rows(name) {
      const sh = sheets.get(name);
      if (!sh) return [];
      const hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
      const last = sh.getLastRow();
      if (last < 2) return [];
      return sh.getRange(2, 1, last - 1, hdr.length).getValues().map((r) => Object.fromEntries(hdr.map((h, i) => [h, r[i]])));
    },
    headers(name) { const sh = sheets.get(name); return sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0]; },
  };
  return backend;
}

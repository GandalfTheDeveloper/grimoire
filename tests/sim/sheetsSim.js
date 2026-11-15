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
export const GS_FILES = ["Grim_Router.gs", "Grim_Core.gs", "Grim_Files.gs", "Grim_Backup.gs", "Grim_App_core.gs", "Grim_App_selftest.gs", "Grim_App_fitness.gs"];

const EPOCH_1899 = Date.UTC(1899, 11, 30);

function convert(v, format, opts) {
  if (typeof v !== "string") return v;
  // Observed on the real Sheet, even in plain-text cells: a leading = is evaluated as a formula,
  // and a leading apostrophe is swallowed (it is Sheets' "treat as text" marker).
  if (v.startsWith("=")) return 2;
  if (v.startsWith("'")) return v.slice(1);
  if (format === "@" && !opts.ignoreTextFormat) return v;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return new Date(Date.parse(v + "T00:00:00Z"));
  const t = /^(\d{1,3}):(\d{2})$/.exec(v);
  if (t) return new Date(EPOCH_1899 + (Number(t[1]) * 60 + Number(t[2])) * 60000);
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
  deleteRow(r) {
    this.stats.rowsDeleted = (this.stats.rowsDeleted || 0) + 1;
    const next = new Map(), nf = new Map();
    for (const [k, v] of this.cells) { const [rr, cc] = k.split(",").map(Number); if (rr === r) continue; next.set(this.key(rr > r ? rr - 1 : rr, cc), v); }
    for (const [k, v] of this.formats) { const [rr, cc] = k.split(",").map(Number); if (rr === r) continue; nf.set(this.key(rr > r ? rr - 1 : rr, cc), v); }
    this.cells = next; this.formats = nf;
  }
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

// ---- a small simulated Google Drive: folders, files (as bytes), the bin, creation order, storage numbers ----
function createDrive() {
  let n = 0;
  const drive = { files: new Map(), folders: new Map(), clock: 1000, used: 1000, limit: 15 * 1024 ** 3 };
  const iter = (arr) => { let i = 0; return { hasNext: () => i < arr.length, next: () => arr[i++] }; };
  class SimFile {
    constructor(name, bytes, mime, parent) { this.id = `file${++n}`; this.name = name; this.bytes = bytes; this.mime = mime; this.parent = parent; this.trashed = false; this.created = ++drive.clock; drive.files.set(this.id, this); }
    getId() { return this.id; } getName() { return this.name; } setTrashed(v) { this.trashed = !!v; return this; } isTrashed() { return this.trashed; }
    getDateCreated() { return new Date(this.created); }
    getBlob() { return { getBytes: () => this.bytes.slice() }; }
    makeCopy(name, folder) { const f = new SimFile(name, this.bytes.slice(), this.mime, folder || this.parent); (folder || this.parent).kids.push(f); return f; }
  }
  class SimFolder {
    constructor(name) { this.id = `folder${++n}`; this.name = name; this.trashed = false; this.kids = []; this.subs = []; drive.folders.set(this.id, this); }
    getId() { return this.id; } isTrashed() { return this.trashed; }
    createFile(blob) { const f = new SimFile(blob.name, blob.bytes.slice(), blob.mime, this); this.kids.push(f); return f; }
    createFolder(name) { const f = new SimFolder(name); this.subs.push(f); return f; }
    getFilesByName(nm) { return iter(this.kids.filter((f) => !f.trashed && f.name === nm)); }
    getFoldersByName(nm) { return iter(this.subs.filter((f) => !f.trashed && f.name === nm)); }
    getFiles() { return iter(this.kids.filter((f) => !f.trashed)); }
  }
  const root = new SimFolder("My Drive");
  drive.root = root;
  drive.SimFile = SimFile;
  drive.api = {
    getRootFolder: () => root,
    createFolder: (name) => root.createFolder(name),
    getFolderById(id) { const f = drive.folders.get(id); if (!f) throw new Error("not found"); return f; },
    getFileById(id) { const f = drive.files.get(id); if (!f) throw new Error("not found"); return f; },
    getStorageUsed: () => drive.used,
    getStorageLimit: () => drive.limit,
  };
  return drive;
}

export function createBackend({ key = "K".repeat(48), opts = {}, tz = "UTC" } = {}) {
  const stats = { setValuesCalls: 0, rowsWritten: 0, requests: 0 };
  const sheets = new Map();
  const props = { GRIMOIRE_KEY: key };
  const lock = { held: false };
  const drive = createDrive();
  const sheetFile = new drive.SimFile("Grimoire data", [1, 2, 3], "application/vnd.google-apps.spreadsheet", drive.root);
  const triggers = [];
  const ss = {
    getId: () => sheetFile.id,
    getSheets: () => [...sheets.values()],
    getSheetByName: (n) => sheets.get(n) || null,
    insertSheet(n) { const s = new Sheet(n, stats, opts); sheets.set(n, s); return s; },
    getSpreadsheetTimeZone: () => tz,
  };
  const out = (txt) => ({ _t: txt, setMimeType() { return this; }, getContent() { return this._t; } });
  const sandbox = {
    console: { log() {}, error() {} },
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, openById: () => ss, flush() {} },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = String(v); } }) },
    LockService: { getScriptLock: () => ({ tryLock() { if (lock.held) return false; lock.held = true; return true; }, releaseLock() { lock.held = false; } }) },
    ContentService: { createTextOutput: out, MimeType: { JSON: "json" } },
    DriveApp: drive.api,
    ScriptApp: {
      WeekDay: { SUNDAY: "SUNDAY" },
      getProjectTriggers: () => triggers.map((t) => ({ getHandlerFunction: () => t.fn, _t: t })),
      deleteTrigger(h) { const i = triggers.indexOf(h._t); if (i >= 0) triggers.splice(i, 1); },
      newTrigger(fn) {
        const t = { fn };
        const b = { timeBased: () => b, onWeekDay: (d) => { t.day = d; return b; }, atHour: (h) => { t.hour = h; return b; }, create() { triggers.push(t); return t; } };
        return b;
      },
    },
    Utilities: {
      formatDate(d, _tz, fmt) {
        const p = (n, w = 2) => String(n).padStart(w, "0");
        const date = `${p(d.getUTCFullYear(), 4)}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
        if (fmt === "yyyy-MM-dd HH:mm:ss") return `${date} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
        if (fmt === "yyyy-MM-dd HH:mm") return `${date} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
        throw new Error("sim does not support this date format");
      },
      // Apps Script hands back bytes as an array of signed numbers; the sim does the same.
      base64Decode: (t) => Array.from(Buffer.from(String(t), "base64")).map((b) => (b > 127 ? b - 256 : b)),
      base64Encode: (bytes) => Buffer.from(Array.from(bytes).map((b) => b & 255)).toString("base64"),
      newBlob: (bytes, mime, name) => ({ bytes: Array.from(bytes).map((b) => (b < 0 ? b + 256 : b)), mime, name }),
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
    ss, sheets, stats, props, lock, ctx, run, post, drive, triggers, offline: false, latency: null, beforeRespond: null,
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

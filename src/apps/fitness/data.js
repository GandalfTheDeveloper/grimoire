// Super Shrexy's data layer, on Grimoire's shared records.
//  - Every row has a stable id built from its natural key (a day, or day + exercise + set), so two devices
//    that edit the same thing converge on ONE record and the newest edit wins. Nothing is ever duplicated.
//  - Edits are saved on the device first (core marks them dirty); Grimoire's sync engine sends only what changed
//    and downloads only what is new. This file never talks to the Sheet except for the one-time import of the old tabs.
//  - The screens still speak the old shapes ({ Date, Weight, ... } rows and { action, data } items), so they did not change.
import { collectionsFor, sync } from "../../core/index.js";
import { getItem, setItem } from "../../core/storage.js";
import { FIELDS } from "./schema.js";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const NUM_RE = /^[+-]?\d+(\.\d+)?$/;

// small stable hash (FNV-1a) so an exercise name can sit inside an id
function hash(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, "0");
}
export const ids = {
  daily: (d) => `d-${d.Date}`,
  exercise: (d) => `e-${d.Date}-${hash(String(d.ExerciseName).trim())}-${Number(d.SetNumber)}`,
  run: (d) => `r-${d.Date}`,
  notes: (d) => `n-${d.Date}`,
  plan: (key) => `p-${key}`,
};

const COLL_OF = { logDaily: "daily", logExercise: "exercise", logRun: "run", logNote: "notes" };

function handles() {
  const out = {};
  for (const c of collectionsFor("fitness")) out[c.name] = c;
  for (const n of Object.keys(FIELDS)) if (!out[n]) throw new Error(`fitness collection "${n}" is not registered`);
  return out;
}

const rowOf = (coll, pub) => {
  const row = {};
  for (const k of Object.keys(FIELDS[coll])) row[k] = pub[k] === null || pub[k] === undefined ? "" : pub[k];
  return row;
};

export function validate(action, d) {
  if (!d || typeof d !== "object" || !COLL_OF[action]) return "bad_item";
  if (!DATE_RE.test(String(d.Date || ""))) return "bad_date";
  if (action === "logExercise") {
    if (!String(d.ExerciseName || "").trim()) return "bad_exercise";
    if (!NUM_RE.test(String(d.SetNumber === undefined ? "" : d.SetNumber).trim())) return "bad_set";
  }
  return "";
}

function cleanValues(coll, d) {
  const v = {};
  for (const k of Object.keys(FIELDS[coll])) {
    if (d[k] === undefined) continue; // not mentioned: leave what is already saved
    const val = d[k];
    if (FIELDS[coll][k] === "number") {
      const s = String(val === null ? "" : val).trim();
      v[k] = s === "" ? null : NUM_RE.test(s) ? Number(s) : null;
    } else v[k] = val === null ? "" : typeof val === "boolean" ? (val ? "TRUE" : "FALSE") : String(val);
  }
  return v;
}

// Saves old-style items ({ action, data }) as records. Local first; the sync engine sends them later.
// Returns { ok, fail } like the old queue did.
export async function applyItems(items) {
  const h = handles();
  let ok = 0, fail = 0;
  for (const it of items || []) {
    const bad = validate(it && it.action, it && it.data);
    if (bad) { fail += 1; continue; }
    const coll = COLL_OF[it.action];
    const d = it.data;
    try {
      if (coll === "notes" && String(d.Note === undefined || d.Note === null ? "" : d.Note) === "") {
        // Clearing a note. If this device has no record of it yet (it may exist only in the old Sheet tab, which is
        // imported later), leave a deletion marker anyway, so the old note can never come back over a deliberate clear.
        const id = ids.notes(d);
        if (!(await h.notes.get(id))) await h.notes.put(id, { Date: d.Date, Note: "" });
        await h.notes.remove(id);
      } else await h[coll].put(ids[coll](d), cleanValues(coll, d));
      ok += 1;
    } catch { fail += 1; }
  }
  return { ok, fail };
}

export async function savePlanOverride(key, rows) {
  const h = handles();
  if (rows) await h.plan.put(ids.plan(key), { Key: key, Rows: rows });
  else await h.plan.remove(ids.plan(key));
}

const byDate = (a, b) => (a.Date < b.Date ? -1 : a.Date > b.Date ? 1 : 0);

// Everything the screens need, in the shapes they already use.
export async function loadAll() {
  const h = handles();
  const [daily, exercise, run, notes, plan] = await Promise.all(["daily", "exercise", "run", "notes", "plan"].map((n) => h[n].list()));
  const calendarNotes = {};
  notes.forEach((r) => { if (r.Note) calendarNotes[r.Date] = r.Note; });
  const planOverrides = {};
  plan.forEach((r) => { if (r.Key && Array.isArray(r.Rows)) planOverrides[r.Key] = r.Rows; });
  return {
    dailyLog: daily.map((r) => rowOf("daily", r)).sort(byDate),
    exerciseLog: exercise.map((r) => rowOf("exercise", r)).sort(byDate),
    runLog: run.map((r) => rowOf("run", r)).sort(byDate),
    calendarNotes, planOverrides,
  };
}

// ---------------- keeping an edit safe the instant it is made ----------------
// Saving a record is asynchronous (IndexedDB). So that closing the page right after typing can never lose
// an edit, the items are first written to a small on-device journal synchronously, and cleared once the
// records are saved. Anything still in the journal at the next open is recovered. (An earlier build's own
// queue used this same key, so its leftover edits are recovered the same way.)
let journal = null;
const loadJournal = () => { if (!journal) { const q = getItem("fitness", "queue", []); journal = Array.isArray(q) ? q : []; } return journal; };
export function journalAdd(items) {
  const t = Date.now();
  for (const it of items) if (it && typeof it === "object" && !it._t) it._t = t; // when the edit was made, so recovery never beats a newer saved edit
  loadJournal().push(...items);
  setItem("fitness", "queue", journal);
}
export function journalDone(items) { const done = new Set(items); journal = loadJournal().filter((i) => !done.has(i)); setItem("fitness", "queue", journal); }

const sameAsSaved = (cur, it) => {
  const coll = COLL_OF[it.action];
  const key = (r) => (coll === "exercise" ? `${r.Date}|${String(r.ExerciseName).trim()}|${Number(r.SetNumber)}` : r.Date);
  const row = cur[coll].find((r) => key(r) === key(it.data));
  if (row && it._t && row.updatedAt >= it._t) return true; // something newer is already saved for this
  if (coll === "notes") {
    if (it.data.Note) return !!row && row.Note === it.data.Note;
    if (row) return false;
    return cur.notesAll.some((r) => r.id === ids.notes(it.data)); // already cleared (a deletion marker exists); with no record at all, the clear still has to be recorded
  }
  if (!row) return false;
  const v = cleanValues(coll, it.data);
  return Object.keys(v).every((k) => String(row[k] === null || row[k] === undefined ? "" : row[k]) === String(v[k] === null ? "" : v[k]));
};

// Puts back edits that never made it into records (an interrupted save, or a queue left by an earlier build).
// Items already saved are skipped, so a recovery can never undo a newer edit from another device.
export async function recoverJournal() {
  journal = null; // always start from what is really on the device
  const items = loadJournal().slice();
  if (!items.length) return { recovered: 0 };
  const h = handles();
  const cur = { daily: [], exercise: [], run: [], notes: [] };
  for (const n of Object.keys(cur)) cur[n] = await h[n].list(); // keeps updatedAt
  cur.notesAll = await h.notes.exportAll(); // includes deletion markers
  const todo = items.filter((it) => !validate(it && it.action, it && it.data) && !sameAsSaved(cur, it));
  const r = await applyItems(todo);
  if (r.fail === 0) { journal = []; setItem("fitness", "queue", []); }
  return { recovered: r.ok };
}

// ---------------- one-time move from the old format ----------------
// This device's own plan edits never synced before. They become plan records (once).
export async function importLocalPlan() {
  if (getItem("fitness", "planMoved", false)) return 0;
  const h = handles();
  const ov = getItem("fitness", "planOverrides", {});
  let n = 0;
  for (const [key, rows] of Object.entries(ov && typeof ov === "object" ? ov : {})) {
    if (Array.isArray(rows)) { await h.plan.put(ids.plan(key), { Key: key, Rows: rows }); n += 1; }
  }
  setItem("fitness", "planMoved", true);
  return n;
}

// The old Sheet tabs (DailyLog, ExerciseLog, RunLog, CalendarNotes) are read once and imported as OLD records
// (UpdatedAt = 1), so they can never overwrite an edit made after the move. The old tabs themselves are not touched.
export async function importOldTabs(connectedNow) {
  if (getItem("fitness", "recordsImported", false) || !connectedNow) return { imported: 0, skipped: true };
  const h = handles();
  const old = await sync.call({ action: "fitness_getAll" });
  const make = (rows, idOf, valuesOf) => rows.map((row, i) => {
    const dd = valuesOf(row);
    return { id: idOf(row), createdAt: 1 + i, updatedAt: 1, deleted: 0, values: dd };
  });
  const good = (action, rows) => (rows || []).filter((d) => !validate(action, d));
  let n = 0;
  n += await h.daily.importAll(make(good("logDaily", old.dailyLog), (d) => ids.daily(d), (d) => cleanValues("daily", d)));
  n += await h.exercise.importAll(make(good("logExercise", old.exerciseLog), (d) => ids.exercise(d), (d) => cleanValues("exercise", d)));
  n += await h.run.importAll(make(good("logRun", old.runLog), (d) => ids.run(d), (d) => cleanValues("run", d)));
  n += await h.notes.importAll(make(good("logNote", old.calendarNotes).filter((d) => d.Note), (d) => ids.notes(d), (d) => cleanValues("notes", d)));
  setItem("fitness", "recordsImported", true);
  return { imported: n, skipped: false };
}

// Grimoire backend, Fitness handler.
//
// 0.5.0: Super Shrexy's data is now ordinary Grimoire records (Id, UpdatedAt, SyncedAt, Deleted, SchemaVersion)
// in the tabs fitness_daily, fitness_exercise, fitness_run, fitness_notes and fitness_plan, synced by the generic
// engine in Grim_Core.gs (newest edit wins, only changes travel, deletes are flags). Nothing here interprets them.
function grimApp_fitness_() {
  return {
    tabs: ["daily", "exercise", "run", "notes", "plan"],
    files: false,
  };
}

// ---- Everything below is the OLD format (Phase 2b), kept for two reasons: the app reads the old tabs ONCE
// to import them into the new records, and old Shrexy keeps working against them until it is retired. ----
// Grimoire backend, Fitness handler (Phase 2b). Fitness keeps its existing Sheet tabs and its existing
// record shapes, so old Shrexy and Fitness keep reading and writing the same rows. The difference is the
// door: Fitness now comes in through Grimoire's router (one URL, one key in Script Properties, key in the
// request body) instead of the old Shrexy deployment.
//
// Two actions, both under the script lock:
//   fitness_getAll    -> { ok, dailyLog, exerciseLog, runLog, calendarNotes }   (arrays of row objects)
//   fitness_logBatch  -> { ok, results: [{ index, success, error? }] }          (items = [{ action, data }])
// Item actions: logDaily, logExercise, logRun, logNote (an empty Note deletes that day's note).
//
// Rules kept from Shrexy: tabs and columns are never renamed or removed (missing columns are added);
// RunLog Time and Pace are plain text; values Sheets converted (dates, 1899-anchored times) are repaired
// on the way out with grimNormalize_. Rules added from the charter: only changed rows are written.

const GRIM_FIT_MAX_ITEMS = 500;
const GRIM_FIT_SPECS = {
  logDaily: { out: "dailyLog", tab: "DailyLog", headers: ["Date", "Weight", "CompletionStatus", "Notes", "StatusManual"], match: ["Date"], numeric: ["Weight"] },
  logExercise: { out: "exerciseLog", tab: "ExerciseLog", headers: ["Date", "ExerciseName", "SetNumber", "Reps", "Weight"], match: ["Date", "ExerciseName", "SetNumber"], numeric: ["SetNumber", "Reps", "Weight"] },
  logRun: { out: "runLog", tab: "RunLog", headers: ["Date", "Distance", "Time", "Pace"], match: ["Date"], numeric: ["Distance"], text: ["Time", "Pace"] },
  logNote: { out: "calendarNotes", tab: "CalendarNotes", headers: ["Date", "Note"], match: ["Date"], deleteWhenEmpty: "Note" },
};
const GRIM_FIT_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const GRIM_FIT_NUM_RE = /^[+-]?\d+(\.\d+)?$/;

// What a cell looks like to the app: text for dates and times, numbers stay numbers, booleans back to TRUE/FALSE.
function grimFitCell_(v, tz) {
  if (typeof v === "number") return v;
  return grimNormalize_(v, tz);
}

// One comparable key per row. A set number written as "1" or 1 or 1.0 is the same set.
function grimFitKey_(spec, get) {
  return spec.match.map(function (c) {
    const v = get(c);
    const s = String(v === null || v === undefined ? "" : v).trim();
    return c === "SetNumber" && GRIM_FIT_NUM_RE.test(s) ? String(Number(s)) : s;
  }).join("|");
}

function grimFitGetAll_() {
  const ss = grimSheet_();
  const tz = ss.getSpreadsheetTimeZone();
  const out = { ok: true, version: GRIM_VERSION };
  Object.keys(GRIM_FIT_SPECS).forEach(function (action) {
    const spec = GRIM_FIT_SPECS[action];
    const sh = ss.getSheetByName(spec.tab);
    out[spec.out] = [];
    if (!sh) return;
    const headers = grimHeaders_(sh);
    grimReadRows_(sh, headers.length).forEach(function (r) {
      const o = {};
      let any = false;
      headers.forEach(function (h, i) {
        const v = grimFitCell_(r[i], tz);
        if (h !== "") o[h] = v;
        if (v !== "") any = true;
      });
      if (any) out[spec.out].push(o);
    });
  });
  return out;
}

// Makes sure the tab and the columns this action needs exist. Never renames or removes anything.
function grimFitTab_(ss, spec) {
  let sh = ss.getSheetByName(spec.tab);
  if (!sh) sh = ss.insertSheet(spec.tab);
  let headers = grimHeaders_(sh);
  const missing = spec.headers.filter(function (h) { return headers.indexOf(h) < 0; });
  if (missing.length) {
    const startCol = headers.length + 1;
    if (startCol + missing.length - 1 > sh.getMaxColumns()) sh.insertColumnsAfter(sh.getMaxColumns(), startCol + missing.length - 1 - sh.getMaxColumns());
    missing.forEach(function (name, i) {
      if (spec.text && spec.text.indexOf(name) >= 0) sh.getRange(1, startCol + i, sh.getMaxRows(), 1).setNumberFormat("@");
      sh.getRange(1, startCol + i).setValue(name);
    });
    if (headers.length === 0) sh.setFrozenRows(1);
    headers = headers.concat(missing);
  }
  // Time and Pace must be text before any value is written, or Sheets turns "8:45" into 8:45 AM.
  (spec.text || []).forEach(function (name) {
    sh.getRange(1, headers.indexOf(name) + 1, sh.getMaxRows(), 1).setNumberFormat("@");
  });
  return { sh: sh, headers: headers };
}

function grimFitValue_(spec, name, v) {
  if (v === null || v === undefined) return "";
  if (typeof v === "number" || typeof v === "boolean") return v;
  const s = String(v);
  if (spec.numeric && spec.numeric.indexOf(name) >= 0 && GRIM_FIT_NUM_RE.test(s.trim())) return Number(s.trim());
  return grimTextCell_(s);
}

function grimFitValidate_(spec, d) {
  if (!d || typeof d !== "object") return "bad_item";
  if (!GRIM_FIT_DATE_RE.test(String(d.Date || ""))) return "bad_date";
  if (spec.tab === "ExerciseLog") {
    if (!String(d.ExerciseName || "").trim()) return "bad_exercise";
    if (!GRIM_FIT_NUM_RE.test(String(d.SetNumber === undefined ? "" : d.SetNumber).trim())) return "bad_set";
  }
  for (const k in d) {
    if (d[k] !== null && d[k] !== undefined && String(d[k]).length > GRIM_MAX_CELL) return "too_big";
  }
  return "";
}

function grimFitBatch_(body) {
  const items = Array.isArray(body.items) ? body.items : null;
  if (!items || items.length > GRIM_FIT_MAX_ITEMS) return { ok: false, error: "bad_request" };
  const ss = grimSheet_();
  const tz = ss.getSpreadsheetTimeZone();
  const results = items.map(function () { return { success: false, error: "unknown_action" }; });
  const byTab = {};
  items.forEach(function (it, i) {
    const spec = it && GRIM_FIT_SPECS[it.action];
    if (!spec || !Object.prototype.hasOwnProperty.call(GRIM_FIT_SPECS, it.action)) return;
    const bad = grimFitValidate_(spec, it.data);
    if (bad) { results[i] = { success: false, error: bad }; return; }
    (byTab[it.action] = byTab[it.action] || []).push({ i: i, data: it.data });
  });

  Object.keys(byTab).forEach(function (action) {
    const spec = GRIM_FIT_SPECS[action];
    const t = grimFitTab_(ss, spec);
    const sh = t.sh, headers = t.headers;
    const hdr = Object.create(null);
    headers.forEach(function (h, i) { hdr[h] = i; });
    const rows = grimReadRows_(sh, headers.length);
    const originalCount = rows.length;
    const index = Object.create(null);
    rows.forEach(function (r, i) {
      index[grimFitKey_(spec, function (c) { return grimFitCell_(r[hdr[c]], tz); })] = i;
    });
    const dirty = {};

    byTab[action].forEach(function (entry) {
      const d = entry.data;
      const k2 = grimFitKey_(spec, function (c) { return d[c]; });
      const existing = index[k2];
      const isDelete = spec.deleteWhenEmpty && String(d[spec.deleteWhenEmpty] === undefined || d[spec.deleteWhenEmpty] === null ? "" : d[spec.deleteWhenEmpty]) === "";
      if (isDelete) {
        if (existing !== undefined) { rows[existing] = null; delete index[k2]; }
        results[entry.i] = { success: true };
        return;
      }
      let row;
      if (existing !== undefined) row = rows[existing].slice();
      else row = headers.map(function () { return ""; });
      spec.headers.forEach(function (name) {
        if (d[name] === undefined) return;
        row[hdr[name]] = grimFitValue_(spec, name, d[name]);
      });
      if (existing !== undefined) { rows[existing] = row; dirty[existing] = true; }
      else { rows.push(row); index[k2] = rows.length - 1; }
      results[entry.i] = { success: true };
    });

    // write only what changed: edited rows in place, new rows as one block, then deletions bottom-up
    const idx = Object.keys(dirty).map(Number).filter(function (i) { return rows[i] !== null; }).sort(function (a, b) { return a - b; });
    let p = 0;
    while (p < idx.length) {
      let q = p;
      while (q + 1 < idx.length && idx[q + 1] === idx[q] + 1) q++;
      sh.getRange(idx[p] + 2, 1, q - p + 1, headers.length).setValues(idx.slice(p, q + 1).map(function (k) { return rows[k]; }));
      p = q + 1;
    }
    const added = [];
    for (let k = originalCount; k < rows.length; k++) if (rows[k] !== null) added.push(rows[k]);
    if (added.length) {
      const firstRow = originalCount + 2;
      const lastNeeded = firstRow + added.length - 1;
      if (lastNeeded > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), lastNeeded - sh.getMaxRows() + 100);
      sh.getRange(firstRow, 1, added.length, headers.length).setValues(added);
    }
    for (let k = originalCount - 1; k >= 0; k--) if (rows[k] === null) sh.deleteRow(k + 2);
  });
  SpreadsheetApp.flush();
  return { ok: true, version: GRIM_VERSION, results: results.map(function (r, i) { return Object.assign({ index: i }, r); }) };
}

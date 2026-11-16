// Phase 2b: the Fitness actions of Grimoire's backend, run from the real .gs files in the simulated Sheets
// (which converts "2026-11-02" to a date and "32:15" to a time in a normal cell, like the real thing).
import { describe, it, expect, beforeEach } from "vitest";
import { createBackend } from "./sim/sheetsSim.js";

const KEY = "K".repeat(48);
let be;
const H = {
  DailyLog: ["Date", "Weight", "CompletionStatus", "Notes", "StatusManual"],
  ExerciseLog: ["Date", "ExerciseName", "SetNumber", "Reps", "Weight"],
  RunLog: ["Date", "Distance", "Time", "Pace"],
  CalendarNotes: ["Date", "Note"],
};
function seed(tab, rows, headers = H[tab]) {
  const sh = be.ss.insertSheet(tab);
  sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  if (rows.length) sh.getRange(2, 1, rows.length, headers.length).setValues(rows);
  return sh;
}
const call = (action, extra = {}) => be.post({ key: KEY, action, ...extra });
const batch = (items) => call("fitness_logBatch", { items });
beforeEach(() => { be = createBackend({ key: KEY }); });

describe("fitness_getAll", () => {
  it("needs the Grimoire key", () => {
    expect(be.post({ key: "wrong", action: "fitness_getAll" })).toEqual({ ok: false, error: "auth" });
    expect(be.post({ action: "fitness_getAll" }).error).toBe("auth");
  });
  it("returns empty lists when the tabs do not exist yet", () => {
    const r = call("fitness_getAll");
    expect(r).toMatchObject({ ok: true, dailyLog: [], exerciseLog: [], runLog: [], calendarNotes: [] });
  });
  it("hands back the old row shapes and repairs what Sheets converted", () => {
    seed("DailyLog", [["2026-11-02", "188.4", "Partial", "• felt ok", "TRUE"]]); // Date becomes a real date, "TRUE" a boolean
    seed("ExerciseLog", [["2026-11-02", "Bench", 1, 8, 135]]);
    seed("RunLog", [["2026-11-01", 3.1, "32:15", "10:24"]]); // Time and Pace become 1899 times in a General cell
    seed("CalendarNotes", [["2026-11-03", "pickleball"]]);
    const raw = be.tab("RunLog").getRange(2, 3, 1, 1).getValues()[0][0];
    expect(raw instanceof Date).toBe(true); // the simulated Sheet really did corrupt it
    const r = call("fitness_getAll");
    expect(r.dailyLog).toEqual([{ Date: "2026-11-02", Weight: 188.4, CompletionStatus: "Partial", Notes: "• felt ok", StatusManual: "TRUE" }]);
    expect(r.exerciseLog).toEqual([{ Date: "2026-11-02", ExerciseName: "Bench", SetNumber: 1, Reps: 8, Weight: 135 }]);
    expect(r.runLog).toEqual([{ Date: "2026-11-01", Distance: 3.1, Time: "32:15", Pace: "10:24" }]);
    expect(r.calendarNotes).toEqual([{ Date: "2026-11-03", Note: "pickleball" }]);
  });
  it("skips fully blank rows and keeps extra columns the user added", () => {
    seed("DailyLog", [["2026-11-02", 190, "None", "", "FALSE", "mine"], ["", "", "", "", "", ""]], [...H.DailyLog, "Extra"]);
    const r = call("fitness_getAll");
    expect(r.dailyLog.length).toBe(1);
    expect(r.dailyLog[0].Extra).toBe("mine");
  });
});

describe("fitness_logBatch", () => {
  it("needs the key, and refuses an oversized batch", () => {
    expect(be.post({ key: "x", action: "fitness_logBatch", items: [] }).error).toBe("auth");
    expect(batch(Array.from({ length: 501 }, () => ({ action: "logNote", data: { Date: "2026-11-01", Note: "x" } }))).error).toBe("bad_request");
    expect(call("fitness_logBatch", { items: "nope" }).error).toBe("bad_request");
  });
  it("creates the tabs and columns on first use, then upserts by date instead of adding rows", () => {
    const r1 = batch([{ action: "logDaily", data: { Date: "2026-11-02", Weight: "190", CompletionStatus: "Partial", StatusManual: "FALSE", Notes: "a" } }]);
    expect(r1.results).toEqual([{ index: 0, success: true }]);
    expect(be.headers("DailyLog")).toEqual(H.DailyLog);
    batch([{ action: "logDaily", data: { Date: "2026-11-02", Weight: "189.5", CompletionStatus: "Complete", StatusManual: "TRUE", Notes: "b" } }]);
    const rows = call("fitness_getAll").dailyLog;
    expect(rows).toEqual([{ Date: "2026-11-02", Weight: 189.5, CompletionStatus: "Complete", Notes: "b", StatusManual: "TRUE" }]);
  });
  it("matches existing rows whose Date cell Sheets already turned into a date", () => {
    seed("DailyLog", [["2026-11-02", 190, "None", "", "FALSE"], ["2026-11-03", 191, "None", "", "FALSE"]]);
    batch([{ action: "logDaily", data: { Date: "2026-11-03", Weight: "188" } }]);
    const r = call("fitness_getAll").dailyLog;
    expect(r.length).toBe(2);
    expect(r[1]).toMatchObject({ Date: "2026-11-03", Weight: 188, CompletionStatus: "None" }); // untouched fields kept
    expect(r[0].Weight).toBe(190);
  });
  it("matches exercise sets by date + exercise + set number, however the number is written", () => {
    batch([{ action: "logExercise", data: { Date: "2026-11-02", ExerciseName: "Bench", SetNumber: 1, Reps: "8", Weight: "135" } }]);
    batch([{ action: "logExercise", data: { Date: "2026-11-02", ExerciseName: "Bench", SetNumber: "1", Reps: "9", Weight: "135" } },
           { action: "logExercise", data: { Date: "2026-11-02", ExerciseName: "Bench", SetNumber: 2, Reps: "8", Weight: "135" } },
           { action: "logExercise", data: { Date: "2026-11-02", ExerciseName: "Row", SetNumber: 1, Reps: "10", Weight: "90" } }]);
    const ex = call("fitness_getAll").exerciseLog;
    expect(ex.length).toBe(3);
    expect(ex.find((e) => e.ExerciseName === "Bench" && e.SetNumber === 1).Reps).toBe(9);
  });
  it("keeps run Time and Pace as plain text, so 8:45 never becomes 8:45 AM", () => {
    batch([{ action: "logRun", data: { Date: "2026-11-01", Distance: "3.1", Time: "32:15", Pace: "10:24" } },
           { action: "logRun", data: { Date: "2026-11-02", Distance: "1", Time: "8:45", Pace: "8:45" } }]);
    expect(be.rows("RunLog").map((r) => [r.Time, r.Pace])).toEqual([["32:15", "10:24"], ["8:45", "8:45"]]);
    expect(call("fitness_getAll").runLog[1]).toEqual({ Date: "2026-11-02", Distance: 1, Time: "8:45", Pace: "8:45" });
    // and again on an existing row
    batch([{ action: "logRun", data: { Date: "2026-11-02", Distance: "2", Time: "17:30", Pace: "8:45" } }]);
    expect(be.rows("RunLog")[1].Time).toBe("17:30");
  });
  it("makes the Time and Pace columns of an EXISTING run tab plain text too, before writing", () => {
    seed("RunLog", [["2026-10-01", 2, "20:00", "10:00"]]); // an old tab: General format, so Sheets converts what is written
    batch([{ action: "logRun", data: { Date: "2026-11-02", Distance: "1", Time: "8:45", Pace: "8:45" } }]);
    expect(call("fitness_getAll").runLog.map((r) => [r.Time, r.Pace])).toEqual([["20:00", "10:00"], ["8:45", "8:45"]]);
    expect(typeof be.rows("RunLog")[1].Time).toBe("string");
  });
  it("adds a missing column (StatusManual) without moving or losing anything", () => {
    seed("DailyLog", [["2026-11-02", 190, "Partial", "keep me"]], ["Date", "Weight", "CompletionStatus", "Notes"]);
    batch([{ action: "logDaily", data: { Date: "2026-11-03", Weight: "189", StatusManual: "TRUE" } }]);
    expect(be.headers("DailyLog")).toEqual(["Date", "Weight", "CompletionStatus", "Notes", "StatusManual"]);
    expect(call("fitness_getAll").dailyLog[0]).toMatchObject({ Date: "2026-11-02", Notes: "keep me" });
  });
  it("never removes or reorders columns it does not know (a hand-added column survives a rewrite)", () => {
    seed("DailyLog", [["2026-11-02", 190, "None", "", "FALSE", "my own"]], [...H.DailyLog, "Extra"]);
    batch([{ action: "logDaily", data: { Date: "2026-11-02", Weight: "188" } }]);
    expect(be.headers("DailyLog")).toEqual([...H.DailyLog, "Extra"]);
    expect(be.rows("DailyLog")[0].Extra).toBe("my own");
  });
  it("writes only the rows that changed", () => {
    seed("DailyLog", Array.from({ length: 200 }, (_, i) => [`2026-01-${String((i % 28) + 1).padStart(2, "0")}-${i}`.slice(0, 10), 180, "None", "", "FALSE"]).map((r, i) => [`2025-${String(1 + (i % 12)).padStart(2, "0")}-${String(1 + (i % 28)).padStart(2, "0")}`, 180 + i, "None", "", "FALSE"]));
    const rows0 = be.rows("DailyLog").length;
    be.stats.rowsWritten = 0;
    batch([{ action: "logDaily", data: { Date: "2025-03-03", Weight: "150" } }]);
    expect(be.stats.rowsWritten).toBeLessThanOrEqual(2);
    expect(be.rows("DailyLog").length).toBeGreaterThanOrEqual(rows0 - 1);
  });
  it("an empty note deletes that day's note only; delete then re-add in one batch leaves one row", () => {
    batch([{ action: "logNote", data: { Date: "2026-11-01", Note: "a" } }, { action: "logNote", data: { Date: "2026-11-02", Note: "b" } }, { action: "logNote", data: { Date: "2026-11-03", Note: "c" } }]);
    batch([{ action: "logNote", data: { Date: "2026-11-02", Note: "" } }]);
    expect(call("fitness_getAll").calendarNotes).toEqual([{ Date: "2026-11-01", Note: "a" }, { Date: "2026-11-03", Note: "c" }]);
    batch([{ action: "logNote", data: { Date: "2026-11-01", Note: "" } }, { action: "logNote", data: { Date: "2026-11-01", Note: "again" } }]);
    expect(call("fitness_getAll").calendarNotes).toEqual([{ Date: "2026-11-03", Note: "c" }, { Date: "2026-11-01", Note: "again" }]);
    batch([{ action: "logNote", data: { Date: "2026-11-09", Note: "x" } }, { action: "logNote", data: { Date: "2026-11-09", Note: "" } }]);
    expect(call("fitness_getAll").calendarNotes.length).toBe(2);
  });
  it("one bad item fails alone and the rest are saved", () => {
    const r = batch([
      { action: "logDaily", data: { Date: "2026-11-02", Weight: "190" } },
      { action: "logDaily", data: { Date: "02/11/2026", Weight: "190" } },
      { action: "logExercise", data: { Date: "2026-11-02", ExerciseName: "", SetNumber: 1 } },
      { action: "deleteEverything", data: {} },
      { action: "logRun", data: { Date: "2026-11-02", Distance: "1", Time: "9:00", Pace: "9:00" } },
    ]);
    expect(r.results.map((x) => x.success)).toEqual([true, false, false, false, true]);
    expect(r.results[1].error).toBe("bad_date");
    expect(r.results[3].error).toBe("unknown_action");
    expect(call("fitness_getAll").dailyLog.length).toBe(1);
  });
  it("text that starts with = or ' is stored as written, not as a formula", () => {
    batch([{ action: "logDaily", data: { Date: "2026-11-02", Notes: "=1+1" } }, { action: "logNote", data: { Date: "2026-11-02", Note: "'quoted" } }]);
    const r = call("fitness_getAll");
    expect(r.dailyLog[0].Notes).toBe("=1+1");
    expect(r.calendarNotes[0].Note).toBe("'quoted");
  });
  it("is safe to send twice: same rows, no duplicates", () => {
    const items = [{ action: "logDaily", data: { Date: "2026-11-02", Weight: "190", CompletionStatus: "Complete", StatusManual: "FALSE", Notes: "n" } },
                   { action: "logExercise", data: { Date: "2026-11-02", ExerciseName: "Bench", SetNumber: 1, Reps: "8", Weight: "135" } },
                   { action: "logRun", data: { Date: "2026-11-02", Distance: "3", Time: "30:00", Pace: "10:00" } }];
    batch(items); const once = JSON.stringify(call("fitness_getAll"));
    batch(items);
    expect(JSON.stringify(call("fitness_getAll"))).toBe(once);
  });
  it("is refused while another request holds the lock (never half a write)", () => {
    be.lock.held = true;
    expect(batch([{ action: "logNote", data: { Date: "2026-11-01", Note: "x" } }])).toEqual({ ok: false, error: "busy" });
    expect(call("fitness_getAll").error).toBe("busy");
  });
  it("leaves Grimoire's own sync untouched (version 0.4.0, ping still works)", () => {
    expect(call("ping")).toMatchObject({ ok: true, version: "0.7.0" });
  });
});

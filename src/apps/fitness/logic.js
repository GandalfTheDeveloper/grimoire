import { ACCENT, GOLD, REDC, SLATE } from "./theme.js";
import { getEffectiveExercises, getWeekNumber } from "./plan.js";
import { addDays, dayName, fmtDate } from "./dates.js";

export const statusColor = (s) => (s === "Complete" ? ACCENT : s === "Partial" ? GOLD : s === "None" ? REDC : SLATE);
export const isManualFlag = (v) => String(v).toUpperCase() === "TRUE";
// Rest days count as Complete unless a status was deliberately set by hand —
// otherwise logging a weigh-in on a rest day (which saves status "None")
// would paint that rest day red.
export const effectiveStatus = (planType, entry) => {
  if (planType === "Rest") return entry?.CompletionStatus && isManualFlag(entry.StatusManual) ? entry.CompletionStatus : "Complete";
  return entry?.CompletionStatus || "None";
};
// ---- History-based placeholder logic ----
export function overlayPending(log, queue, action) {
  const pending = (queue || []).filter((i) => i.action === action).map((i) => i.data);
  if (!pending.length) return log;
  const map = new Map();
  log.forEach((r) => map.set(r.Date, r));
  pending.forEach((r) => map.set(r.Date, { ...(map.get(r.Date) || {}), ...r }));
  return [...map.values()];
}

// Notes saved on this device but not yet in the Sheet must survive a refresh from the Sheet.
// (Same idea as overlayPending, for the { date: text } shape notes use. An empty note means "delete".)
export function overlayNotes(notes, queue) {
  const pending = (queue || []).filter((i) => i.action === "logNote");
  if (!pending.length) return notes;
  const out = { ...notes };
  pending.forEach((i) => { if (i.data.Note) out[i.data.Date] = i.data.Note; else delete out[i.data.Date]; });
  return out;
}

export function effectiveExerciseLog(exerciseLog, queue) {
  const pending = (queue || []).filter((i) => i.action === "logExercise").map((i) => i.data);
  if (!pending.length) return exerciseLog;
  const key = (r) => `${r.Date}|${r.ExerciseName}|${r.SetNumber}`;
  const map = new Map();
  exerciseLog.forEach((r) => map.set(key(r), r));
  pending.forEach((r) => map.set(key(r), r));
  return [...map.values()];
}

// Finds the most recent PAST calendar date this exercise was actually
// scheduled to happen, per the plan (walks backward day by day). Distinct
// from getLastSession: this does NOT skip a date just because nothing was
// logged for it — a skipped session should still count as "last time."
export function getLastScheduledDate(exName, dateStr, anchorDate, planOverrides) {
  let d = addDays(new Date(dateStr + "T00:00:00"), -1);
  for (let i = 0; i < 21; i++) {
    const wk = getWeekNumber(d, anchorDate);
    const dn = dayName(d);
    const dayExercises = getEffectiveExercises(planOverrides, wk, dn);
    if (dayExercises.some((e) => e.ExerciseName === exName)) return fmtDate(d);
    d = addDays(d, -1);
  }
  return null;
}

export function getLastSession(exerciseLog, name, beforeDateStr) {
  const dates = [...new Set(exerciseLog.filter((r) => r.ExerciseName === name && r.Date < beforeDateStr).map((r) => r.Date))].sort();
  if (!dates.length) return [];
  const last = dates[dates.length - 1];
  return exerciseLog.filter((r) => r.ExerciseName === name && r.Date === last).sort((a, b) => Number(a.SetNumber) - Number(b.SetNumber));
}
export function modeOrAverage(session) {
  if (!session.length) return { reps: "", weight: "" };
  const counts = {};
  session.forEach((s) => { const k = `${s.Reps}|${s.Weight}`; counts[k] = (counts[k] || 0) + 1; });
  const entries = Object.entries(counts);
  const maxFreq = Math.max(...entries.map((e) => e[1]));
  const modes = entries.filter((e) => e[1] === maxFreq);
  if (session.length === 1 || (maxFreq > 1 && modes.length === 1)) {
    const [reps, weight] = modes[0][0].split("|");
    return { reps, weight };
  }
  const avg = (arr) => (arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : "");
  const repsNums = session.map((s) => Number(s.Reps)).filter((n) => !isNaN(n));
  const weightNums = session.map((s) => Number(s.Weight)).filter((n) => !isNaN(n));
  return { reps: String(avg(repsNums)), weight: String(avg(weightNums)) };
}
export function generateDemoData() {
  const daily = [], exercise = [], run = [];
  const today = new Date();
  let bw = 186;
  for (let i = 70; i >= 0; i--) {
    const d = new Date(today); d.setDate(d.getDate() - i);
    const ds = fmtDate(d);
    const dn = dayName(d);
    if (dn === "Friday") continue;
    bw -= Math.random() * 0.15;
    const roll = Math.random();
    const status = roll > 0.8 ? "Partial" : roll > 0.12 ? "Complete" : "None";
    daily.push({ Date: ds, Weight: bw.toFixed(1), CompletionStatus: status, Notes: "" });
    if (status !== "None" && (dn === "Wednesday" || dn === "Monday" || dn === "Sunday")) {
      const weekIdx = Math.floor((70 - i) / 7);
      if (dn === "Wednesday") {
        const base = 30 + weekIdx * 1.2;
        exercise.push({ Date: ds, ExerciseName: "Dumbbell Bench Press", SetNumber: 1, Reps: 10, Weight: Math.round(base) });
        exercise.push({ Date: ds, ExerciseName: "Dumbbell Bench Press", SetNumber: 2, Reps: 10, Weight: Math.round(base) });
        exercise.push({ Date: ds, ExerciseName: "Dumbbell Bench Press", SetNumber: 3, Reps: 8, Weight: Math.round(base - 8) });
        exercise.push({ Date: ds, ExerciseName: "Squats", SetNumber: 1, Reps: 8, Weight: Math.round(65 + weekIdx * 1.8) });
        exercise.push({ Date: ds, ExerciseName: "Squats", SetNumber: 2, Reps: 8, Weight: Math.round(65 + weekIdx * 1.8) });
      }
      if (dn === "Monday") {
        const base = 75 + weekIdx * 1.5;
        exercise.push({ Date: ds, ExerciseName: "Cable Rows", SetNumber: 1, Reps: 12, Weight: Math.round(base) });
        exercise.push({ Date: ds, ExerciseName: "Cable Rows", SetNumber: 2, Reps: 12, Weight: Math.round(base) });
        exercise.push({ Date: ds, ExerciseName: "Cable Rows", SetNumber: 3, Reps: 10, Weight: Math.round(base - 5) });
      }
    }
    if (status !== "None" && (dn === "Tuesday" || dn === "Saturday")) {
      const weekIdx = Math.floor((70 - i) / 7);
      const paceSec = Math.max(495, 620 - weekIdx * 3);
      const m = Math.floor(paceSec / 60), s = paceSec % 60;
      run.push({ Date: ds, Distance: (2.8 + Math.random() * 0.6).toFixed(1), Time: "32:00", Pace: `${m}:${String(s).padStart(2, "0")}` });
    }
  }
  return { daily, exercise, run };
}

export function getLastNoteForSameWeekday(dailyLog, dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  const dn = dayName(d);
  const candidates = dailyLog
    .filter((r) => r.Date < dateStr && r.Notes)
    .filter((r) => dayName(new Date(r.Date + "T00:00:00")) === dn)
    .sort((a, b) => b.Date.localeCompare(a.Date));
  return candidates[0]?.Notes || "";
}

export function computeAutoStatus(setsObj, runD, isRunDay, isRestDay) {
  if (isRestDay) return "Complete";
  const allRows = Object.values(setsObj).flat();
  if (allRows.length > 0) {
    const filled = allRows.filter((r) => String(r.reps).trim() !== "");
    if (filled.length === 0) return isRunDay && (runD.Distance || runD.Time) ? "Partial" : "None";
    if (filled.length === allRows.length) return "Complete";
    return "Partial";
  }
  if (isRunDay) {
    if (runD.Distance && runD.Time) return "Complete";
    if (runD.Distance || runD.Time) return "Partial";
    return "None";
  }
  return "None";
}

export function rowPlaceholder(exerciseLog, exName, dateStr, rowIndex) {
  const session = getLastSession(exerciseLog, exName, dateStr);
  if (rowIndex === 0) return modeOrAverage(session);
  const row = session[rowIndex];
  return row ? { reps: row.Reps, weight: row.Weight } : { reps: "", weight: "" };
}

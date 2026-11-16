import React, { useState, useEffect, useRef, useMemo } from "react";
import { ChevronLeft, ChevronRight, RefreshCw, Plus, Trash2 } from "lucide-react";
import { ACCENT, BG, CARD, GOLD, INK, LINE, ON_ACCENT, ON_GOLD, ON_RED, REDC, SLATE, SUB } from "./theme.js";
import { PLAN_DAYS, getEffectiveExercises, getWeekNumber, parseTargetSets, reorderPlanChanges } from "./plan.js";
import { addDays, computePace, dayName, fmtDate, formatSecondsClock } from "./dates.js";
import { computeAutoStatus, effectiveExerciseLog, getLastNoteForSameWeekday, getLastScheduledDate, isManualFlag, rowPlaceholder, statusColor } from "./logic.js";
import { liftOutlook, liftStatusNow } from "./analytics.js";
import { OverloadIcon, STATUS_OPTS, Segmented } from "./ui.jsx";
import { ExerciseGraphModal, OverloadPopover } from "./modals.jsx";
import { useReorder } from "./useReorder.js";

export function LogEntryView({ date, setDate, anchorDate, dailyLog, exerciseLog, runLog, queue, planOverrides, onSavePlan, isEditingHistorical, onDone, onSave, onSwipeSave, onLocalSave, onSync, syncing, pendingCount }) {
  const wk = getWeekNumber(date, anchorDate);
  const dn = dayName(date);
  const dateStr = fmtDate(date);
  const planDay = PLAN_DAYS.find((p) => p.Week === wk && p.DayOfWeek === dn);
  const exercises = useMemo(() => getEffectiveExercises(planOverrides, wk, dn), [wk, dn, planOverrides]);
  const isRunDay = ["Run", "Run+Mobility", "HIIT"].includes(planDay?.Type);
  const existingDaily = dailyLog.find((r) => r.Date === dateStr);
  const effExerciseLog = useMemo(() => effectiveExerciseLog(exerciseLog, queue), [exerciseLog, queue]);
  const swipeTouchX = useRef(null);
  const [graphFor, setGraphFor] = useState(null); // { name, at }
  const [overloadFor, setOverloadFor] = useState(null); // { name, up }
  useEffect(() => { setGraphFor(null); setOverloadFor(null); }, [dateStr]);
  const press = useRef({ timer: null, x: 0, y: 0 });
  const cancelPress = () => { clearTimeout(press.current.timer); press.current.timer = null; };
  const openGraph = (name) => {
    press.current.timer = null;
    try { if (navigator.vibrate) navigator.vibrate(15); } catch { /* not supported */ }
    setOverloadFor(null);
    setGraphFor({ name, at: Date.now() });
  };
  const pressProps = (name) => ({
    onTouchStart: (e) => { const t = e.touches[0]; press.current.x = t.clientX; press.current.y = t.clientY; cancelPress(); press.current.timer = setTimeout(() => openGraph(name), 500); },
    onTouchMove: (e) => { const t = e.touches[0]; if (Math.abs(t.clientX - press.current.x) > 10 || Math.abs(t.clientY - press.current.y) > 10) cancelPress(); },
    onTouchEnd: cancelPress, onTouchCancel: cancelPress,
    onMouseDown: (e) => { if (e.button !== 0) return; cancelPress(); press.current.timer = setTimeout(() => openGraph(name), 500); },
    onMouseUp: cancelPress, onMouseLeave: cancelPress,
    onContextMenu: (e) => e.preventDefault(),
  });
  useEffect(() => () => cancelPress(), []);

  const isRestDay = planDay?.Type === "Rest";

  // Long-press a card's background and drag it up or down: the new order is saved as this day's plan, so it becomes the default.
  const listRef = useRef(null);
  useReorder(listRef, (from, to) => { if (onSavePlan) reorderPlanChanges(planOverrides, wk, dn, from, to).forEach((c) => onSavePlan(c.key, c.rows)); }, () => setOverloadFor(null));

  const [status, setStatus] = useState(existingDaily?.CompletionStatus || "None");
  const [statusManual, setStatusManual] = useState(isManualFlag(existingDaily?.StatusManual));
  const [weight, setWeight] = useState(existingDaily?.Weight || "");
  const [notes, setNotes] = useState(existingDaily?.Notes || "");
  const [sets, setSets] = useState({});
  // Graph data: everything logged for the exercise, with this day's sets taken
  // from what's on screen once all of them are filled in.
  const graphRows = useMemo(() => {
    if (!graphFor) return [];
    const name = graphFor.name;
    const today = sets[name] || [];
    const done = today.length > 0 && today.every((st) => String(st.reps).trim() !== "");
    const others = effExerciseLog.filter((r) => r.ExerciseName === name && r.Date !== dateStr);
    return done ? [...others, ...setsToRows(name, dateStr, today.map((st) => ({ reps: st.reps, w: st.weight })))] : others;
  }, [graphFor, effExerciseLog, sets, dateStr]);
  const [runData, setRunData] = useState({ Distance: "", Time: "", Pace: "" });
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [timerElapsed, setTimerElapsed] = useState({});
  const [timerRunning, setTimerRunning] = useState({});
  const timerIntervals = useRef({});
  // True once anything has been changed since this day was loaded or last
  // saved. Gates every automatic local save, so browsing days never creates
  // queue entries — only real edits do.
  const editedRef = useRef(false);
  const markEdited = () => { editedRef.current = true; };

  useEffect(() => () => { Object.values(timerIntervals.current).forEach(clearInterval); }, []);

  useEffect(() => {
    // Anything still sitting in the local sync queue for this date is the most
    // up-to-date version of that data — layer it on top of confirmed synced data
    // so reopening a day never looks like the entry vanished while unsynced.
    const pendingForDate = (queue || []).filter((item) => item.data.Date === dateStr);
    const pendingDaily = [...pendingForDate].reverse().find((i) => i.action === "logDaily")?.data;
    const pendingRun = [...pendingForDate].reverse().find((i) => i.action === "logRun")?.data;
    const pendingExercise = pendingForDate.filter((i) => i.action === "logExercise");

    const initial = {};
    exercises.forEach((ex) => {
      const existingRows = exerciseLog.filter((r) => r.Date === dateStr && r.ExerciseName === ex.ExerciseName);
      const pendingRows = pendingExercise.filter((i) => i.data.ExerciseName === ex.ExerciseName).map((i) => i.data);
      const bySet = {};
      existingRows.forEach((r) => { bySet[Number(r.SetNumber)] = { reps: String(r.Reps ?? ""), weight: String(r.Weight ?? "") }; });
      pendingRows.forEach((r) => { bySet[Number(r.SetNumber)] = { reps: String(r.Reps ?? ""), weight: String(r.Weight ?? "") }; });
      const maxSet = Math.max(parseTargetSets(ex.TargetSets), ...Object.keys(bySet).map(Number), 0);
      initial[ex.ExerciseName] = Array.from({ length: maxSet }, (_, i) => bySet[i + 1] || { reps: "", weight: "" });
    });
    setSets(initial);

    // Manual override is only honored when it was explicitly saved as one.
    // Otherwise the status is recomputed from the sets every time.
    const dailyForDate = pendingDaily || dailyLog.find((r) => r.Date === dateStr);
    setStatusManual(isManualFlag(dailyForDate?.StatusManual));
    setStatus(dailyForDate?.CompletionStatus || "None");
    setWeight(dailyForDate?.Weight || "");
    setNotes(dailyForDate?.Notes || "");

    const existingRun = pendingRun || runLog.find((r) => r.Date === dateStr);
    setRunData(existingRun ? { Distance: existingRun.Distance || "", Time: existingRun.Time || "", Pace: existingRun.Pace || "" } : { Distance: "", Time: "", Pace: "" });

    setTimerElapsed({}); setTimerRunning({});
    Object.values(timerIntervals.current).forEach(clearInterval);
    timerIntervals.current = {};
    editedRef.current = false;
  }, [dateStr]);

  // None until a set is logged, Partial once any set has reps, Complete once
  // every set of every exercise has reps. Skipped while a manual pick stands.
  useEffect(() => {
    if (!statusManual) setStatus(computeAutoStatus(sets, runData, isRunDay, isRestDay));
  }, [sets, runData, isRunDay, isRestDay, statusManual]);

  const notesPlaceholder = getLastNoteForSameWeekday(dailyLog, dateStr);

  const addSetRow = (exName) => { markEdited(); setSets((s) => ({ ...s, [exName]: [...(s[exName] || []), { reps: "", weight: "" }] })); };
  const updateSetRow = (exName, i, field, val) => { markEdited(); setSets((s) => ({ ...s, [exName]: s[exName].map((r, idx) => (idx === i ? { ...r, [field]: val } : r)) })); };
  const removeSetRow = (exName, i) => { markEdited(); setSets((s) => ({ ...s, [exName]: s[exName].filter((_, idx) => idx !== i) })); };
  const setRunField = (field, val) => {
    markEdited();
    setRunData((prev) => { const next = { ...prev, [field]: val }; next.Pace = computePace(next.Distance, next.Time); return next; });
  };

  const toggleTimer = (exName, i) => {
    const key = `${exName}__${i}`;
    if (timerRunning[key]) {
      clearInterval(timerIntervals.current[key]);
      delete timerIntervals.current[key];
      setTimerRunning((r) => ({ ...r, [key]: false }));
      const secs = timerElapsed[key] || 0;
      updateSetRow(exName, i, "reps", String(secs));
    } else {
      const startAt = Number(sets[exName]?.[i]?.reps) || 0;
      setTimerElapsed((e) => ({ ...e, [key]: startAt }));
      setTimerRunning((r) => ({ ...r, [key]: true }));
      timerIntervals.current[key] = setInterval(() => {
        setTimerElapsed((e) => ({ ...e, [key]: (e[key] || 0) + 1 }));
      }, 1000);
    }
  };

  const handleNotesFocus = () => { if (!notes) setNotes("• "); };
  const handleNotesKeyDown = (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    markEdited();
    const el = e.target;
    const start = el.selectionStart, end = el.selectionEnd;
    const insertion = "\n• ";
    const newValue = notes.slice(0, start) + insertion + notes.slice(end);
    setNotes(newValue);
    requestAnimationFrame(() => { el.selectionStart = el.selectionEnd = start + insertion.length; });
  };

  const buildItems = () => {
    const items = [{ action: "logDaily", data: { Date: dateStr, Weight: weight, CompletionStatus: status, StatusManual: statusManual ? "TRUE" : "FALSE", Notes: notes } }];
    Object.entries(sets).forEach(([exName, rows]) => {
      rows.forEach((r, i) => { if (r.reps || r.weight) items.push({ action: "logExercise", data: { Date: dateStr, ExerciseName: exName, SetNumber: i + 1, Reps: r.reps, Weight: r.weight } }); });
    });
    if (isRunDay && (runData.Distance || runData.Time)) items.push({ action: "logRun", data: { Date: dateStr, ...runData } });
    return items;
  };

  // Always-current references so timers/listeners never save stale data.
  const buildItemsRef = useRef(buildItems);
  buildItemsRef.current = buildItems;
  const onLocalSaveRef = useRef(onLocalSave);
  onLocalSaveRef.current = onLocalSave;
  const flushLocalRef = useRef(() => {});
  flushLocalRef.current = () => {
    if (!editedRef.current) return;
    editedRef.current = false;
    onLocalSaveRef.current(buildItemsRef.current());
  };

  // Local autosave every 60s, plus immediately when the app is backgrounded
  // (switching apps) or this screen closes.
  useEffect(() => {
    const id = setInterval(() => flushLocalRef.current(), 60000);
    const onVis = () => { if (document.visibilityState === "hidden") flushLocalRef.current(); };
    const onPageHide = () => flushLocalRef.current();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pagehide", onPageHide);
      flushLocalRef.current();
    };
  }, []);

  // Any date change saves the current day locally first.
  const goToDate = (newDate) => {
    if (editedRef.current) { editedRef.current = false; onSwipeSave(buildItems()); }
    setDate(newDate);
  };

  const handleSave = async () => {
    setSaving(true);
    editedRef.current = false;
    const result = await onSave(buildItems());
    setSaving(false);
    if (result.fail === 0) { setJustSaved(true); setTimeout(() => setJustSaved(false), 2000); }
    if (isEditingHistorical) onDone();
  };

  const handleSync = async () => {
    const items = editedRef.current ? buildItems() : null;
    editedRef.current = false;
    await onSync(items);
  };

  return (
    <div style={{ position: "relative", height: "100%" }}>
    <div ref={listRef} style={{ padding: "20px 20px calc(20px + env(safe-area-inset-bottom, 0px) + 100px) 20px", display: "flex", flexDirection: "column", gap: 18, overflowY: "auto", height: "100%", boxSizing: "border-box" }}>
      <style>{`.ex-card{-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}.ex-card input,.ex-card textarea{-webkit-user-select:text;user-select:text}`}</style>
      {isEditingHistorical && (
        <button onClick={onDone} style={{ display: "flex", alignItems: "center", gap: 4, alignSelf: "flex-start", fontSize: 13, color: SUB, background: "none", border: "none", cursor: "pointer", padding: 0 }}>
          <ChevronLeft size={16} /> Back
        </button>
      )}
      <input type="date" value={dateStr} onChange={(e) => { if (e.target.value) goToDate(new Date(e.target.value + "T00:00:00")); }} style={{ padding: 10, borderRadius: 8, background: CARD, border: `1px solid ${LINE}`, color: INK, fontSize: 15 }} />
      <div style={{ fontSize: 13, color: ACCENT, fontWeight: 700 }}>Week {wk} · {planDay?.Type} · {planDay?.MuscleGroups}</div>

      {exercises.map((ex) => {
        const exRows = sets[ex.ExerciseName] || [];
        const filledReps = exRows.filter((r) => r.reps).length;
        const exStatus = filledReps === 0 ? "None" : filledReps === exRows.length ? "Complete" : "Partial";
        const stripeColor = statusColor(exStatus);
        const type = ex.ExerciseType || "weighted";
        const lastSchedDate = getLastScheduledDate(ex.ExerciseName, dateStr, anchorDate, planOverrides);
        let lastStatus = null;
        if (lastSchedDate) {
          const rowsOnThatDate = effExerciseLog.filter((r) => r.Date === lastSchedDate && r.ExerciseName === ex.ExerciseName);
          const lastFilled = rowsOnThatDate.filter((r) => r.Reps).length;
          lastStatus = rowsOnThatDate.length === 0 ? "None" : lastFilled === 0 ? "None" : lastFilled === rowsOnThatDate.length ? "Complete" : "Partial";
        }
        const ghostColor = lastStatus ? statusColor(lastStatus) + "55" : "transparent";
        const ovStatus = liftStatusNow(effExerciseLog, ex.ExerciseName, dateStr, exRows, planOverrides, anchorDate);
        const ovColor = ovStatus ? ovStatus.color : SUB;
        return (
          <div key={ex.ExerciseName} data-excard="" className="ex-card" style={{ position: "relative", background: CARD, borderRadius: 10, padding: "12px 12px 12px 27px" }}>
            <div data-testid="bar-overload" style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 5, background: ovStatus ? ovStatus.color : "transparent", borderRadius: "10px 0 0 10px" }} title="Progressive overload" />
            <div data-testid="bar-ghost" style={{ position: "absolute", left: 5, top: 0, bottom: 0, width: 5, background: ghostColor }} title="Status last time" />
            <div data-testid="bar-today" style={{ position: "absolute", left: 10, top: 0, bottom: 0, width: 5, background: stripeColor }} />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span data-testid="exercise-name" data-nodrag="" {...pressProps(ex.ExerciseName)} style={{ fontWeight: 600, fontSize: 14, color: stripeColor, userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none", cursor: "pointer" }}>{ex.ExerciseName}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                <button data-testid="overload-btn" aria-label={`${ex.ExerciseName} progressive overload breakdown`}
                  onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setOverloadFor((cur) => (cur && cur.name === ex.ExerciseName ? null : { name: ex.ExerciseName, up: r.bottom > window.innerHeight * 0.62 })); }}
                  style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 32, height: 26, padding: 0, borderRadius: 7, border: `1px solid ${ovColor}`, background: ovColor + "22", cursor: "pointer" }}>
                  <OverloadIcon color={ovColor} />
                </button>
                <span style={{ color: SUB, fontSize: 12 }}>Target {ex.TargetSets}×{ex.TargetReps}</span>
              </div>
            </div>
            {overloadFor && overloadFor.name === ex.ExerciseName && (
              <OverloadPopover name={ex.ExerciseName} status={ovStatus} up={overloadFor.up} onClose={() => setOverloadFor(null)}
                outlook={liftOutlook(effExerciseLog, ex.ExerciseName, dateStr, planOverrides, anchorDate, ex.TargetSets)} />
            )}
            {exRows.map((row, i) => {
              const ph = rowPlaceholder(effExerciseLog, ex.ExerciseName, dateStr, i);
              const timerKey = `${ex.ExerciseName}__${i}`;
              const isTiming = timerRunning[timerKey];
              return (
                <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6, alignItems: "center" }}>
                  <span style={{ fontSize: 12, color: SUB, width: 16 }}>{i + 1}</span>
                  {type === "time" ? (
                    <>
                      <div style={{ flex: 1, padding: 8, borderRadius: 6, background: BG, border: `1px solid ${LINE}`, color: isTiming ? ACCENT : INK, fontFamily: "ui-monospace, Menlo, monospace" }}>
                        {isTiming ? formatSecondsClock(timerElapsed[timerKey]) : row.reps ? formatSecondsClock(row.reps) : ph.reps ? `${formatSecondsClock(ph.reps)} last time` : "0:00"}
                      </div>
                      <button onClick={() => toggleTimer(ex.ExerciseName, i)} style={{ flex: 1, padding: 8, borderRadius: 6, border: "none", background: isTiming ? REDC : ACCENT, color: isTiming ? ON_RED : ON_ACCENT, fontWeight: 700, cursor: "pointer" }}>
                        {isTiming ? "Stop" : "Start"}
                      </button>
                    </>
                  ) : (
                    <input inputMode="numeric" placeholder={ph.reps ? `${ph.reps} reps` : "reps"} value={row.reps} onChange={(e) => updateSetRow(ex.ExerciseName, i, "reps", e.target.value)} style={{ flex: 1, padding: 8, borderRadius: 6, background: BG, border: `1px solid ${LINE}`, color: INK }} />
                  )}
                  {type === "weighted" && (
                    <input inputMode="decimal" placeholder={ph.weight ? `${ph.weight} lb` : "weight"} value={row.weight} onChange={(e) => updateSetRow(ex.ExerciseName, i, "weight", e.target.value)} style={{ flex: 1, padding: 8, borderRadius: 6, background: BG, border: `1px solid ${LINE}`, color: INK }} />
                  )}
                  <Trash2 size={16} style={{ color: REDC, cursor: "pointer" }} onClick={() => removeSetRow(ex.ExerciseName, i)} />
                </div>
              );
            })}
            <button onClick={() => addSetRow(ex.ExerciseName)} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: GOLD, background: "none", border: "none", cursor: "pointer", padding: "4px 0" }}>
              <Plus size={14} /> Add set
            </button>
          </div>
        );
      })}

      {isRunDay && (
        <div style={{ background: CARD, borderRadius: 10, padding: 12 }}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>Run</div>
          <div style={{ display: "flex", gap: 8 }}>
            <input inputMode="decimal" placeholder="distance (mi)" value={runData.Distance} onChange={(e) => setRunField("Distance", e.target.value)} style={{ flex: 1, padding: 8, borderRadius: 6, background: BG, border: `1px solid ${LINE}`, color: INK }} />
            <input placeholder="time (mm:ss)" value={runData.Time} onChange={(e) => setRunField("Time", e.target.value)} style={{ flex: 1, padding: 8, borderRadius: 6, background: BG, border: `1px solid ${LINE}`, color: INK }} />
            <input placeholder="pace (auto)" value={runData.Pace} readOnly title="Calculated automatically from distance and time" style={{ flex: 1, padding: 8, borderRadius: 6, background: BG, border: `1px solid ${LINE}`, color: SUB, cursor: "default" }} />
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <input inputMode="decimal" placeholder="body weight" value={weight} onChange={(e) => { markEdited(); setWeight(e.target.value); }} style={{ padding: 10, borderRadius: 8, background: CARD, border: `1px solid ${LINE}`, color: INK }} />
        <Segmented value={status} onChange={(v) => { markEdited(); setStatus(v); setStatusManual(true); }} options={STATUS_OPTS} />
      </div>
      <textarea placeholder={notesPlaceholder || "notes"} value={notes} onChange={(e) => { markEdited(); setNotes(e.target.value); }} onFocus={handleNotesFocus} onKeyDown={handleNotesKeyDown} rows={6} style={{ padding: 10, borderRadius: 8, background: CARD, border: `1px solid ${LINE}`, color: INK, minHeight: 120, resize: "vertical", fontFamily: "inherit", fontSize: 14, lineHeight: 1.5 }} />

      <button onClick={handleSave} disabled={saving} style={{
        padding: 14, borderRadius: 10, border: "none",
        background: saving ? SLATE : ACCENT, color: ON_ACCENT,
        fontWeight: 700, cursor: saving ? "default" : "pointer",
      }}>
        {saving ? "Saving…" : justSaved ? "Saved ✓" : isEditingHistorical ? "Save & return" : "Save"}
      </button>

      <button onClick={handleSync} disabled={syncing} style={{
        padding: 14, borderRadius: 10,
        border: `1px solid ${pendingCount > 0 ? GOLD : LINE}`,
        background: pendingCount > 0 ? GOLD : CARD,
        color: pendingCount > 0 ? ON_GOLD : INK,
        fontWeight: 700, cursor: syncing ? "default" : "pointer",
        display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
      }}>
        <RefreshCw size={16} className={syncing ? "spin" : ""} />
        {syncing ? "Syncing…" : pendingCount > 0 ? `Sync (${pendingCount} pending)` : "Sync"}
      </button>

      {!isEditingHistorical && (
        <div
          onTouchStart={(e) => { swipeTouchX.current = e.touches[0].clientX; }}
          onTouchEnd={(e) => {
            if (swipeTouchX.current == null) return;
            const dx = e.changedTouches[0].clientX - swipeTouchX.current;
            swipeTouchX.current = null;
            if (Math.abs(dx) < 50) return;
            goToDate(addDays(date, dx < 0 ? 1 : -1));
          }}
          style={{ padding: 14, borderRadius: 10, border: `1px solid ${ACCENT}`, background: "transparent", color: ACCENT, fontWeight: 700, textAlign: "center", userSelect: "none", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
        >
          <ChevronLeft size={16} /> Swipe for another day <ChevronRight size={16} />
        </div>
      )}
    </div>
    {graphFor && (
      <ExerciseGraphModal name={graphFor.name} rows={graphRows} planOverrides={planOverrides} anchorDate={anchorDate}
        onClose={() => { if (Date.now() - graphFor.at > 450) setGraphFor(null); }} />
    )}
    </div>
  );
}

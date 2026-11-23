import React, { useState, useEffect, useMemo } from "react";
import { Settings, Plus, Trash2, X } from "lucide-react";
import { ACCENT, BG, CARD, GOLD, INK, LINE, ON_ACCENT, REDC, SCRIM, SCRIM_LIGHT, SHADOW, SUB } from "./theme.js";
import { CYCLE_ANCHOR, DAYS_OF_WEEK, getEffectiveExercises, planKey } from "./plan.js";
import { buildLiftSessions, colorLiftByTarget, getExerciseMeta } from "./analytics.js";
import { liftChartView } from "./chart.jsx";
import { SLIDE_DEFS } from "./slides.jsx";

export function SettingsModal({ settings, wakeText, onSave, onClose, onOpenPlanEditor }) {
  const [slides, setSlides] = useState(settings.slides);
  const [seconds, setSeconds] = useState(settings.slideSeconds);
  const [enabled, setEnabled] = useState(settings.slideshowEnabled);
  const [abSecs, setAbSecs] = useState(settings.abCycleSeconds || 15);
  const [weightWin, setWeightWin] = useState(settings.weightWindowDays || 21);

  const toggleSlide = (id) => setSlides((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <div style={{ position: "absolute", inset: 0, background: SCRIM, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 20 }}>
      <div style={{ background: CARD, borderRadius: 14, padding: "24px 24px 44px 24px", width: 380, maxHeight: "88%", overflowY: "auto", display: "flex", flexDirection: "column", gap: 12, boxSizing: "border-box" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontWeight: 800, fontSize: 18 }}>Settings</div>
          <X size={20} style={{ cursor: "pointer", color: SUB }} onClick={onClose} />
        </div>
        <div style={{ fontSize: 12, color: SUB, lineHeight: 1.5 }} data-testid="fitness-conn-note">Your Sheet connection (script address and key) is set once for all of Grimoire: home screen, gear, Connection.</div>
        {wakeText && <div style={{ fontSize: 12, color: SUB, lineHeight: 1.5 }} data-testid="fitness-wake-status"><span style={{ color: INK, fontWeight: 600 }}>Keep screen on: </span>{wakeText}</div>}
        <div style={{ borderTop: `1px solid ${LINE}`, marginTop: 6, paddingTop: 12 }}>
          <label style={{ fontSize: 12, color: SUB, display: "block", marginBottom: 8 }}>Slides to display</label>
          {SLIDE_DEFS.map((s) => (
            <label key={s.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, fontSize: 14 }}>
              <input type="checkbox" checked={slides.includes(s.id)} onChange={() => toggleSlide(s.id)} /> {s.label}
            </label>
          ))}
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, marginTop: 6 }}>
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> Auto-advance slideshow
        </label>
        <div>
          <label style={{ fontSize: 12, color: SUB }}>Seconds per slide</label>
          <input type="number" min={5} value={seconds} onChange={(e) => setSeconds(Number(e.target.value))} disabled={!enabled}
            style={{ width: "100%", padding: 10, borderRadius: 8, background: BG, border: `1px solid ${LINE}`, color: INK, opacity: enabled ? 1 : 0.5, marginTop: 4 }} />
        </div>
        <div>
          <label style={{ fontSize: 12, color: SUB }}>Seconds between graph versions A / B (Progress slide)</label>
          <input type="number" min={3} value={abSecs} onChange={(e) => setAbSecs(Number(e.target.value))}
            style={{ width: "100%", padding: 10, borderRadius: 8, background: BG, border: `1px solid ${LINE}`, color: INK, marginTop: 4 }} />
        </div>
        <div>
          <label style={{ fontSize: 12, color: SUB }}>Body weight trend window (days) — shorter reacts faster but colors get unreliable below ~14</label>
          <input type="number" min={5} max={60} value={weightWin} onChange={(e) => setWeightWin(Number(e.target.value))}
            style={{ width: "100%", padding: 10, borderRadius: 8, background: BG, border: `1px solid ${LINE}`, color: INK, marginTop: 4 }} />
        </div>

        <div style={{ borderTop: `1px solid ${LINE}`, marginTop: 6, paddingTop: 12, fontSize: 11, color: SUB }}>Syncing is handled by Grimoire: about once a minute while this app is open, and right after each save.</div>

        <button onClick={() => onSave({ anchorDate: CYCLE_ANCHOR, slides: slides.length ? slides : ["today"], slideSeconds: seconds || 150, slideshowEnabled: enabled, abCycleSeconds: abSecs || 15, weightWindowDays: Math.min(60, Math.max(5, weightWin || 21)) })}
          style={{ padding: 12, borderRadius: 10, border: "none", background: ACCENT, color: ON_ACCENT, fontWeight: 700, marginTop: 8 }}>Save</button>

        <div style={{ borderTop: `1px solid ${LINE}`, marginTop: 4, paddingTop: 12 }}>
          <button onClick={onOpenPlanEditor} style={{ width: "100%", padding: 11, borderRadius: 10, border: `1px solid ${ACCENT}`, background: "transparent", color: ACCENT, fontWeight: 700 }}>Edit workouts</button>
          <div style={{ fontSize: 10, color: SUB, marginTop: 6 }}>Change which lifts happen on a given day of the cycle. Only affects future occurrences — past logs stay as they were.</div>
        </div>

      </div>
    </div>
  );
}

export function PlanEditorModal({ planOverrides, onSave, onClose }) {
  const [week, setWeek] = useState(1);
  const [day, setDay] = useState("Monday");
  const [rows, setRows] = useState(() => getEffectiveExercises(planOverrides, 1, "Monday").map((e) => ({ ExerciseName: e.ExerciseName, TargetSets: e.TargetSets, TargetReps: e.TargetReps, ExerciseType: e.ExerciseType || "weighted" })));

  const loadDay = (wk, dn) => setRows(getEffectiveExercises(planOverrides, wk, dn).map((e) => ({ ExerciseName: e.ExerciseName, TargetSets: e.TargetSets, TargetReps: e.TargetReps, ExerciseType: e.ExerciseType || "weighted" })));

  const changeWeek = (w) => { setWeek(w); loadDay(w, day); };
  const changeDay = (d) => { setDay(d); loadDay(week, d); };

  const updateRow = (i, field, val) => setRows((r) => r.map((row, idx) => (idx === i ? { ...row, [field]: val } : row)));
  const removeRow = (i) => setRows((r) => r.filter((_, idx) => idx !== i));
  const addRow = () => setRows((r) => [...r, { ExerciseName: "", TargetSets: "3", TargetReps: "10", ExerciseType: "weighted" }]);

  const save = () => { onSave(planKey(week, day), rows.filter((r) => r.ExerciseName.trim())); };
  const resetDefault = () => { onSave(planKey(week, day), null); loadDay(week, day); };

  return (
    <div style={{ position: "absolute", inset: 0, background: SCRIM, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 30 }}>
      <div style={{ background: CARD, borderRadius: 14, padding: "22px 22px 40px 22px", width: 380, maxHeight: "88%", overflowY: "auto", display: "flex", flexDirection: "column", gap: 12, boxSizing: "border-box" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontWeight: 800, fontSize: 17 }}>Edit workouts</div>
          <X size={20} style={{ cursor: "pointer", color: SUB }} onClick={onClose} />
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <select value={week} onChange={(e) => changeWeek(Number(e.target.value))} style={{ flex: 1, padding: 8, borderRadius: 8, background: BG, border: `1px solid ${LINE}`, color: INK }}>
            <option value={1}>Week 1</option><option value={2}>Week 2</option>
          </select>
          <select value={day} onChange={(e) => changeDay(e.target.value)} style={{ flex: 1, padding: 8, borderRadius: 8, background: BG, border: `1px solid ${LINE}`, color: INK }}>
            {DAYS_OF_WEEK.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>

        {rows.map((row, i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", gap: 6, paddingBottom: 8, borderBottom: `1px solid ${LINE}` }}>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input value={row.ExerciseName} onChange={(e) => updateRow(i, "ExerciseName", e.target.value)} placeholder="exercise name" style={{ flex: 3, padding: 8, borderRadius: 6, background: BG, border: `1px solid ${LINE}`, color: INK, fontSize: 13 }} />
              <input value={row.TargetSets} onChange={(e) => updateRow(i, "TargetSets", e.target.value)} placeholder="sets" style={{ flex: 1, padding: 8, borderRadius: 6, background: BG, border: `1px solid ${LINE}`, color: INK, fontSize: 13 }} />
              <input value={row.TargetReps} onChange={(e) => updateRow(i, "TargetReps", e.target.value)} placeholder="reps" style={{ flex: 1, padding: 8, borderRadius: 6, background: BG, border: `1px solid ${LINE}`, color: INK, fontSize: 13 }} />
              <Trash2 size={16} style={{ color: REDC, cursor: "pointer", flexShrink: 0 }} onClick={() => removeRow(i)} />
            </div>
            <select value={row.ExerciseType} onChange={(e) => updateRow(i, "ExerciseType", e.target.value)} style={{ padding: 6, borderRadius: 6, background: BG, border: `1px solid ${LINE}`, color: SUB, fontSize: 12 }}>
              <option value="weighted">Reps + weight</option>
              <option value="reps">Reps only (bodyweight)</option>
              <option value="time">Time-based (e.g. plank)</option>
            </select>
          </div>
        ))}
        <button onClick={addRow} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: GOLD, background: "none", border: "none", cursor: "pointer" }}>
          <Plus size={14} /> Add exercise
        </button>

        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button onClick={save} style={{ flex: 1, padding: 12, borderRadius: 10, border: "none", background: ACCENT, color: ON_ACCENT, fontWeight: 700 }}>Save for this day</button>
          <button onClick={resetDefault} style={{ padding: 12, borderRadius: 10, border: `1px solid ${LINE}`, background: "transparent", color: SUB, fontWeight: 700 }}>Reset to default</button>
        </div>
        <div style={{ fontSize: 10, color: SUB }}>Changes apply the next time Week {week} {day} comes around, and every time after. Past logs for this day are untouched.</div>
      </div>
    </div>
  );
}

// Large popup with one exercise's progress graphs. Opens on B; A is one tap away.
// Tap outside it (the slivers of the entry screen) or the X to close.
export function ExerciseGraphModal({ name, rows, planOverrides, anchorDate, onClose }) {
  const [ver, setVer] = useState("B");
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const lift = useMemo(() => {
    const sessions = buildLiftSessions(rows, name);
    return { meta: getExerciseMeta(name, planOverrides), sessions, colored: colorLiftByTarget(sessions, name, planOverrides, anchorDate) };
  }, [rows, name, planOverrides, anchorDate]);
  const v = liftChartView(lift, name, ver);
  const subtitle = v.title.replace(`${name} · `, "");
  return (
    <div data-testid="graph-backdrop" onClick={onClose} style={{ position: "absolute", inset: 0, background: SCRIM_LIGHT, zIndex: 40 }}>
      <div data-testid="graph-modal" onClick={(e) => e.stopPropagation()} style={{ position: "absolute", top: 14, left: 8, right: 8, bottom: "calc(14px + env(safe-area-inset-bottom, 0px))", background: BG, border: `1px solid ${LINE}`, borderRadius: 14, padding: "14px 12px 12px 12px", display: "flex", flexDirection: "column", gap: 8, boxSizing: "border-box", boxShadow: SHADOW }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: INK }}>{name}</div>
            <div style={{ fontSize: 12, color: SUB, marginTop: 2 }}>{subtitle}</div>
          </div>
          {lift.sessions.length > 0 && (
            <div style={{ display: "flex", borderRadius: 20, border: `1px solid ${LINE}`, overflow: "hidden", flexShrink: 0 }}>
              {["A", "B"].map((x) => <button key={x} onClick={() => setVer(x)} style={{ padding: "7px 14px", border: "none", background: ver === x ? GOLD + "33" : "transparent", color: ver === x ? GOLD : SUB, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>{x}</button>)}
            </div>
          )}
          <button aria-label="Close graphs" onClick={onClose} style={{ background: "none", border: "none", color: SUB, cursor: "pointer", padding: 4, flexShrink: 0 }}><X size={22} /></button>
        </div>
        {v.status && <div style={{ fontSize: 13, color: v.statusColor, fontWeight: 600 }}>{v.status}</div>}
        <div key={ver} style={{ flex: "1 1 0", minHeight: 0 }}>{lift.sessions.length ? v.chart : <div style={{ color: SUB, fontSize: 14, padding: 12 }}>No sessions logged for this exercise yet.</div>}</div>
        {v.legend.length > 0 && lift.sessions.length > 0 && <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center", fontSize: 11 }}>{v.legend}</div>}
      </div>
    </div>
  );
}

// Popover from the overload button: what today's numbers earn on the B graph.
export function OverloadPopover({ name, outlook, status, up, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <>
      <div data-testid="overload-backdrop" onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 34, background: "transparent" }} />
      <div data-testid="overload-popover" onClick={(e) => e.stopPropagation()} style={{ position: "absolute", right: 8, ...(up ? { bottom: "calc(100% - 6px)" } : { top: 40 }), width: "min(340px, calc(100% - 16px))", zIndex: 35, background: BG, border: `1px solid ${status ? status.color : LINE}`, borderRadius: 12, padding: 12, boxSizing: "border-box", boxShadow: SHADOW, display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: INK }}>{name} · this session</div>
            {outlook.context && <div style={{ fontSize: 11.5, color: SUB, marginTop: 2 }}>{outlook.context}</div>}
            {status && <div style={{ fontSize: 11.5, color: status.color, marginTop: 2, fontWeight: 600 }}>{status.isToday ? "Today" : "Current"}: {status.label}</div>}
          </div>
          <button aria-label="Close" onClick={onClose} style={{ background: "none", border: "none", color: SUB, cursor: "pointer", padding: 2, flexShrink: 0 }}><X size={18} /></button>
        </div>
        {outlook.lines.map((l) => (
          <div key={l.color} data-testid="overload-line" style={{ display: "flex", gap: 8, alignItems: "flex-start", opacity: l.possible ? 1 : 0.55 }}>
            <div style={{ width: 10, height: 10, borderRadius: 3, background: l.color, marginTop: 4, flexShrink: 0 }} />
            <div style={{ fontSize: 12.5, lineHeight: 1.4 }}>
              <span style={{ color: l.color, fontWeight: 700 }}>{l.name}: </span>
              <span style={{ color: l.possible ? INK : SUB }}>{l.text}</span>
            </div>
          </div>
        ))}
        {outlook.mode === "cycle" && <div style={{ fontSize: 10.5, color: SUB }}>Reps = what most of your sets hit. Weight = average across sets.</div>}
      </div>
    </>
  );
}

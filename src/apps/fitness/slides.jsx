import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { ACCENT, BG, CARD, GOLD, INK, LINE, ON_GOLD, REDC, SCRIM, SUB, WHITE_C } from "./theme.js";
import { PLAN_DAYS, getEffectiveExercises, getPlanTypeForDate, getWeekNumber } from "./plan.js";
import { addDays, dayIndex, dayName, fmtDate, formatPace, idxLabel, signed, startOfWeek } from "./dates.js";
import { effectiveStatus, statusColor } from "./logic.js";
import { GOAL_HIGH, GOAL_LOW, buildLiftSessions, colorLiftByTarget, computeConsistency, computeRunSeries, computeWeightAnalysis, getExerciseMeta } from "./analytics.js";
import { ChartPinContext, LegendChip, SvgChart, liftChartView } from "./chart.jsx";

export function TodaySlide({ date, weekNum, planDay, exercises, dailyLog }) {
  const existing = dailyLog.find((r) => r.Date === fmtDate(date));
  const eff = effectiveStatus(planDay?.Type, existing);
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", padding: 28, gap: 20, overflowY: "auto" }}>
      <div>
        <div style={{ fontSize: 13, letterSpacing: 1.5, color: ACCENT, fontWeight: 700, textTransform: "uppercase" }}>Week {weekNum} &middot; {planDay?.Type || "—"}</div>
        <div style={{ fontSize: 34, fontWeight: 800, fontFamily: "Arial Narrow, Arial, sans-serif", letterSpacing: 0.5 }}>
          {date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
        </div>
        <div style={{ fontSize: 15, color: SUB, marginTop: 4 }}>{planDay?.MuscleGroups || "—"}{planDay?.Notes ? ` · ${planDay.Notes}` : ""}</div>
      </div>
      {exercises.length > 0 && (
        <div style={{ background: CARD, borderRadius: 12, padding: "6px 16px" }}>
          {exercises.map((ex, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "12px 0", borderBottom: i < exercises.length - 1 ? `1px solid ${LINE}` : "none" }}>
              <span style={{ fontSize: 15 }}>{ex.ExerciseName}</span>
              <span style={{ fontFamily: "ui-monospace, Menlo, monospace", color: SUB, fontSize: 14 }}>{ex.TargetSets} × {ex.TargetReps}</span>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: "auto" }}>
        <div>
          <div style={{ fontSize: 12, color: SUB, marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>Weight</div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{existing?.Weight ? `${existing.Weight} lb` : "—"}</div>
        </div>
        <div>
          <div style={{ fontSize: 12, color: SUB, marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>Status</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: statusColor(eff) }}>{eff === "None" ? "Not logged" : eff}</div>
        </div>
      </div>
      <div style={{ fontSize: 12, color: SUB, fontStyle: "italic" }}>Read-only display &middot; log sets, weight and notes from phone mode.</div>
    </div>
  );
}

export function WeekSlide({ date, anchorDate, dailyLog, exerciseLog, calendarNotes, onSaveNote, onNav, planOverrides, onEditDay }) {
  const [editingDate, setEditingDate] = useState(null);
  const monday = startOfWeek(date);
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(monday); d.setDate(d.getDate() + i); return d; });
  const today = fmtDate(new Date());
  const endOfW = addDays(monday, 6);
  const label = `${monday.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${endOfW.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", padding: 28, gap: 16, overflowY: "auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontSize: 26, fontWeight: 800 }}>{label}</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <ChevronLeft size={24} style={{ cursor: "pointer", color: SUB }} onClick={() => onNav(-1)} />
          <span onClick={() => onNav("today")} style={{ fontSize: 15, color: ACCENT, cursor: "pointer", fontWeight: 700 }}>Today</span>
          <ChevronRight size={24} style={{ cursor: "pointer", color: SUB }} onClick={() => onNav(1)} />
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 10 }}>
        {days.map((d) => {
          const wk = getWeekNumber(d, anchorDate);
          const dn = dayName(d);
          const plan = PLAN_DAYS.find((p) => p.Week === wk && p.DayOfWeek === dn);
          const exList = getEffectiveExercises(planOverrides, wk, dn);
          const ds = fmtDate(d);
          const log = dailyLog.find((r) => r.Date === ds);
          const note = calendarNotes?.[ds];
          const isPast = ds < today, isToday = ds === today;
          const color = isPast || isToday ? statusColor(effectiveStatus(plan?.Type, log)) : LINE;
          return (
            <div key={ds} onClick={() => setEditingDate(ds)} style={{ cursor: "pointer", display: "flex", flexDirection: "column", background: CARD, borderRadius: 10, padding: 12, border: isToday ? `2px solid ${ACCENT}` : `1px solid ${LINE}` }}>
              <div style={{ fontSize: 15, color: SUB, textTransform: "uppercase", letterSpacing: 1 }}>{dn.slice(0, 3)} {d.getDate()}</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: ACCENT, margin: "4px 0" }}>{plan?.Type}</div>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 3 }}>
                {exList.length > 0 ? exList.map((e, i) => (
                  <div key={i} style={{ fontSize: 14.5, color: SUB, lineHeight: 1.5, display: "flex", gap: 4 }}>
                    <span style={{ color: GOLD, flexShrink: 0 }}>&#9656;</span>{e.ExerciseName}
                  </div>
                )) : <div style={{ fontSize: 15, color: SUB }}>{plan?.Notes || plan?.MuscleGroups}</div>}
              </div>
              {note && <div style={{ fontSize: 14.5, color: GOLD, fontStyle: "italic", marginTop: 6, borderTop: `1px solid ${LINE}`, paddingTop: 6 }}>&#9733; {note}</div>}
              <div style={{ width: "100%", height: 5, borderRadius: 3, background: (isPast || isToday) ? color : "transparent", marginTop: 8 }} />
            </div>
          );
        })}
      </div>
      {editingDate && (
        <DayDetailModal dateStr={editingDate} initialNote={calendarNotes?.[editingDate]}
          isPast={editingDate < today}
          planType={getPlanTypeForDate(editingDate, anchorDate)}
          dailyEntry={dailyLog.find((r) => r.Date === editingDate)}
          exerciseEntries={exerciseLog.filter((r) => r.Date === editingDate)}
          onClose={() => setEditingDate(null)}
          onSave={(text) => { onSaveNote(editingDate, text); setEditingDate(null); }}
          onClear={() => { onSaveNote(editingDate, ""); setEditingDate(null); }}
          onEdit={(ds) => { onEditDay(ds); setEditingDate(null); }} />
      )}
    </div>
  );
}

export function DayDetailModal({ dateStr, initialNote, dailyEntry, exerciseEntries, isPast, planType, onSave, onClear, onClose, onEdit }) {
  const [text, setText] = useState(initialNote || "");
  const grouped = exerciseEntries.reduce((acc, r) => { (acc[r.ExerciseName] = acc[r.ExerciseName] || []).push(r); return acc; }, {});
  const eff = effectiveStatus(planType, dailyEntry);
  return (
    <div style={{ position: "absolute", inset: 0, background: SCRIM, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 25 }}>
      <div style={{ background: CARD, borderRadius: 14, padding: "22px 22px 40px 22px", width: 340, maxHeight: "85%", overflowY: "auto", display: "flex", flexDirection: "column", gap: 12, boxSizing: "border-box" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontWeight: 800, fontSize: 15 }}>{new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}</div>
          <X size={18} style={{ cursor: "pointer", color: SUB }} onClick={onClose} />
        </div>

        {(
          <div style={{ background: BG, borderRadius: 10, padding: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div style={{ fontSize: 11, color: SUB, textTransform: "uppercase", letterSpacing: 1 }}>{isPast ? "What you did" : "Workout"}</div>
              {planType !== "Rest" && <button onClick={() => onEdit(dateStr)} style={{ fontSize: 11, color: ACCENT, background: "none", border: `1px solid ${ACCENT}`, borderRadius: 6, padding: "3px 8px", cursor: "pointer", fontWeight: 700 }}>Edit</button>}
            </div>
            {dailyEntry ? (
              <>
                <div style={{ display: "flex", gap: 16, marginBottom: Object.keys(grouped).length ? 10 : 0, fontSize: 13 }}>
                  <span>Weight: <b>{dailyEntry.Weight || "—"}</b></span>
                  <span style={{ color: statusColor(eff) }}>{eff}</span>
                </div>
                {dailyEntry.Notes && <div style={{ fontSize: 12, color: SUB, marginBottom: 10, fontStyle: "italic" }}>&ldquo;{dailyEntry.Notes}&rdquo;</div>}
                {Object.entries(grouped).map(([name, rows]) => (
                  <div key={name} style={{ marginBottom: 6 }}>
                    <div style={{ fontSize: 12, fontWeight: 600 }}>{name}</div>
                    <div style={{ fontSize: 11, color: SUB, fontFamily: "ui-monospace, Menlo, monospace" }}>
                      {rows.sort((a, b) => Number(a.SetNumber) - Number(b.SetNumber)).map((r) => `${r.Reps}x${r.Weight}`).join("  ·  ")}
                    </div>
                  </div>
                ))}
              </>
            ) : planType === "Rest" ? (
              <div style={{ fontSize: 12, color: statusColor("Complete") }}>Rest day — nothing to log.</div>
            ) : <div style={{ fontSize: 12, color: SUB }}>{isPast ? "Nothing logged for this day." : "Nothing logged yet."}</div>}
          </div>
        )}

        <div style={{ fontSize: 11, color: SUB }}>One-off note for this date. Shown on week view, not tracked in reporting.</div>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder="e.g. Paddle boarding with Sam, 2pm"
          style={{ padding: 10, borderRadius: 8, background: BG, border: `1px solid ${LINE}`, color: INK, resize: "vertical" }} />
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => onSave(text)} style={{ flex: 1, padding: 11, borderRadius: 10, border: "none", background: GOLD, color: ON_GOLD, fontWeight: 700 }}>Save note</button>
          {initialNote && <button onClick={onClear} style={{ padding: 11, borderRadius: 10, border: `1px solid ${REDC}`, background: "transparent", color: REDC, fontWeight: 700 }}>Clear</button>}
        </div>
      </div>
    </div>
  );
}

export function MonthSlide({ date, anchorDate, dailyLog, exerciseLog, calendarNotes, onSaveNote, onNav, onEditDay }) {
  const [editingDate, setEditingDate] = useState(null);
  const year = date.getFullYear(), month = date.getMonth();
  const first = new Date(year, month, 1);
  const startOffset = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  const today = fmtDate(new Date());

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", padding: "16px 20px", gap: 10, position: "relative", boxSizing: "border-box" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontSize: 26, fontWeight: 800 }}>{date.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <ChevronLeft size={24} style={{ cursor: "pointer", color: SUB }} onClick={() => onNav(-1)} />
          <span onClick={() => onNav("today")} style={{ fontSize: 15, color: ACCENT, cursor: "pointer", fontWeight: 700 }}>Today</span>
          <ChevronRight size={24} style={{ cursor: "pointer", color: SUB }} onClick={() => onNav(1)} />
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6, fontSize: 15, color: SUB, textTransform: "uppercase" }}>
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} style={{ textAlign: "center" }}>{d}</div>)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gridAutoRows: "minmax(0, 1fr)", gap: 6, flex: "1 1 0", minHeight: 0 }}>
        {cells.map((d, i) => {
          if (!d) return <div key={i} />;
          const wk = getWeekNumber(d, anchorDate);
          const plan = PLAN_DAYS.find((p) => p.Week === wk && p.DayOfWeek === dayName(d));
          const label = plan?.MuscleGroups ? plan.MuscleGroups : plan?.Type;
          const ds = fmtDate(d);
          const log = dailyLog.find((r) => r.Date === ds);
          const note = calendarNotes?.[ds];
          const isPast = ds < today, isToday = ds === today;
          const color = isPast || isToday ? statusColor(effectiveStatus(plan?.Type, log)) : LINE;
          return (
            <div key={i} onClick={() => setEditingDate(ds)} style={{ position: "relative", cursor: "pointer", background: CARD, borderRadius: 8, padding: 8, display: "flex", flexDirection: "column", border: isToday ? `2px solid ${ACCENT}` : `1px solid ${LINE}`, fontSize: 14, overflow: "hidden", minHeight: 0, minWidth: 0 }}>
              <div style={{ fontSize: 17, fontWeight: 700 }}>{d.getDate()}</div>
              <div style={{ color: SUB, flex: 1, overflow: "hidden", fontSize: 14 }}>{label}</div>
              {note && <div style={{ color: GOLD, fontSize: 13, fontStyle: "italic", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>&#9733; {note}</div>}
              <div style={{ width: "100%", height: 4, borderRadius: 2, background: (isPast || isToday) ? color : "transparent" }} />
            </div>
          );
        })}
      </div>
      {editingDate && (
        <DayDetailModal dateStr={editingDate} initialNote={calendarNotes?.[editingDate]}
          isPast={editingDate < today}
          planType={getPlanTypeForDate(editingDate, anchorDate)}
          dailyEntry={dailyLog.find((r) => r.Date === editingDate)}
          exerciseEntries={exerciseLog.filter((r) => r.Date === editingDate)}
          onClose={() => setEditingDate(null)}
          onSave={(text) => { onSaveNote(editingDate, text); setEditingDate(null); }}
          onClear={() => { onSaveNote(editingDate, ""); setEditingDate(null); }}
          onEdit={(ds) => { onEditDay(ds); setEditingDate(null); }} />
      )}
    </div>
  );
}

export function ProgressSlide({ dailyLog, exerciseLog, runLog, anchorDate, planOverrides, abSeconds, weightWindow = 21 }) {
  const todayIdx = dayIndex(fmtDate(new Date()));
  const liftNames = useMemo(() => [...new Set(exerciseLog.filter((r) => parseFloat(r.Reps) > 0 && r.ExerciseName).map((r) => r.ExerciseName))].sort(), [exerciseLog]);
  const [tab, setTab] = useState(() => ["weight", "completion", "exercise", "run"][Math.floor(Math.random() * 4)]);
  const [exSel, setExSel] = useState(() => (liftNames.length ? liftNames[Math.floor(Math.random() * liftNames.length)] : ""));
  useEffect(() => { if (liftNames.length && !liftNames.includes(exSel)) setExSel(liftNames[Math.floor(Math.random() * liftNames.length)]); }, [liftNames]);

  const hasB = tab === "completion" || tab === "exercise";
  const [ver, setVer] = useState("A");
  const pinnedRef = useRef(false); // a tapped-point readout is open: don't swap A/B out from under it
  const setPinned = useCallback((v) => { pinnedRef.current = v; }, []);
  useEffect(() => {
    setVer("A");
    if (!hasB) return undefined;
    const ms = Math.max(3, Number(abSeconds) || 15) * 1000;
    const id = setInterval(() => { if (!pinnedRef.current) setVer((v) => (v === "A" ? "B" : "A")); }, ms);
    return () => clearInterval(id);
  }, [tab, exSel, hasB, abSeconds]);

  const weight = useMemo(() => (tab === "weight" ? computeWeightAnalysis(dailyLog, todayIdx, weightWindow) : null), [tab, dailyLog, todayIdx, weightWindow]);
  const cons = useMemo(() => (tab === "completion" ? computeConsistency(dailyLog, exerciseLog, anchorDate, todayIdx) : null), [tab, dailyLog, exerciseLog, anchorDate, todayIdx]);
  const lift = useMemo(() => {
    if (tab !== "exercise" || !exSel) return null;
    const meta = getExerciseMeta(exSel, planOverrides);
    const sessions = buildLiftSessions(exerciseLog, exSel);
    return { meta, sessions, colored: colorLiftByTarget(sessions, exSel, planOverrides, anchorDate) };
  }, [tab, exSel, exerciseLog, planOverrides, anchorDate]);
  const run = useMemo(() => (tab === "run" ? computeRunSeries(runLog) : null), [tab, runLog]);

  const tabs = [{ id: "weight", label: "Body weight" }, { id: "completion", label: "Consistency" }, { id: "exercise", label: "Lift progress" }, { id: "run", label: "Run pace" }];
  let title = "", status = null, statusColor = SUB, legend = [], chart = null;

  if (tab === "weight" && weight) {
    title = `Body weight · ${weightWindow}-day trend · ${weight.maintenance ? "Maintenance" : "Cutting"}`;
    if (weight.lastReal) {
      const l = weight.latest, r = weight.lastReal;
      statusColor = l.rainbow ? ACCENT : l.color;
      const rate = l.slopeWk !== null ? `trend ${signed(l.slopeWk)} lb/wk` : "trend —";
      status = `Last weigh-in ${r.v.toFixed(1)} lb (${idxLabel(r.t)}) · ${rate} · ${l.label}${l.dashed ? ` · dashed = projection to today` : ""}`;
    } else status = "Log a few weigh-ins to build the trend.";
    legend = weight.maintenance
      ? [<LegendChip key="r" rainbow label="In range" />, <LegendChip key="g" color={GOLD} label="1–2 lb over" />, <LegendChip key="rd" color={REDC} label="Under 175 / 2+ lb over" />]
      : [<LegendChip key="b" color={ACCENT} label="1–2 lb/wk" />, <LegendChip key="g" color={GOLD} label="Under 1 lb/wk" />, <LegendChip key="rd" color={REDC} label="Stalled / gaining" />, <LegendChip key="w" color={WHITE_C} label="Over 2 lb/wk" />];
    if (weight.line.some((p) => p.color === SUB)) legend.push(<LegendChip key="n" color={SUB} label="Not enough data for a trend" />);
    legend.push(<LegendChip key="p" dashed label="Projected (today only)" />, <LegendChip key="d" dot color={INK} label="Weigh-ins" />);
    const rb = weight.rainbowMap;
    chart = <SvgChart series={[
      { points: weight.line, width: 4, curve: true, endColor: true, straightOverDays: 3, noTip: true, colorAt: (t, p1, p2) => (p1.rainbow && p2.rainbow ? rb.get(t) : null) },
      { points: weight.raw, noLine: true, dots: true, dotColor: INK, dotR: 3, opacity: 0.85, tip: (p) => {
        const l = weight.line.find((q) => q.t === p.t && !q.dashed);
        const trend = l && l.slopeWk !== null ? `Trend ${signed(l.slopeWk)} lb/wk` : "Trend not available yet";
        return [`Weigh-in: ${p.v.toFixed(1)} lb`, l ? `${trend} · ${l.label}` : ""];
      } },
    ]} left={{ label: "Weight (lb)", format: (v) => Math.round(v) }} xLabel="Date" bands={[{ from: GOAL_LOW, to: GOAL_HIGH, color: ACCENT }]} />;
  } else if (tab === "completion" && cons) {
    if (ver === "A") {
      title = "Consistency · A · 7-day completion rate (scheduled days)";
      const l = cons.level[cons.level.length - 1];
      if (l) { status = `${Math.round(l.v)}% of scheduled sessions · ${l.label}`; statusColor = l.color; }
      legend = [<LegendChip key="b" color={ACCENT} label="90%+" />, <LegendChip key="g" color={GOLD} label="70–89%" />, <LegendChip key="r" color={REDC} label="Under 70%" />];
      chart = <SvgChart series={[{ points: cons.level, width: 4, tip: (p) => [`${Math.round(p.v)}% of scheduled sessions (7 days)`, p.label] }]} left={{ format: (v) => `${Math.round(v)}%`, min: 0, max: 100, clampMin: 0, clampMax: 100 }} xLabel="Date" bands={[{ from: 90, to: 100, color: ACCENT }]} />;
    } else {
      title = "Consistency · B · Rate of change (points per week)";
      const l = cons.rate[cons.rate.length - 1];
      if (l) { status = `${signed(l.v, 0)} pts/wk · ${l.label}`; statusColor = l.color; }
      legend = [<LegendChip key="b" color={ACCENT} label="Rising / holding 90%+" />, <LegendChip key="g" color={GOLD} label="Flat" />, <LegendChip key="r" color={REDC} label="Falling" />];
      chart = <SvgChart series={[{ points: cons.rate, width: 4, tip: (p) => [`${signed(p.v, 0)} pts/wk`, `${p.label} · 7-day level ${Math.round(p.level)}%`] }]} left={{ format: (v) => signed(v, 0) }} xLabel="Date" refLines={[{ value: 0 }]} />;
    }
  } else if (tab === "exercise") {
    ({ title, status, statusColor, legend, chart } = liftChartView(lift, exSel, ver));
  } else if (tab === "run" && run) {
    title = "Run · Pace and distance";
    const lp = run.pace[run.pace.length - 1], ld = run.dist[run.dist.length - 1];
    status = lp || ld ? `Latest: ${ld ? `${ld.v.toFixed(2)} mi` : "—"}${lp ? ` @ ${formatPace(lp.v)}/mi` : ""}` : "No runs logged yet.";
    legend = [<LegendChip key="p" color={GOLD} label="Pace (faster is higher)" />, <LegendChip key="d" color={ACCENT} label="Distance" />];
    chart = <SvgChart series={[{ points: run.pace, color: GOLD, dots: true, name: "Pace", fmt: (v) => `${formatPace(v)} /mi` }, { axis: "right", points: run.dist, color: ACCENT, dots: true, name: "Distance", fmt: (v) => `${v.toFixed(2)} mi` }]} left={{ label: "Pace (min/mi)", color: GOLD, reversed: true, format: formatPace }} right={{ label: "Distance (mi)", color: ACCENT, format: (v) => Math.round(v * 10) / 10 }} xLabel="Date" />;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", padding: "20px 28px 40px 28px", gap: 10, boxSizing: "border-box" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ fontSize: 24, fontWeight: 800, marginRight: 6 }}>Progress</div>
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{ padding: "7px 14px", borderRadius: 20, border: `1px solid ${tab === t.id ? ACCENT : LINE}`, background: tab === t.id ? ACCENT + "22" : "transparent", color: tab === t.id ? ACCENT : SUB, fontSize: 13, cursor: "pointer" }}>{t.label}</button>
        ))}
        {tab === "exercise" && liftNames.length > 0 && (
          <select value={exSel} onChange={(e) => setExSel(e.target.value)} style={{ padding: 8, borderRadius: 8, background: CARD, color: INK, border: `1px solid ${LINE}`, maxWidth: 240 }}>
            {liftNames.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        )}
        {hasB && (
          <div style={{ display: "flex", borderRadius: 20, border: `1px solid ${LINE}`, overflow: "hidden", marginLeft: "auto" }}>
            {["A", "B"].map((v) => <button key={v} onClick={() => setVer(v)} style={{ padding: "6px 14px", border: "none", background: ver === v ? GOLD + "33" : "transparent", color: ver === v ? GOLD : SUB, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>{v}</button>)}
          </div>
        )}
      </div>
      <div style={{ fontSize: 16, fontWeight: 700 }}>{title}</div>
      {status && <div style={{ fontSize: 14, color: statusColor, fontWeight: 600 }}>{status}</div>}
      <div key={`${tab}|${exSel}|${ver}`} style={{ flex: "1 1 0", minHeight: 0 }}><ChartPinContext.Provider value={setPinned}>{chart}</ChartPinContext.Provider></div>
      {legend.length > 0 && <div style={{ display: "flex", gap: 16, flexWrap: "wrap", justifyContent: "center" }}>{legend}</div>}
    </div>
  );
}

export const SLIDE_DEFS = [{ id: "today", label: "Today" }, { id: "week", label: "Week" }, { id: "month", label: "Month" }, { id: "progress", label: "Progress" }];

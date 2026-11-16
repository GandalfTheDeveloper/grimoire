import { ACCENT, GOLD, RAINBOW, REDC, SUB, WHITE_C } from "./theme.js";
import { PLAN_EXERCISES, classifyExerciseType, getEffectiveExercises, getPlanTypeForDate, getWeekNumber, parseTargetSets } from "./plan.js";
import { DATE_RE, dayIndex, dayName, formatSecondsClock, idxLabel, idxToDateStr, meanOf, parseClock } from "./dates.js";

export const GOAL_LOW = 175; // goal range is 175-179 inclusive (trend values are continuous)
export const GOAL_HIGH = 179;
export const GOLD_CEILING = 181; // up to 2 lb above the range = gold, beyond = red
export const MAINT_STREAK_DAYS = 14;
// Ordinary least squares on {x, y}; returns value at x=0 (a) and slope (b).
export function linFit(pts) {
  const mx = meanOf(pts.map((p) => p.x)), my = meanOf(pts.map((p) => p.y));
  let sxx = 0, sxy = 0;
  pts.forEach((p) => { sxx += (p.x - mx) * (p.x - mx); sxy += (p.x - mx) * (p.y - my); });
  const b = sxx > 0 ? sxy / sxx : 0;
  return { a: my - b * mx, b };
}

// Regression over the trailing `base` days ending at day d, using real
// elapsed days as x. Needs `minPts` points; if the base window is too sparse
// it widens backward (up to maxSpan days) until it has enough.
export function windowFit(pts, d, base = 7, maxSpan = 30, minPts = 3) {
  const cand = pts.filter((p) => p.t <= d && p.t > d - maxSpan);
  if (cand.length < 2) return null;
  let span = base;
  if (cand.filter((p) => p.t > d - base).length < minPts) span = cand.length >= minPts ? d - cand[cand.length - minPts].t + 1 : maxSpan;
  const win = cand.filter((p) => p.t > d - span);
  if (win.length < 2) return null;
  const f = linFit(win.map((p) => ({ x: p.t - d, y: p.v })));
  // The fitted level is clamped to what was actually weighed in this window:
  // a straight line through a descent-then-plateau undershoots the kink, and
  // the trend must never claim a weight lower/higher than any real weigh-in.
  const vals = win.map((p) => p.v);
  return { value: Math.min(Math.max(f.a, Math.min(...vals)), Math.max(...vals)), slope: f.b };
}

// Deterministic "random" color runs so the rainbow is stable across reloads.
export function mulberry32(a) { return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export function buildRainbowMap(startT, endT) {
  const rand = mulberry32(20260921);
  const map = new Map();
  let t = dayIndex("2025-01-01");
  while (t <= endT) {
    const len = 1 + Math.floor(rand() * 3);
    const c = RAINBOW[Math.floor(rand() * RAINBOW.length)];
    for (let k = 0; k < len && t <= endT; k++, t++) if (t >= startT) map.set(t, c);
  }
  return map;
}

export function weightColor(v, slopeWk, maintenance, t, rainbowMap) {
  if (v < GOAL_LOW) return { color: REDC, label: "Below goal range" };
  if (maintenance) {
    if (v <= GOAL_HIGH) return { color: rainbowMap.get(t) || ACCENT, label: "Holding goal range" };
    if (v <= GOLD_CEILING) return { color: GOLD, label: "Slightly above goal range" };
    return { color: REDC, label: "Above goal range" };
  }
  if (v <= GOAL_HIGH) return { color: ACCENT, label: "In goal range" };
  if (slopeWk < -2) return { color: WHITE_C, label: "Losing faster than 2 lb/wk" };
  if (slopeWk <= -1) return { color: ACCENT, label: "On pace (1–2 lb/wk)" };
  if (slopeWk < -0.25) return { color: GOLD, label: "Losing, under pace" };
  return { color: REDC, label: "Stalled or gaining" };
}

// The LINE only ever connects real weigh-ins (plus one dashed segment from the
// last weigh-in to today). The regression is used for COLOR only, evaluated
// at real weigh-in dates — it never draws values where no data exists.
export function computeWeightAnalysis(dailyLog, todayIdx, windowDays = 10) {
  const byDay = new Map();
  dailyLog.forEach((r) => {
    const w = parseFloat(r.Weight);
    if (DATE_RE.test(String(r.Date)) && !isNaN(w) && w > 50 && w < 700) byDay.set(dayIndex(r.Date), w);
  });
  const raw = [...byDay.entries()].map(([t, v]) => ({ t, v })).sort((a, b) => a.t - b.t);
  if (!raw.length) return { raw, line: [], latest: null, lastReal: null, maintenance: false, rainbowMap: new Map() };
  const lastT = raw[raw.length - 1].t;
  const rainbowMap = buildRainbowMap(raw[0].t, Math.max(todayIdx, lastT) + 1);
  // Widen the window over sparse stretches, but never reach back more than ~6
  // weeks — past that there's no recent trend to measure.
  const maxSpan = Math.max(42, windowDays * 2);

  let maintenance = false, maintStart = null, runStart = null, prevT = null;
  const line = raw.map((p) => {
    const f = windowFit(raw, p.t, windowDays, maxSpan);
    const trendV = f ? f.value : p.v;
    const slopeWk = f ? f.slope * 7 : null;
    // Maintenance: trend held inside the goal range for 14+ days, with no
    // gap longer than a week between weigh-ins (a gap breaks "consistently").
    if (!maintenance) {
      const inRange = f !== null && trendV >= GOAL_LOW && trendV <= GOAL_HIGH;
      if (!inRange) runStart = null;
      else if (runStart === null || (prevT !== null && p.t - prevT > 7)) runStart = p.t;
      if (runStart !== null && p.t - runStart >= MAINT_STREAK_DAYS) { maintenance = true; maintStart = p.t; }
    }
    prevT = p.t;
    const inMaint = maintenance && p.t > maintStart;
    let c;
    if (f) c = weightColor(trendV, slopeWk, inMaint, p.t, rainbowMap);
    else if (inMaint || trendV < GOAL_LOW || trendV <= GOAL_HIGH) c = weightColor(trendV, 0, inMaint, p.t, rainbowMap);
    else c = { color: SUB, label: "Not enough recent weigh-ins for a trend" };
    const rainbow = inMaint && trendV >= GOAL_LOW && trendV <= GOAL_HIGH;
    return { t: p.t, v: p.v, trendV, slopeWk, inMaint, rainbow, dashed: false, ...c };
  });

  const lastReal = line[line.length - 1];
  let latest = lastReal;
  if (todayIdx > lastT) {
    // Best guess for today only: continue from the last real weigh-in at the
    // current trend rate. Replaced by a real point as soon as today is logged.
    const slope = lastReal.slopeWk !== null ? lastReal.slopeWk : 0;
    const gap = todayIdx - lastT;
    const projTrend = lastReal.trendV + (slope / 7) * gap;
    const inMaint = maintenance;
    const c = lastReal.slopeWk !== null || inMaint ? weightColor(projTrend, slope, inMaint, todayIdx, rainbowMap) : { color: lastReal.color, label: lastReal.label };
    latest = { t: todayIdx, v: lastReal.v + (slope / 7) * gap, trendV: projTrend, slopeWk: lastReal.slopeWk, inMaint, rainbow: inMaint && projTrend >= GOAL_LOW && projTrend <= GOAL_HIGH, dashed: true, ...c };
    line.push(latest);
  }
  return { raw, line, latest, lastReal, maintenance, rainbowMap };
}

export function computeConsistency(dailyLog, exerciseLog, anchorDate, todayIdx) {
  const status = new Map();
  dailyLog.forEach((r) => { if (DATE_RE.test(String(r.Date))) status.set(dayIndex(r.Date), r.CompletionStatus); });
  let start = Infinity;
  [...dailyLog, ...exerciseLog].forEach((r) => { if (DATE_RE.test(String(r.Date))) start = Math.min(start, dayIndex(r.Date)); });
  if (!isFinite(start)) return { level: [], rate: [] };
  const scored = [];
  for (let d = start; d <= todayIdx; d++) {
    const type = getPlanTypeForDate(idxToDateStr(d), anchorDate);
    if (!type || type === "Rest") continue;
    const s = status.get(d);
    if (d === todayIdx && !s) continue; // today is still in progress
    scored.push({ t: d, v: s === "Complete" ? 1 : s === "Partial" ? 0.5 : 0 });
  }
  const level = [];
  for (let d = start; d <= todayIdx; d++) {
    const win = scored.filter((p) => p.t <= d && p.t > d - 7);
    if (!win.length) continue;
    const v = meanOf(win.map((p) => p.v)) * 100;
    level.push({ t: d, v, color: v >= 90 ? ACCENT : v >= 70 ? GOLD : REDC, label: v >= 90 ? "Consistent" : v >= 70 ? "Some misses" : "Falling off" });
  }
  const rate = [];
  level.forEach((p) => {
    const win = level.filter((q) => q.t <= p.t && q.t > p.t - 7);
    if (win.length < 3) return;
    const r = linFit(win.map((q) => ({ x: q.t - p.t, y: q.v }))).b * 7;
    // Flat while already at 90%+ counts as blue: there's no higher to go.
    const up = r > 5, down = r < -5;
    rate.push({ t: p.t, v: r, level: p.v, color: up ? ACCENT : down ? REDC : p.v >= 90 ? ACCENT : GOLD, label: up ? "Trending up" : down ? "Trending down" : p.v >= 90 ? "Holding high" : "Flat" });
  });
  return { level, rate };
}

export function parseTargetLow(tr) { const s = String(tr || ""); if (/s\s*$/i.test(s)) return NaN; const m = s.match(/^\s*(\d+)/); return m ? Number(m[1]) : NaN; }
export function getExerciseMeta(name, planOverrides) {
  for (const rows of Object.values(planOverrides || {})) {
    const f = (rows || []).find((r) => r.ExerciseName === name);
    if (f) return { targetReps: f.TargetReps, type: f.ExerciseType || classifyExerciseType(name, f.TargetReps) };
  }
  const p = PLAN_EXERCISES.find((e) => e.ExerciseName === name);
  if (p) return { targetReps: p.TargetReps, type: p.ExerciseType };
  return { targetReps: "", type: classifyExerciseType(name, "") };
}

export function buildLiftSessions(exerciseLog, name) {
  const dedup = new Map();
  exerciseLog.forEach((r) => { if (r.ExerciseName === name && DATE_RE.test(String(r.Date))) dedup.set(`${r.Date}|${r.SetNumber}`, r); });
  const byDate = new Map();
  dedup.forEach((r) => {
    const reps = parseFloat(r.Reps);
    if (isNaN(reps) || reps <= 0) return;
    const w = parseFloat(r.Weight);
    if (!byDate.has(r.Date)) byDate.set(r.Date, []);
    byDate.get(r.Date).push({ reps, w: isNaN(w) || w <= 0 ? null : w });
  });
  return [...byDate.entries()].map(([date, sets]) => {
    const reps = sets.map((s) => s.reps);
    const ws = sets.map((s) => s.w).filter((w) => w !== null);
    const counts = {};
    reps.forEach((r) => { counts[r] = (counts[r] || 0) + 1; });
    const maxCount = Math.max(...Object.values(counts));
    const modeReps = Math.min(...Object.keys(counts).filter((k) => counts[k] === maxCount).map(Number));
    const totalReps = reps.reduce((a, b) => a + b, 0);
    return {
      t: dayIndex(date), sets: sets.length, weighted: ws.length > 0,
      avgW: ws.length ? meanOf(ws) : 0, avgReps: meanOf(reps), modeReps, totalReps, longest: Math.max(...reps),
      volume: ws.length ? sets.reduce((a, s) => a + s.reps * (s.w || 0), 0) : totalReps,
    };
  }).sort((a, b) => a.t - b.t);
}

// B-graph coloring. Weighted exercises with a rep target follow the
// double-progression cycle; everything else compares totals week over week.
export function colorLiftSessions(sessions, meta) {
  const target = parseTargetLow(meta.targetReps);
  const useCycle = meta.type === "weighted" && !isNaN(target) && sessions.some((s) => s.weighted);
  if (useCycle) {
    let ref = null, cycleStart = 0, reached = false, reachedAt = 0, prevMode = null;
    return { mode: "cycle", target, sessions: sessions.map((s) => {
      if (!s.weighted) return { ...s, color: SUB, label: "No weight logged" };
      const hit = s.modeReps >= target;
      const reset = () => { ref = s.avgW; cycleStart = s.t; reached = hit; reachedAt = s.t; };
      let color, label;
      if (ref === null) { reset(); color = ACCENT; label = "Baseline session"; }
      else if (s.avgW > ref + 0.01) { reset(); color = ACCENT; label = hit ? "Weight up, target reps hit" : "Weight increased"; }
      else if (s.avgW < ref - 0.01) { reset(); color = REDC; label = "Average weight dropped"; }
      else if (prevMode !== null && s.modeReps < prevMode) { color = REDC; label = "Reps dropped at the same weight"; }
      else if (!reached && hit) { reached = true; reachedAt = s.t; color = ACCENT; label = "Hit target reps — ready to add weight"; }
      else {
        const w = Math.floor((s.t - (reached ? reachedAt : cycleStart)) / 7);
        color = w <= 1 ? ACCENT : w === 2 ? GOLD : w === 3 ? WHITE_C : REDC;
        label = reached ? (w <= 1 ? "At target — ready to add weight" : `At target ${w} wks without adding weight`) : (w <= 1 ? "Rebuilding reps at new weight" : `Rebuilding reps — ${w} wks at this weight`);
      }
      prevMode = s.modeReps;
      return { ...s, color, label };
    }) };
  }
  const metric = (s) => (meta.type === "weighted" ? s.volume : s.totalReps);
  let lastImprove = null;
  return { mode: "totals", target, sessions: sessions.map((s, i) => {
    let prior = null;
    for (let j = i - 1; j >= 0; j--) if (sessions[j].t <= s.t - 6) { prior = sessions[j]; break; }
    let color, label;
    if (!prior) { color = ACCENT; label = "Baseline session"; lastImprove = s.t; }
    else if (metric(s) > metric(prior)) { color = ACCENT; label = "Improved vs last week"; lastImprove = s.t; }
    else if (metric(s) < metric(prior)) { color = REDC; label = "Down vs last week"; }
    else {
      const w = Math.floor((s.t - (lastImprove !== null ? lastImprove : s.t)) / 7);
      color = w <= 1 ? GOLD : w === 2 ? WHITE_C : REDC;
      label = `Flat — ${w} wk${w === 1 ? "" : "s"} since last improvement`;
    }
    return { ...s, color, label };
  }) };
}

// Plan info for an exercise on a specific date (targets can differ by day,
// e.g. Incline DB Press is 3x8 on Wednesday but 3x10 on Sunday).
export function getExerciseMetaOn(name, dateStr, planOverrides, anchorDate) {
  const d = new Date(dateStr + "T00:00:00");
  const ex = getEffectiveExercises(planOverrides, getWeekNumber(d, anchorDate), dayName(d)).find((e) => e.ExerciseName === name);
  if (ex) return { targetReps: ex.TargetReps, type: ex.ExerciseType || classifyExerciseType(name, ex.TargetReps) };
  return getExerciseMeta(name, planOverrides);
}

// Runs the progression rules separately for each rep target, so a heavier
// 3x8 day is only ever compared with earlier 3x8 days — never read as a
// "weight drop" against a lighter 3x10 day of the same exercise.
export function colorLiftByTarget(sessions, name, planOverrides, anchorDate) {
  const groups = new Map();
  sessions.forEach((s) => {
    const meta = getExerciseMetaOn(name, idxToDateStr(s.t), planOverrides, anchorDate);
    const key = `${meta.type}|${meta.targetReps}`;
    if (!groups.has(key)) groups.set(key, { meta, list: [] });
    groups.get(key).list.push(s);
  });
  const out = [], targets = new Set();
  let anyCycle = false;
  groups.forEach(({ meta, list }) => {
    const c = colorLiftSessions(list, meta);
    if (c.mode === "cycle") { anyCycle = true; targets.add(c.target); }
    out.push(...c.sessions);
  });
  out.sort((a, b) => a.t - b.t);
  return { mode: anyCycle ? "cycle" : "totals", targets: [...targets].sort((a, b) => a - b), sessions: out };
}

// ---------- Progressive overload: live status + "what lands where" breakdown ----------
export const groupKeyOn = (name, dateStr, planOverrides, anchorDate) => { const m = getExerciseMetaOn(name, dateStr, planOverrides, anchorDate); return `${m.type}|${m.targetReps}`; };
export const fmtLb = (w) => (Math.abs(w - Math.round(w)) < 0.05 ? String(Math.round(w)) : w.toFixed(1));
export const setsToRows = (name, dateStr, setList) => setList.map((st, i) => ({ Date: dateStr, ExerciseName: name, SetNumber: i + 1, Reps: String(st.reps), Weight: st.w ? String(st.w) : "" }));

// Earlier sessions of this exercise that share today's rep target (the same
// grouping the B graph uses), oldest first.
export function sameGroupHistory(rows, name, dateStr, planOverrides, anchorDate) {
  const key = groupKeyOn(name, dateStr, planOverrides, anchorDate);
  const hist = rows.filter((r) => r.ExerciseName === name && DATE_RE.test(String(r.Date)) && r.Date < dateStr);
  return buildLiftSessions(hist, name).filter((s) => groupKeyOn(name, idxToDateStr(s.t), planOverrides, anchorDate) === key);
}

// The B-graph color this exercise currently carries: today's result once every
// set for today is filled in, otherwise the status from the last session.
export function liftStatusNow(rows, name, dateStr, todaySets, planOverrides, anchorDate) {
  const meta = getExerciseMetaOn(name, dateStr, planOverrides, anchorDate);
  const list = sameGroupHistory(rows, name, dateStr, planOverrides, anchorDate);
  const done = todaySets.length > 0 && todaySets.every((st) => String(st.reps).trim() !== "");
  if (done) {
    const today = buildLiftSessions(setsToRows(name, dateStr, todaySets.map((st) => ({ reps: st.reps, w: st.weight }))), name)[0];
    if (today) list.push(today);
  }
  if (!list.length) return null;
  const last = colorLiftSessions(list, meta).sessions[list.length - 1];
  return { color: last.color, label: last.label, isToday: done };
}

// For today's session: which weight/rep outcomes earn which color. Computed by
// running the real B-graph rules on candidate sessions, so it can never drift
// from what the graph will actually show.
export function liftOutlook(rows, name, dateStr, planOverrides, anchorDate, targetSets) {
  const meta = getExerciseMetaOn(name, dateStr, planOverrides, anchorDate);
  const hist = sameGroupHistory(rows, name, dateStr, planOverrides, anchorDate);
  const D = dayIndex(dateStr);
  const n = Math.max(1, parseTargetSets(targetSets));
  const target = parseTargetLow(meta.targetReps);
  const isTime = meta.type === "time";
  const colorAt = (t, setList) => {
    const hypo = buildLiftSessions(setsToRows(name, idxToDateStr(t), setList), name)[0];
    return colorLiftSessions([...hist, hypo], meta).sessions[hist.length].color;
  };
  const order = [ACCENT, GOLD, WHITE_C, REDC];
  const frags = new Map(order.map((c) => [c, []]));
  const add = (c, txt) => { if (frags.has(c)) frags.get(c).push(txt); };
  const titles = {};
  let context = "", mode;

  if (!hist.length) {
    mode = "baseline";
    add(ACCENT, "Any session — this one sets your baseline");
    context = "No earlier sessions at this rep target yet.";
  } else if (meta.type === "weighted" && !isNaN(target) && hist.some((x) => x.weighted)) {
    mode = "cycle";
    const lw = [...hist].reverse().find((x) => x.weighted);
    const ref = lw.avgW, prev = lw.modeReps;
    const R = Math.max(target, prev) + 3;
    const rangeTxt = (a, b) => (a === 1 && b === R ? "any reps" : b === R ? `${a}+ reps` : a === 1 ? `under ${b + 1} reps` : a === b ? `${a} reps` : `${a}–${b} reps`);
    const classes = [
      { w: ref + 5, label: `Over ${fmtLb(ref)} lb` },
      { w: ref, label: `${fmtLb(ref)} lb` },
      ...(ref > 5 ? [{ w: ref - 5, label: `Under ${fmtLb(ref)} lb` }] : []),
    ];
    classes.forEach(({ w, label }) => {
      const cols = []; for (let r = 1; r <= R; r++) cols.push(colorAt(D, Array(n).fill({ reps: r, w })));
      for (let a = 1; a <= R;) {
        let b = a; while (b < R && cols[b] === cols[a - 1]) b++;
        add(cols[a - 1], a === 1 && b === R ? (label.startsWith("Under") ? label : `${label}, any reps`) : `${label} × ${rangeTxt(a, b)}`);
        a = b + 1;
      }
    });
    const atTarget = prev >= target;
    const stay = Array(n).fill({ reps: prev, w: ref });
    [GOLD, WHITE_C].forEach((c) => {
      if (frags.get(c).length) return;
      for (let k = 1; k <= 8; k++) if (colorAt(D + 7 * k, stay) === c) {
        titles[c] = `Not today — from ${idxLabel(D + 7 * k)} if you stay at ${fmtLb(ref)} lb ${atTarget ? "without adding weight" : `under ${target} reps`}`;
        break;
      }
      if (!titles[c]) titles[c] = `Already past this stage — adding weight${atTarget ? "" : ` or hitting ${target} reps`} resets you to blue`;
    });
    context = `Last time (${idxLabel(lw.t)}): ${fmtLb(ref)} lb × ${prev} reps · target ${target} reps`;
  } else {
    mode = "totals";
    const metric = (x) => (meta.type === "weighted" ? x.volume : x.totalReps);
    const prior = [...hist].reverse().find((x) => x.t <= D - 6);
    if (!prior) {
      add(ACCENT, "Any session — no session from a week ago to compare against");
      context = "Compares with your session from about a week ago.";
    } else {
      const P = metric(prior);
      const fmt = (v) => (isTime ? formatSecondsClock(v) : meta.type === "weighted" ? `${Math.round(v)} lb volume` : `${v} reps`);
      const unit = isTime ? "total time" : meta.type === "weighted" ? "" : "total";
      const split = (tot) => { const base = Math.floor(tot / n), extra = tot % n; return Array.from({ length: n }, (_, i) => base + (i < extra ? 1 : 0)); };
      const mk = (tot) => (meta.type === "weighted" ? [{ reps: 1, w: tot }] : split(tot).filter((x) => x > 0).map((x) => ({ reps: x, w: null })));
      const per = (tot) => { const sp = split(tot); return isTime ? sp.map(formatSecondsClock).join(" + ") : sp.join(" + "); };
      add(colorAt(D, mk(P + 1)), `More than ${fmt(P)} ${unit}`.trim() + (meta.type === "weighted" ? "" : ` (e.g. ${per(P + 1)})`));
      add(colorAt(D, mk(P)), `Exactly ${fmt(P)} ${unit}`.trim());
      if (P > 1) add(colorAt(D, mk(P - 1)), `Less than ${fmt(P)} ${unit}`.trim());
      [GOLD, WHITE_C].forEach((c) => {
        if (frags.get(c).length) return;
        for (let k = 1; k <= 8; k++) if (colorAt(D + 7 * k, mk(P)) === c) { titles[c] = `Not today — from ${idxLabel(D + 7 * k)} if you stay at exactly ${fmt(P)}`; break; }
        if (!titles[c]) titles[c] = `Already past this stage — beating ${fmt(P)} resets you to blue`;
      });
      context = `Compared with ${idxLabel(prior.t)}: ${fmt(P)} ${unit}`.trim();
    }
  }
  const names = mode === "totals"
    ? { [ACCENT]: "Improving", [GOLD]: "Flat 1 week", [WHITE_C]: "Flat 2 weeks", [REDC]: "Stalled / down" }
    : { [ACCENT]: "On track", [GOLD]: "2 weeks", [WHITE_C]: "3 weeks — slowing", [REDC]: "Stalled / regressed" };
  const lines = order.map((c) => ({ color: c, name: names[c], text: frags.get(c).join(" · or ") || titles[c] || "Not possible this session", possible: frags.get(c).length > 0 }));
  return { mode, context, lines };
}

export function computeRunSeries(runLog) {
  const byDay = new Map();
  runLog.forEach((r) => {
    if (!DATE_RE.test(String(r.Date))) return;
    const dist = parseFloat(r.Distance);
    const time = parseClock(r.Time);
    let pace = parseClock(r.Pace);
    if (!(pace > 0) && dist > 0 && time > 0) pace = time / dist;
    const t = dayIndex(r.Date);
    byDay.set(t, { t, dist: dist > 0 && dist < 100 ? dist : NaN, pace: pace > 2 && pace < 40 ? pace : NaN });
  });
  const pts = [...byDay.values()].sort((a, b) => a.t - b.t);
  return { pace: pts.filter((p) => !isNaN(p.pace)).map((p) => ({ t: p.t, v: p.pace })), dist: pts.filter((p) => !isNaN(p.dist)).map((p) => ({ t: p.t, v: p.dist })) };
}

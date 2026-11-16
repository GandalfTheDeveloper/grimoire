import React, { useState, useEffect, useRef, useId, createContext, useContext } from "react";
import { ACCENT, CARD, GOLD, INK, LINE, RAINBOW, REDC, SHADOW_SOFT, SUB, WHITE_C } from "./theme.js";
import { formatSecondsClock, idxFull, idxLabel } from "./dates.js";
import { statusColor } from "./logic.js";
import { fmtLb } from "./analytics.js";

// ===================== SVG chart =====================
export function niceTicks(min, max, count = 5) {
  if (!isFinite(min) || !isFinite(max)) return { min: 0, max: 1, ticks: [0, 1] };
  if (max - min < 1e-9) { min -= 1; max += 1; }
  const raw = (max - min) / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Number(v.toFixed(8)));
  return { min: lo, max: hi, ticks };
}

// Monotone cubic tangents (same method as d3.curveMonotoneX). The curve
// passes through every real point and never overshoots above/below the two
// points a segment connects — so the curve can't invent highs or lows.
export function monotoneTangents(p) {
  const n = p.length, m = new Array(n).fill(0);
  if (n < 2) return m;
  const slope = (a, b) => (b.x - a.x ? (b.y - a.y) / (b.x - a.x) : 0);
  if (n === 2) { m[0] = m[1] = slope(p[0], p[1]); return m; }
  const sgn = (v) => (v < 0 ? -1 : 1);
  for (let i = 1; i < n - 1; i++) {
    const h0 = p[i].x - p[i - 1].x, h1 = p[i + 1].x - p[i].x;
    const s0 = slope(p[i - 1], p[i]), s1 = slope(p[i], p[i + 1]);
    const q = (s0 * h1 + s1 * h0) / (h0 + h1 || 1);
    m[i] = (sgn(s0) + sgn(s1)) * Math.min(Math.abs(s0), Math.abs(s1), 0.5 * Math.abs(q)) || 0;
  }
  const end = (a, b, t) => { const h = b.x - a.x; return h ? (3 * (b.y - a.y) / h - t) / 2 : t; };
  m[0] = end(p[0], p[1], m[1]);
  m[n - 1] = end(p[n - 2], p[n - 1], m[n - 2]);
  return m;
}

// Lets a screen know a chart has a tapped-point readout open, so it can hold off auto-switching (A/B cycle).
export const ChartPinContext = createContext(null);

export function SvgChart({ series, left, right, xLabel, bands = [], refLines = [] }) {
  const wrapRef = useRef(null);
  const pin = useContext(ChartPinContext);
  // The tapped point: which series and which day. Looked up by day (not array position) so a refresh can't point it at the wrong data.
  const [sel, setSel] = useState(null);
  useEffect(() => { if (pin) pin(!!sel); }, [sel]);
  useEffect(() => () => { if (pin) pin(false); }, []);
  const [size, setSize] = useState({ w: 640, h: 300 });
  const uid = ("c" + useId()).replace(/[^a-zA-Z0-9]/g, "");
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const update = () => { const r = el.getBoundingClientRect(); if (r.width > 0 && r.height > 0) setSize({ w: r.width, h: r.height }); };
    update();
    if (typeof ResizeObserver === "undefined") { window.addEventListener("resize", update); return () => window.removeEventListener("resize", update); }
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const allPts = series.flatMap((s) => s.points);
  let body = null;
  if (!allPts.length) {
    body = <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: SUB, fontSize: 15 }}>Not enough data yet</div>;
  } else {
    const W = size.w, H = size.h;
    const m = { l: left ? 64 : 16, r: right ? 64 : 16, t: 12, b: xLabel ? 48 : 30 };
    const pw = Math.max(10, W - m.l - m.r), ph = Math.max(10, H - m.t - m.b);
    let tMin = Infinity, tMax = -Infinity;
    allPts.forEach((p) => { tMin = Math.min(tMin, p.t); tMax = Math.max(tMax, p.t); });
    if (tMax - tMin < 1) { tMin -= 1; tMax += 1; }
    const xs = (t) => m.l + ((t - tMin) / (tMax - tMin)) * pw;
    const axisInfo = (side, cfg) => {
      if (!cfg) return null;
      const vals = [];
      series.filter((s) => (s.axis || "left") === side).forEach((s) => s.points.forEach((p) => vals.push(p.v)));
      if (!vals.length) return null;
      bands.filter((b) => (b.axis || "left") === side).forEach((b) => vals.push(b.from, b.to));
      refLines.filter((r) => (r.axis || "left") === side).forEach((r) => vals.push(r.value));
      if (cfg.min !== undefined) vals.push(cfg.min);
      if (cfg.max !== undefined) vals.push(cfg.max);
      let lo = Math.min(...vals), hi = Math.max(...vals);
      const pad = (hi - lo) * 0.06 || 1;
      lo -= pad; hi += pad;
      if (cfg.clampMin !== undefined) lo = Math.max(cfg.clampMin, lo);
      if (cfg.clampMax !== undefined) hi = Math.min(cfg.clampMax, hi);
      const nt = niceTicks(lo, hi, 5);
      const ys = (v) => (cfg.reversed ? m.t + ((v - nt.min) / (nt.max - nt.min)) * ph : m.t + ph - ((v - nt.min) / (nt.max - nt.min)) * ph);
      return { ...nt, ys, cfg };
    };
    const L = axisInfo("left", left), R = axisInfo("right", right);
    const axisFor = (side) => ((side || "left") === "left" ? L : R);

    const span = tMax - tMin;
    const maxTicks = Math.max(2, Math.floor(pw / 72));
    const step = [1, 2, 3, 7, 14, 28, 56, 91, 182, 364].find((s) => span / s <= maxTicks) || 364;
    const xt = [];
    for (let t = Math.ceil(tMin / step) * step; t <= tMax; t += step) xt.push(t);

    const defs = [], segs = [];
    series.forEach((s, si) => {
      const ax = axisFor(s.axis);
      if (!ax) return;
      const pts = s.points;
      const op = s.opacity !== undefined ? s.opacity : 1;
      if (!s.noLine) {
        const px = pts.map((p) => ({ x: xs(p.t), y: ax.ys(p.v) }));
        // Tangents come from the solid (real) points only, so a projected
        // point can never bend the shape of the real line.
        const firstDashed = pts.findIndex((p) => p.dashed);
        const solidN = firstDashed === -1 ? pts.length : firstDashed;
        const tan = s.curve !== false ? monotoneTangents(px.slice(0, solidN)) : null;
        for (let i = 0; i < pts.length - 1; i++) {
          const p1 = pts[i], p2 = pts[i + 1];
          const { x: x1, y: y1 } = px[i], { x: x2, y: y2 } = px[i + 1];
          const c1 = p1.color || s.color, c2 = p2.color || s.color;
          // Extra color stops inside a segment (e.g. the rainbow flowing
          // across a multi-day gap between weigh-ins).
          const mids = [];
          if (s.colorAt && x2 - x1 > 0.5) for (let t = Math.floor(p1.t) + 1; t < p2.t; t++) { const c = s.colorAt(t, p1, p2); if (c) mids.push({ o: (xs(t) - x1) / (x2 - x1), c }); }
          const gapT = p2.t - p1.t;
          let stops = null;
          if (mids.length) stops = [{ o: 0, c: c1 }, ...mids, { o: 1, c: c2 }];
          // endColor: a segment represents the stretch leading up to its end
          // point, so it carries that point's color — with only a one-day
          // fade at the start, so daily weigh-ins still blend smoothly.
          else if (c1 !== c2 && s.endColor) stops = [{ o: 0, c: c1 }, { o: Math.min(1, 1 / Math.max(gapT, 1)), c: c2 }, { o: 1, c: c2 }];
          else if (c1 !== c2) stops = [{ o: 0, c: c1 }, { o: 1, c: c2 }];
          let stroke = c1 === c2 && !stops ? c1 : c2;
          if (stops && x2 - x1 > 0.01) {
            const id = `${uid}g${si}x${i}`;
            defs.push(<linearGradient key={id} id={id} gradientUnits="userSpaceOnUse" x1={x1} y1={0} x2={x2} y2={0}>{stops.map((st, k) => <stop key={k} offset={st.o} stopColor={st.c} />)}</linearGradient>);
            stroke = `url(#${id})`;
          }
          const dashed = p2.dashed;
          // A curve across a long gap would invent a shape between two known
          // points; past straightOverDays the segment is drawn straight.
          const straight = s.straightOverDays !== undefined && gapT > s.straightOverDays;
          const common = { stroke, strokeWidth: s.width || 3, strokeLinecap: "round", fill: "none", opacity: op, strokeDasharray: dashed ? "7 7" : undefined };
          if (tan && !dashed && !straight && i + 1 < solidN) {
            const dx = (x2 - x1) / 3;
            segs.push(<path key={`${si}l${i}`} d={`M${x1},${y1}C${x1 + dx},${y1 + tan[i] * dx},${x2 - dx},${y2 - tan[i + 1] * dx},${x2},${y2}`} {...common} />);
          } else {
            segs.push(<line key={`${si}l${i}`} x1={x1} y1={y1} x2={x2} y2={y2} {...common} />);
          }
        }
      }
      if (s.dots) pts.forEach((p, i) => segs.push(<circle key={`${si}d${i}`} cx={xs(p.t)} cy={ax.ys(p.v)} r={s.dotR || 4} fill={s.dotColor || p.color || s.color} opacity={op} />));
    });

    // Tap targets: the dots if the chart has dots, otherwise every point on the line.
    const anyDots = series.some((s) => s.dots);
    const targets = [];
    series.forEach((s, si) => {
      const ax = axisFor(s.axis);
      if (!ax || s.noTip || (anyDots && !s.dots)) return;
      s.points.forEach((p) => { if (!p.dashed) targets.push({ si, t: p.t, x: xs(p.t), y: ax.ys(p.v) }); });
    });
    const onTap = (e) => {
      const r = e.currentTarget.getBoundingClientRect();
      const px = e.clientX - r.left, py = e.clientY - r.top;
      let best = null, bd = 30 * 30; // 30 px: big enough for a finger
      targets.forEach((g) => { const d = (g.x - px) ** 2 + (g.y - py) ** 2; if (d <= bd) { bd = d; best = g; } });
      setSel(best && sel && sel.si === best.si && sel.t === best.t ? null : best ? { si: best.si, t: best.t } : null);
    };
    const curSeries = sel ? series[sel.si] : null;
    const curPoint = curSeries ? curSeries.points.find((p) => p.t === sel.t && !p.dashed) : null;
    const curAx = curSeries ? axisFor(curSeries.axis) : null;
    let tip = null;
    if (curPoint && curAx) {
      const cx = xs(curPoint.t), cy = curAx.ys(curPoint.v);
      const rows = [];
      series.forEach((s, si) => {
        if (s.noTip) return;
        const p = s.points.find((q) => Math.round(q.t) === Math.round(curPoint.t) && !q.dashed);
        const ax = axisFor(s.axis);
        if (!p || !ax) return;
        let lines;
        if (s.tip) lines = s.tip(p);
        else {
          const label = s.name || ax.cfg.label;
          const val = s.fmt ? s.fmt(p.v) : ax.cfg.format ? ax.cfg.format(p.v) : p.v;
          lines = [label ? `${label}: ${val}` : String(val)];
          if (p.info) lines.push(p.info);
        }
        rows.push({ key: si, color: p.color || s.dotColor || s.color || ACCENT, lines: lines.filter(Boolean) });
      });
      const above = cy > 120;
      tip = (
        <div data-testid="chart-tip" style={{ position: "absolute", left: Math.min(Math.max(cx, 120), Math.max(120, W - 120)), top: above ? cy - 16 : cy + 18, transform: above ? "translate(-50%,-100%)" : "translate(-50%,0)", background: CARD, border: `1px solid ${LINE}`, borderRadius: 10, padding: "8px 11px", color: INK, fontSize: 13, lineHeight: 1.35, pointerEvents: "none", width: "max-content", maxWidth: 240, boxShadow: SHADOW_SOFT, zIndex: 5 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: SUB, marginBottom: 3 }}>{idxFull(curPoint.t)}</div>
          {rows.map((r) => (
            <div key={r.key} style={{ display: "flex", gap: 7, alignItems: "flex-start", marginTop: 2 }}>
              <span style={{ width: 9, height: 9, borderRadius: "50%", background: r.color, flex: "0 0 auto", marginTop: 5 }} />
              <div>{r.lines.map((l, k) => <div key={k} style={k ? { color: SUB, fontSize: 12 } : { fontWeight: 600 }}>{l}</div>)}</div>
            </div>
          ))}
        </div>
      );
    }

    const axisText = (ax, side) => ax.ticks.map((v) => (
      <text key={`${side}t${v}`} x={side === "left" ? m.l - 8 : m.l + pw + 8} y={ax.ys(v)} fill={ax.cfg.color || SUB} fontSize={12} textAnchor={side === "left" ? "end" : "start"} dominantBaseline="middle">{ax.cfg.format ? ax.cfg.format(v) : v}</text>
    ));
    body = (<>
      <svg data-testid="chart-svg" width={W} height={H} onClick={onTap} style={{ display: "block", cursor: "pointer", userSelect: "none", WebkitTapHighlightColor: "transparent" }}>
        <defs>{defs}</defs>
        {bands.map((b, i) => { const ax = axisFor(b.axis); if (!ax) return null; const y1 = ax.ys(b.from), y2 = ax.ys(b.to); return <rect key={`b${i}`} x={m.l} width={pw} y={Math.min(y1, y2)} height={Math.abs(y2 - y1)} fill={b.color} opacity={0.12} />; })}
        {(L || R).ticks.map((v) => <line key={`g${v}`} x1={m.l} x2={m.l + pw} y1={(L || R).ys(v)} y2={(L || R).ys(v)} stroke={LINE} strokeDasharray="3 5" />)}
        {xt.map((t) => <line key={`gx${t}`} x1={xs(t)} x2={xs(t)} y1={m.t} y2={m.t + ph} stroke={LINE} strokeDasharray="3 5" opacity={0.6} />)}
        {refLines.map((r, i) => { const ax = axisFor(r.axis); if (!ax) return null; return <line key={`r${i}`} x1={m.l} x2={m.l + pw} y1={ax.ys(r.value)} y2={ax.ys(r.value)} stroke={SUB} strokeWidth={1.5} opacity={0.7} />; })}
        {segs}
        {curPoint && curAx && (
          <g pointerEvents="none">
            <line x1={xs(curPoint.t)} x2={xs(curPoint.t)} y1={m.t} y2={m.t + ph} stroke={INK} strokeDasharray="4 4" opacity={0.55} />
            <circle cx={xs(curPoint.t)} cy={curAx.ys(curPoint.v)} r={(curSeries.dotR || 4) + 6} fill="none" stroke={INK} strokeWidth={2} />
          </g>
        )}
        {L && axisText(L, "left")}
        {R && axisText(R, "right")}
        {xt.map((t) => <text key={`xt${t}`} x={xs(t)} y={m.t + ph + 18} fill={SUB} fontSize={12} textAnchor="middle">{idxLabel(t)}</text>)}
        {xLabel && <text x={m.l + pw / 2} y={H - 6} fill={SUB} fontSize={13} textAnchor="middle">{xLabel}</text>}
        {L && L.cfg.label && <text transform={`translate(15 ${m.t + ph / 2}) rotate(-90)`} fill={L.cfg.color || SUB} fontSize={13} textAnchor="middle">{L.cfg.label}</text>}
        {R && R.cfg.label && <text transform={`translate(${W - 15} ${m.t + ph / 2}) rotate(90)`} fill={R.cfg.color || SUB} fontSize={13} textAnchor="middle">{R.cfg.label}</text>}
      </svg>
      {tip}
    </>);
  }
  return <div ref={wrapRef} style={{ position: "relative", width: "100%", height: "100%", minHeight: 0, overflow: "hidden" }}>{body}</div>;
}

export function LegendChip({ color, label, dashed, rainbow, dot }) {
  const swatch = rainbow ? `linear-gradient(90deg, ${RAINBOW.join(", ")})` : dashed ? `repeating-linear-gradient(90deg, ${SUB} 0 5px, transparent 5px 9px)` : color;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: SUB, whiteSpace: "nowrap" }}>
      <span style={{ width: dot ? 8 : 18, height: dot ? 8 : 4, borderRadius: dot ? 4 : 2, background: swatch }} />{label}
    </span>
  );
}

// ===================== Progress slide =====================
// Lift progress chart (A = raw performance, B = progression colors). Shared by
// the Progress slide and the phone's long-press exercise popup.
export function liftChartView(lift, exSel, ver) {
  let title = "", status = null, statusColor = SUB, legend = [], chart = null;
    if (!lift || !lift.sessions.length) {
      title = "Lift progress";
      status = "No lifts logged yet.";
      chart = <SvgChart series={[]} />;
    } else {
      const { meta, sessions, colored } = lift;
      const last = sessions[sessions.length - 1];
      const isTime = meta.type === "time", isReps = meta.type === "reps";
      if (ver === "A") {
        title = `${exSel} · A · Raw performance`;
        if (isTime) {
          status = `Last session: ${formatSecondsClock(last.totalReps)} total over ${last.sets} sets`;
          legend = [<LegendChip key="a" color={GOLD} label="Total time" />, <LegendChip key="b" color={ACCENT} label="Longest hold" />];
          chart = <SvgChart series={[{ points: sessions.map((s) => ({ t: s.t, v: s.totalReps, info: `${s.sets} set${s.sets === 1 ? "" : "s"}` })), color: GOLD, dots: true, name: "Total time", fmt: formatSecondsClock }, { axis: "right", points: sessions.map((s) => ({ t: s.t, v: s.longest })), color: ACCENT, dots: true, name: "Longest hold", fmt: formatSecondsClock }]} left={{ label: "Total time (s)", color: GOLD }} right={{ label: "Longest hold (s)", color: ACCENT }} xLabel="Date" />;
        } else if (isReps || !sessions.some((s) => s.weighted)) {
          status = `Last session: ${last.totalReps} total reps over ${last.sets} sets`;
          legend = [<LegendChip key="a" color={GOLD} label="Total reps" />, <LegendChip key="b" color={ACCENT} label="Sets" />];
          chart = <SvgChart series={[{ points: sessions.map((s) => ({ t: s.t, v: s.totalReps })), color: GOLD, dots: true, name: "Total reps" }, { axis: "right", points: sessions.map((s) => ({ t: s.t, v: s.sets })), color: ACCENT, dots: true, name: "Sets" }]} left={{ label: "Total reps", color: GOLD }} right={{ label: "Sets", color: ACCENT }} xLabel="Date" />;
        } else {
          status = `Last session: ${last.avgW.toFixed(1)} lb avg × ${last.avgReps.toFixed(1)} reps avg · ${last.sets} sets`;
          legend = [<LegendChip key="a" color={GOLD} label="Avg weight" />, <LegendChip key="b" color={ACCENT} label="Avg reps / set" />];
          chart = <SvgChart series={[{ points: sessions.filter((s) => s.weighted).map((s) => ({ t: s.t, v: s.avgW })), color: GOLD, dots: true, name: "Avg weight", fmt: (v) => `${fmtLb(v)} lb` }, { axis: "right", points: sessions.map((s) => ({ t: s.t, v: s.avgReps, info: `${s.sets} set${s.sets === 1 ? "" : "s"}` })), color: ACCENT, dots: true, name: "Avg reps / set", fmt: (v) => (Math.round(v * 10) / 10) }]} left={{ label: "Avg weight (lb)", color: GOLD, format: (v) => Math.round(v * 10) / 10 }} right={{ label: "Avg reps / set", color: ACCENT }} xLabel="Date" />;
        }
      } else {
        const cycle = colored.mode === "cycle";
        const metricLabel = isTime ? "Total time (s)" : isReps || meta.type !== "weighted" || !sessions.some((s) => s.weighted) ? "Total reps" : "Volume load (lb)";
        title = `${exSel} · B · ${cycle ? `Progression cycle (target ${colored.targets.join(" / ")} reps)` : "Week-over-week total"}`;
        const lc = colored.sessions[colored.sessions.length - 1];
        status = lc.label;
        statusColor = lc.color;
        legend = cycle
          ? [<LegendChip key="b" color={ACCENT} label="On track" />, <LegendChip key="g" color={GOLD} label="2 wks" />, <LegendChip key="w" color={WHITE_C} label="3 wks" />, <LegendChip key="r" color={REDC} label="4+ wks / regressed" />]
          : [<LegendChip key="b" color={ACCENT} label="Improved" />, <LegendChip key="g" color={GOLD} label="Flat 1 wk" />, <LegendChip key="w" color={WHITE_C} label="Flat 2 wks" />, <LegendChip key="r" color={REDC} label="3+ wks / down" />];
        const val = (s) => (metricLabel === "Volume load (lb)" ? s.volume : s.totalReps);
        const tipB = (p) => {
          const x = p.ses;
          const detail = isTime ? `${formatSecondsClock(x.totalReps)} total over ${x.sets} sets` : x.weighted ? `${fmtLb(x.avgW)} lb avg × ${x.avgReps.toFixed(1)} reps avg · ${x.sets} sets` : `${x.totalReps} total reps over ${x.sets} sets`;
          const metric = metricLabel === "Volume load (lb)" ? `Volume load: ${Math.round(p.v).toLocaleString("en-US")} lb` : isTime ? `Total time: ${formatSecondsClock(p.v)}` : `Total reps: ${Math.round(p.v)}`;
          return [metric, detail, x.label];
        };
        chart = <SvgChart series={[{ points: colored.sessions.map((s) => ({ t: s.t, v: val(s), color: s.color, ses: s })), width: 4, dots: true, tip: tipB }]} left={{ label: metricLabel, format: (v) => (v >= 1000 ? `${Math.round(v / 100) / 10}k` : Math.round(v)) }} xLabel="Date" />;
      }
    }
  return { title, status, statusColor, legend, chart };
}

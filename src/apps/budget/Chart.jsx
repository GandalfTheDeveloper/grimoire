// Two small SVG charts for The Hoard: grouped bars by month, and lines by month.
// One value axis only (never two scales), thin marks, recessive grid, a legend for 2+ series, and a tap
// (or hover) readout for the month under your finger, so no value depends on color alone.
import { useState } from "react";
import { fmt, fmtShort } from "./money.js";
import { monthLabel } from "./plan.js";

const W = 360, H = 190, PADL = 44, PADR = 8, PADT = 10, PADB = 22;

function niceTicks(lo, hi, count = 4) {
  if (hi === lo) hi = lo + 1;
  const raw = (hi - lo) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((s) => s >= raw) || 10 * mag;
  const start = Math.floor(lo / step) * step;
  const out = [];
  for (let v = start; v <= hi + step * 0.001; v += step) out.push(Math.round(v * 100) / 100);
  if (out[out.length - 1] < hi) out.push(out[out.length - 1] + step);
  return out;
}

function Frame({ title, series, rows, sel, setSel, children, ticks, y, testid }) {
  const n = rows.length;
  const colW = (W - PADL - PADR) / Math.max(1, n);
  const pick = (e) => {
    const svg = e.currentTarget;
    const r = svg.getBoundingClientRect();
    const x = ((e.clientX - r.left) / Math.max(1, r.width)) * W;
    const i = Math.floor((x - PADL) / colW);
    if (i >= 0 && i < n) setSel(i);
  };
  const s = sel != null && rows[sel] ? rows[sel] : null;
  return (
    <figure className="hx-chart" data-testid={testid}>
      <figcaption>
        <span className="hx-chart-title">{title}</span>
        {series.length > 1 && (
          <span className="hx-legend">{series.map((x) => <span key={x.key}><i style={{ background: x.color }} />{x.label}</span>)}</span>
        )}
      </figcaption>
      <div className="hx-readout" data-testid={testid ? `${testid}-readout` : undefined} aria-live="polite">
        {s ? <>
          <b>{monthLabel(s.month, true)}</b>
          {series.map((x) => <span key={x.key}><i style={{ background: x.color }} />{x.label} {s[x.key] == null ? "no data" : fmt(s[x.key])}</span>)}
        </> : <span className="hx-dim">Tap a month to see its numbers</span>}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title} onClick={pick} onMouseMove={(e) => e.buttons === 0 && pick(e)} onMouseLeave={() => {}}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PADL} x2={W - PADR} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth={t === 0 ? 1 : 0.5} />
            <text x={PADL - 4} y={y(t) + 3} textAnchor="end" fontSize="9" fill="var(--dim)">{fmtShort(t)}</text>
          </g>
        ))}
        {rows.map((r, i) => (i % Math.ceil(n / 6) === 0 || i === n - 1) && (
          <text key={r.month} x={PADL + colW * (i + 0.5)} y={H - 6} textAnchor="middle" fontSize="9" fill="var(--dim)">{monthLabel(r.month, true).replace(/ \d{2}(\d{2})$/, " '$1")}</text>
        ))}
        {sel != null && <rect x={PADL + colW * sel} y={PADT} width={colW} height={H - PADT - PADB} fill="var(--ink)" opacity="0.06" />}
        {children(colW)}
      </svg>
    </figure>
  );
}

// rows: [{ month, <key>: number }]; series: [{ key, label, color }]
export function BarChart({ title, rows, series, testid }) {
  const [sel, setSel] = useState(null);
  const vals = rows.flatMap((r) => series.map((s) => Number(r[s.key]) || 0));
  const lo = Math.min(0, ...vals), hi = Math.max(0, ...vals);
  const ticks = niceTicks(lo, hi);
  const t0 = ticks[0], t1 = ticks[ticks.length - 1];
  const y = (v) => PADT + (1 - (v - t0) / (t1 - t0 || 1)) * (H - PADT - PADB);
  return (
    <Frame title={title} series={series} rows={rows} sel={sel} setSel={setSel} ticks={ticks} y={y} testid={testid}>
      {(colW) => rows.map((r, i) => {
        const gap = 2, inner = Math.max(2, colW * 0.7), bw = Math.max(1.5, (inner - gap * (series.length - 1)) / series.length);
        return series.map((s, j) => {
          const v = Number(r[s.key]);
          if (!Number.isFinite(v) || r[s.key] == null) return null;
          const x = PADL + colW * i + (colW - inner) / 2 + j * (bw + gap);
          const top = y(Math.max(0, v)), bot = y(Math.min(0, v));
          return <rect key={`${r.month}-${s.key}`} x={x} y={top} width={bw} height={Math.max(0.5, bot - top)} rx={Math.min(2, bw / 2)} fill={s.color} />;
        });
      })}
    </Frame>
  );
}

// Lines skip months with no value (a gap, never a guess).
export function LineChart({ title, rows, series, testid }) {
  const [sel, setSel] = useState(null);
  const vals = rows.flatMap((r) => series.map((s) => r[s.key]).filter((v) => typeof v === "number"));
  if (!vals.length) return null;
  const ticks = niceTicks(Math.min(0, ...vals), Math.max(...vals, 1));
  const t0 = ticks[0], t1 = ticks[ticks.length - 1];
  const y = (v) => PADT + (1 - (v - t0) / (t1 - t0 || 1)) * (H - PADT - PADB);
  return (
    <Frame title={title} series={series} rows={rows} sel={sel} setSel={setSel} ticks={ticks} y={y} testid={testid}>
      {(colW) => series.map((s) => {
        const pts = rows.map((r, i) => (typeof r[s.key] === "number" ? [PADL + colW * (i + 0.5), y(r[s.key])] : null));
        const segs = [];
        let cur = [];
        for (const p of pts) { if (p) cur.push(p); else if (cur.length) { segs.push(cur); cur = []; } }
        if (cur.length) segs.push(cur);
        return (
          <g key={s.key}>
            {segs.map((sg, k) => sg.length > 1
              ? <polyline key={k} points={sg.map((p) => p.join(",")).join(" ")} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
              : <circle key={k} cx={sg[0][0]} cy={sg[0][1]} r="3" fill={s.color} />)}
            {sel != null && pts[sel] && <circle cx={pts[sel][0]} cy={pts[sel][1]} r="4" fill={s.color} stroke="var(--card)" strokeWidth="2" />}
          </g>
        );
      })}
    </Frame>
  );
}

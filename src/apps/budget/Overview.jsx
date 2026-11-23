// Overview: a month at a glance. With imports (round B2): actual In / Spent / Saved, each section's actual
// as a colored bar against its white plan mark, irregular lines on year-to-date pace, "no data" for months
// not imported (never $0), and 12 months of actuals next to the plan.
import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { planForMonth, planSeries, balanceSeries, balanceTotals, monthLabel } from "./plan.js";
import { monthActuals, actualSeries, ytdByLine, paceLabel, lastImportAt, daysSince, reviewList, makeDerive, savedActual, lineInfo } from "./actuals.js";
import { fmt } from "./money.js";
import { MonthPicker } from "./ui.jsx";
import { BarChart, LineChart } from "./Chart.jsx";

const C = { red: "var(--hx-red)", blue: "var(--hx-blue)", gold: "var(--hx-gold)", white: "var(--hx-white)" };

// Actual = colored bar, plan = white mark. Red can't mean "over" (red already means spending), so a bar past
// its mark gets the word "over".
function Bar({ actual, plan, max, color, testid }) {
  const pct = (v) => (max > 0 ? Math.max(0, Math.min(100, (Math.abs(v) / max) * 100)) : 0);
  return (
    <span className="hx-track" aria-hidden="true" data-testid={testid}>
      {actual != null && <span className="hx-bar" style={{ width: `${pct(actual)}%`, background: color }} />}
      <span className="hx-mark" style={{ left: `calc(${pct(plan)}% - 1px)` }} />
    </span>
  );
}

export default function Overview({ records, month, setMonth, go }) {
  const plan = useMemo(() => planForMonth(records, month), [records, month]);
  const info = useMemo(() => lineInfo(records), [records]);
  const act = useMemo(() => monthActuals(records, month, info), [records, month, info]);
  const ytd = useMemo(() => ytdByLine(records, month, info), [records, month, info]);
  const derive = useMemo(() => makeDerive(records), [records]);
  const series = useMemo(() => planSeries(records, month, 12), [records, month]);
  const actSeries = useMemo(() => actualSeries(records, month, 12), [records, month]);
  const bals = useMemo(() => balanceSeries(records, month, 12, derive), [records, month, derive]);
  const review = useMemo(() => reviewList(records).length, [records]);
  const [open, setOpen] = useState({});
  const t = plan.totals;
  const has = act.coverage.status !== "none";
  const saved = has ? savedActual(records, month, act, derive, balanceTotals) : null;
  const last = lastImportAt(records);
  const max = Math.max(1, ...plan.sections.map((s) => Math.max(s.thisMonth, has ? act.bySection[s.id] || 0 : 0)), has ? act.unsorted : 0);

  return (
    <div className="hx-page" data-testid="hx-overview">
      <MonthPicker month={month} onChange={setMonth} testid="ov-month" />
      <div className="hx-tiles">
        <div className="hx-tile"><span>In</span><b className="hx-blue" data-testid="ov-in">{has ? fmt(act.in) : fmt(t.in)}</b><small>{has ? `plan ${fmt(t.in)}` : "planned take-home"}</small></div>
        <div className="hx-tile"><span>Spent</span><b className="hx-red" data-testid="ov-spent">{has ? fmt(act.spent) : fmt(t.spendThisMonth)}</b><small>{has ? `plan ${fmt(t.spendThisMonth)}` : "planned"}</small></div>
        <div className="hx-tile"><span>Saved</span><b className="hx-gold" data-testid="ov-saved">{has ? fmt(saved.amount) : fmt(t.savedThisMonth)}</b><small data-testid="ov-saved-how">{has ? (saved.how === "balances" ? "from balances" : "in − spent (no balances)") : `planned${t.savingThisMonth ? `, ${fmt(t.savingThisMonth)} on purpose` : ""}`}</small></div>
      </div>
      <p className="hx-badges" data-testid="ov-coverage">
        {has ? <span className="hx-badge">{act.coverage.status === "full" ? "Actual" : `Partial: through ${act.coverage.through}`}</span> : <span className="hx-badge">Plan only</span>}
        <span className="hx-badge" data-testid="ov-last-import">{last ? `Last import: ${daysSince(last) === 0 ? "today" : `${daysSince(last)} day${daysSince(last) === 1 ? "" : "s"} ago`}` : "No imports yet"}</span>
        {review > 0 && <button className="hx-badge hx-badge-btn" data-testid="ov-review" onClick={() => go("transactions")}>{review} to review</button>}
        {!has && <span className="hx-dim">No spending imported for {monthLabel(month)}: no data, not $0. The numbers above are the plan.</span>}
      </p>

      {!plan.hasPlan && (
        <section className="hx-card" data-testid="ov-empty">
          <b>Nothing planned for {monthLabel(month)}</b>
          <p className="hx-dim">Set up your plan first.</p>
          <button className="gr-btn primary" onClick={() => go("plan")}>Open Plan</button>
        </section>
      )}

      {plan.sections.length > 0 && (
        <section className="hx-card" data-testid="ov-sections">
          <div className="hx-card-head"><b>{monthLabel(month)} by section</b><span className="hx-dim">{has ? "bar = actual, white mark = plan" : "white mark = plan"}</span></div>
          {plan.sections.map((s) => {
            const isOpen = !!open[s.id || "x"];
            const color = s.kind === "saving" ? C.gold : C.red;
            const a = has ? act.bySection[s.id] || 0 : null;
            return (
              <div key={s.id || "x"} className="hx-ovsec">
                <button className="hx-ovrow" data-testid={`ov-sec-${s.name}`} aria-expanded={isOpen} onClick={() => setOpen((o) => ({ ...o, [s.id || "x"]: !isOpen }))}>
                  {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  <span className={`hx-ovname ${s.kind === "saving" ? "hx-gold" : ""}`}>{s.name}</span>
                  <Bar actual={a} plan={s.thisMonth} max={max} color={color} />
                  <span className="hx-ovamt">
                    {has ? <><span className={s.kind === "saving" ? "hx-gold" : "hx-red"} data-testid={`ov-act-${s.name}`}>{fmt(a)}</span><small className="hx-typed"> / {fmt(s.thisMonth)}</small>{a > s.thisMonth + 0.004 && s.kind !== "saving" && <em className="hx-over" data-testid={`ov-over-${s.name}`}>over</em>}</> : <span className="hx-typed">{fmt(s.thisMonth)}</span>}
                  </span>
                </button>
                {isOpen && (
                  <div className="hx-ovlines" data-testid={`ov-lines-${s.name}`}>
                    {s.lines.map((l) => {
                      const la = has ? act.byLine[l.lineId] || 0 : null;
                      const y = ytd[l.lineId] || 0;
                      return (
                        <div key={l.lineId} className="hx-ovline">
                          <span>{l.name}
                            {l.cadence === "irregular" && <small data-testid={`ov-ytd-${l.name}`}>{has || y ? `Year to date: ${fmt(y)} spent of ${fmt(l.ytdPlan)} planned (${fmt(l.amount)} a year) · ${paceLabel(y, l.ytdPlan)}` : `Year to date: ${fmt(l.ytdPlan)} planned of ${fmt(l.amount)} a year`}</small>}
                            {l.cadence === "annual" && !l.thisMonth && <small>Yearly, not this month</small>}
                            {l.cadence === "onetime" && !l.thisMonth && <small>One time, {l.date}</small>}
                          </span>
                          <span>{has ? <><span className={s.kind === "saving" ? "hx-gold" : "hx-red"} data-testid={`ov-lact-${l.name}`}>{fmt(la)}</span><small className="hx-typed"> / {fmt(l.thisMonth)}</small>{la > l.thisMonth + 0.004 && l.cadence !== "irregular" && s.kind !== "saving" && <em className="hx-over">over</em>}</> : <span className="hx-typed">{fmt(l.thisMonth)}</span>}</span>
                        </div>
                      );
                    })}
                    {s.lines.length === 0 && <p className="hx-dim">No lines.</p>}
                  </div>
                )}
              </div>
            );
          })}
          {has && act.unsorted !== 0 && (
            <div className="hx-ovsec">
              <button className="hx-ovrow" data-testid="ov-unsorted" onClick={() => go("transactions")}>
                <span />
                <span className="hx-ovname">Not sorted yet</span>
                <Bar actual={act.unsorted} plan={0} max={max} color={C.red} />
                <span className="hx-ovamt hx-red">{fmt(act.unsorted)}</span>
              </button>
            </div>
          )}
        </section>
      )}

      {actSeries.some((r) => r.in != null) && (
        <section className="hx-card">
          <BarChart testid="ov-chart-actual" title="12 months, actual" rows={actSeries}
            series={[{ key: "in", label: "In", color: C.blue }, { key: "spent", label: "Spent", color: C.red }, { key: "saved", label: "In − spent", color: C.gold }]} />
          <p className="hx-dim">Months with no import are left empty (no data, not $0).</p>
        </section>
      )}

      {series.some((r) => r.hasPlan) && (
        <section className="hx-card">
          <BarChart testid="ov-chart-plan" title="12 months of plan" rows={series.map((r) => (r.hasPlan ? r : { month: r.month, in: null, spent: null, saved: null }))}
            series={[{ key: "in", label: "In", color: C.blue }, { key: "spent", label: "Spent", color: C.red }, { key: "saved", label: "Saved", color: C.gold }]} />
          <p className="hx-dim">Planned numbers. Yearly and one-time charges show in their own month.</p>
        </section>
      )}

      {bals.some((b) => b.any) ? (
        <section className="hx-card">
          <div className="hx-charts">
            <LineChart testid="ov-chart-cash" title="Total cash" rows={bals.map((b) => ({ month: b.month, cash: b.any ? b.cash : null }))} series={[{ key: "cash", label: "Total cash", color: C.blue }]} />
            <LineChart testid="ov-chart-net" title="Net worth" rows={bals.map((b) => ({ month: b.month, net: b.any ? b.netWorth : null }))} series={[{ key: "net", label: "Net worth", color: C.gold }]} />
          </div>
          <p className="hx-dim">From Balances. Total cash = checking + savings − card owed.</p>
        </section>
      ) : (
        <p className="hx-dim hx-center">Enter balances in <button className="hx-linkbtn" onClick={() => go("balances")}>Balances</button> to see total cash and net worth here.</p>
      )}
    </div>
  );
}

// Overview (round B1: plan only). A month at a glance: planned in, spent and saved; each section against
// its plan; the 12 months up to the chosen month; balance lines from Balances.
// Actual spending (colored bars against the white plan marks) arrives with imports in round B2.
import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { planForMonth, planSeries, balanceSeries, monthLabel } from "./plan.js";
import { fmt } from "./money.js";
import { MonthPicker } from "./ui.jsx";
import { BarChart, LineChart } from "./Chart.jsx";

const C = { red: "var(--hx-red)", blue: "var(--hx-blue)", gold: "var(--hx-gold)", white: "var(--hx-white)" };

function PlanMark({ value, max }) {
  const pct = max > 0 ? Math.min(100, (Math.abs(value) / max) * 100) : 0;
  return (
    <span className="hx-track" aria-hidden="true">
      <span className="hx-mark" style={{ left: `calc(${pct}% - 1px)` }} />
    </span>
  );
}

export default function Overview({ records, month, setMonth, go }) {
  const plan = useMemo(() => planForMonth(records, month), [records, month]);
  const series = useMemo(() => planSeries(records, month, 12), [records, month]);
  const bals = useMemo(() => balanceSeries(records, month, 12), [records, month]);
  const [open, setOpen] = useState({});
  const t = plan.totals;
  const max = Math.max(1, ...plan.sections.map((s) => s.thisMonth));

  return (
    <div className="hx-page" data-testid="hx-overview">
      <MonthPicker month={month} onChange={setMonth} testid="ov-month" />
      <div className="hx-tiles">
        <div className="hx-tile"><span>In</span><b className="hx-blue" data-testid="ov-in">{fmt(t.in)}</b><small>take-home</small></div>
        <div className="hx-tile"><span>Spent</span><b className="hx-red" data-testid="ov-spent">{fmt(t.spendThisMonth)}</b><small>planned</small></div>
        <div className="hx-tile"><span>Saved</span><b className="hx-gold" data-testid="ov-saved">{fmt(t.savedThisMonth)}</b><small>planned{t.savingThisMonth ? `, ${fmt(t.savingThisMonth)} on purpose` : ""}</small></div>
      </div>
      <p className="hx-badges" data-testid="ov-coverage">
        <span className="hx-badge">Plan only</span>
        <span className="hx-badge">No imports yet</span>
        <span className="hx-dim">Actual spending arrives with imports (round B2). Until then a month shows "no data", never $0 spent.</span>
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
          <div className="hx-card-head"><b>{monthLabel(month)} by section</b><span className="hx-dim">white mark = plan</span></div>
          {plan.sections.map((s) => {
            const isOpen = !!open[s.id || "x"];
            return (
              <div key={s.id || "x"} className="hx-ovsec">
                <button className="hx-ovrow" data-testid={`ov-sec-${s.name}`} aria-expanded={isOpen} onClick={() => setOpen((o) => ({ ...o, [s.id || "x"]: !isOpen }))}>
                  {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  <span className={`hx-ovname ${s.kind === "saving" ? "hx-gold" : ""}`}>{s.name}</span>
                  <PlanMark value={s.thisMonth} max={max} />
                  <span className="hx-typed hx-ovamt">{fmt(s.thisMonth)}</span>
                </button>
                {isOpen && (
                  <div className="hx-ovlines" data-testid={`ov-lines-${s.name}`}>
                    {s.lines.map((l) => (
                      <div key={l.lineId} className="hx-ovline">
                        <span>{l.name}{l.cadence === "irregular" && <small data-testid={`ov-ytd-${l.name}`}>Year to date: {fmt(l.ytdPlan)} planned of {fmt(l.amount)} a year</small>}{l.cadence === "annual" && !l.thisMonth && <small>Yearly, not this month</small>}{l.cadence === "onetime" && !l.thisMonth && <small>One time, {l.date}</small>}</span>
                        <span className="hx-typed">{fmt(l.thisMonth)}</span>
                      </div>
                    ))}
                    {s.lines.length === 0 && <p className="hx-dim">No lines.</p>}
                  </div>
                )}
              </div>
            );
          })}
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

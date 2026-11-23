// Plan: income and the budget plan (sections, lines, cadence, account, pull date, notes).
// Every change asks for the month it takes effect from (default: this month), and is saved as a new
// version from that month on, so past months keep the plan that was in force then.
import { Fragment, useMemo, useState } from "react";
import { Pencil, Plus, ArrowUp, ArrowDown } from "lucide-react";
import { newId } from "../../core/data.js";
import { put, putMany, removeMany, setDemoOn } from "./store.js";
import { STANDARD_SECTIONS } from "./schema.js";
import {
  planForMonth, lineGroups, sectionsOf, accountsOf, ofType, monthOf, monthLabel, monthName, CADENCE_TEXT,
  incomeFigures, round2,
} from "./plan.js";
import { fmt, parseMoney, editText } from "./money.js";
import { MonthPicker, Sheet, Seg, Field, MonthInput } from "./ui.jsx";

const cadenceShort = { monthly: "Monthly", annual: "Yearly", irregular: "Irregular", onetime: "One time" };

function lineSub(l, acctName) {
  const bits = [];
  if (l.cadence === "annual") bits.push(`Every ${monthName(Number(l.month))}`);
  else if (l.cadence === "onetime") bits.push(`One time, ${l.date}`);
  else if (l.cadence === "irregular") bits.push("Irregular, yearly budget");
  if (l.pullDate) bits.push(`pulls ${l.pullDate}`);
  if (l.account && acctName(l.account)) bits.push(acctName(l.account));
  if (l.provider) bits.push(l.provider);
  return bits.join(" · ");
}

export default function Plan({ records, month, setMonth, demoOn }) {
  const plan = useMemo(() => planForMonth(records, month), [records, month]);
  const accounts = useMemo(() => accountsOf(records, { includeArchived: true }), [records]);
  const acctName = (id) => (accounts.find((a) => a.id === id) || {}).name || "";
  const [editLine, setEditLine] = useState(null); // { lineId? , sectionId }
  const [editIncome, setEditIncome] = useState(false);
  const [editSection, setEditSection] = useState(null); // section or {} for new
  const { income, totals } = plan;
  const sections = sectionsOf(records);

  const addStandard = async () => {
    let order = sections.length;
    await putMany(STANDARD_SECTIONS.map(([name, kind]) => ({ id: null, type: "section", data: { name, kind, order: order++ } })));
  };

  return (
    <div className="hx-page" data-testid="hx-plan">
      <MonthPicker month={month} onChange={setMonth} testid="plan-month" />
      <p className="hx-dim hx-center">The plan in force in {monthLabel(month)}.</p>

      <section className="hx-card" data-testid="income-card">
        <div className="hx-card-head">
          <b>Income</b>
          <button className="gr-btn" data-testid="income-edit" onClick={() => setEditIncome(true)}><Pencil size={14} /> {income ? "Change" : "Add income"}</button>
        </div>
        {income ? (
          <>
            <div className="hx-big hx-blue" data-testid="income-takehome-month">{fmt(income.takeHomeMonth)}<small> take-home per month</small></div>
            <dl className="hx-kv">
              <dt>Take-home per check</dt><dd className="hx-blue" data-testid="income-takehome-check">{fmt(income.takeHomeCheck)}</dd>
              <dt>Gross per year</dt><dd className="hx-typed">{fmt(income.grossYear)}</dd>
              <dt>Gross per month</dt><dd>{fmt(income.grossMonth)}</dd>
              <dt>Gross per check ({income.checksPerYear} a year)</dt><dd>{fmt(income.grossCheck)}</dd>
              {income.lines.map((l, i) => <Fragment key={i}><dt>{l.name}<small> {l.kind === "tax" ? "tax" : "benefit"}, per check</small></dt><dd className="hx-typed">−{fmt(l.perCheck)}</dd></Fragment>)}
              <dt>Take-home per year</dt><dd>{fmt(income.takeHomeYear)}</dd>
            </dl>
            <p className="hx-dim">From {monthLabel(plan.incomeVersion.data.effective)}. Comparing this with the paychecks in your imports arrives with imports (round B2).</p>
          </>
        ) : <p className="hx-dim">No income in force in {monthLabel(month)}.</p>}
      </section>

      <section className="hx-card" data-testid="plan-totals">
        <div className="hx-card-head"><b>Totals</b><span className="hx-dim">average month · this month</span></div>
        <dl className="hx-kv hx-kv3">
          <dt>In</dt><dd className="hx-blue">{fmt(totals.in)}</dd><dd className="hx-blue">{fmt(totals.in)}</dd>
          <dt>Spending</dt><dd className="hx-red" data-testid="plan-spend-avg">{fmt(totals.spendPerMonth)}</dd><dd className="hx-red" data-testid="plan-spend-month">{fmt(totals.spendThisMonth)}</dd>
          <dt>Saving (planned)</dt><dd className="hx-gold">{fmt(totals.savingPerMonth)}</dd><dd className="hx-gold">{fmt(totals.savingThisMonth)}</dd>
          <dt>In − Out</dt><dd data-testid="plan-left-avg">{fmt(totals.leftPerMonth)}</dd><dd data-testid="plan-left-month">{fmt(totals.leftThisMonth)}</dd>
        </dl>
        <p className="hx-dim">Out = spending + planned saving. Whatever is left over is saved too.</p>
      </section>

      {sections.length === 0 && (
        <section className="hx-card" data-testid="plan-empty">
          <b>No plan yet</b>
          <p className="hx-dim">Import your seed file (gear at the top right, then Import seed file), start from the six standard sections, or try demo mode first.</p>
          <div className="gr-actions" style={{ padding: 0 }}>
            <button className="gr-btn primary" data-testid="plan-add-standard" onClick={addStandard}>Add the six standard sections</button>
            {!demoOn && <button className="gr-btn" data-testid="plan-try-demo" onClick={() => setDemoOn(true)}>Try demo mode</button>}
          </div>
        </section>
      )}

      {plan.sections.map((s) => (
        <section key={s.id || "orphan"} className="hx-card" data-testid={`section-${s.name}`}>
          <div className="hx-card-head">
            <b className={s.kind === "saving" ? "hx-gold" : ""}>{s.name}{s.kind === "saving" && <small className="hx-badge">saving</small>}</b>
            <span className="hx-right">
              <span className={s.kind === "saving" ? "hx-gold" : "hx-red"} data-testid={`section-total-${s.name}`}>{fmt(s.perMonth)}<small>/mo</small></span>
              {s.id && <button className="gr-iconbtn" aria-label={`Edit section ${s.name}`} data-testid={`section-edit-${s.name}`} onClick={() => setEditSection(s)}><Pencil size={16} /></button>}
            </span>
          </div>
          {s.lines.length === 0 && <p className="hx-dim">No lines in {monthLabel(month)}.</p>}
          <div className="hx-lines">
            {s.lines.map((l) => (
              <button key={l.lineId} className="hx-line" data-testid={`line-${l.name}`} onClick={() => setEditLine({ lineId: l.lineId, sectionId: l.sectionId })}>
                <span className="hx-line-main">
                  <span className="hx-line-name">{l.name}</span>
                  <small>{lineSub(l, acctName) || cadenceShort[l.cadence]}</small>
                </span>
                <span className="hx-line-amt">
                  <span className="hx-typed" data-testid={`line-amount-${l.name}`}>{fmt(l.amount)}{l.cadence === "monthly" ? "" : l.cadence === "onetime" ? "" : "/yr"}</span>
                  {l.cadence !== "monthly" && <small>{fmt(l.perMonth)}/mo avg{l.thisMonth ? ` · ${fmt(l.thisMonth)} this month` : ""}</small>}
                </span>
              </button>
            ))}
          </div>
          {s.lines.some((l) => l.cadence !== "monthly") && <p className="hx-dim">This section per year: {fmt(s.perYear)}</p>}
          {s.id && <button className="hx-add" data-testid={`line-add-${s.name}`} onClick={() => setEditLine({ sectionId: s.id })}><Plus size={14} /> Add line</button>}
        </section>
      ))}
      {sections.length > 0 && <button className="hx-add hx-add-section" data-testid="section-add" onClick={() => setEditSection({})}><Plus size={14} /> Add section</button>}

      {editLine && <LineEditor records={records} target={editLine} viewMonth={month} accounts={accounts} onClose={() => setEditLine(null)} />}
      {editIncome && <IncomeEditor records={records} viewMonth={month} onClose={() => setEditIncome(false)} />}
      {editSection && <SectionEditor records={records} section={editSection} onClose={() => setEditSection(null)} />}
    </div>
  );
}

// ---------------- line editor ----------------
function LineEditor({ records, target, viewMonth, accounts, onClose }) {
  const groups = lineGroups(records);
  const versions = target.lineId ? groups.get(target.lineId) || [] : [];
  const isNew = !target.lineId;
  // start from the version in force in the month being viewed (or the latest one)
  const base = versions.filter((v) => v.data.effective <= viewMonth).pop() || versions[versions.length - 1];
  const b = base ? base.data : { name: "", sectionId: target.sectionId, amount: null, cadence: "monthly", month: 1, date: "", account: "", pullDate: "", provider: "", notes: "" };
  const [f, setF] = useState({ ...b, amountText: editText(b.amount), month: Number(b.month) || 1, date: b.date || "" });
  const [effective, setEffective] = useState(isNew ? viewMonth : monthOf());
  const [err, setErr] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e && e.target ? e.target.value : e }));
  const sections = sectionsOf(records);
  const later = versions.filter((v) => v.data.effective > effective);

  const writeVersion = async (data) => {
    const same = versions.filter((v) => v.data.effective === effective).pop();
    await put(same ? same.id : null, "linev", data);
  };

  const save = async () => {
    const amount = parseMoney(f.amountText);
    if (!f.name.trim()) return setErr("Give the line a name.");
    if (amount === null) return setErr("Type an amount (numbers only).");
    if (f.cadence === "onetime" && !/^\d{4}-\d{2}-\d{2}$/.test(f.date)) return setErr("Pick the date of the one-time charge.");
    let order = b.order;
    if (isNew) {
      const inSec = ofType(records, "linev").filter((v) => v.data.sectionId === f.sectionId).map((v) => v.data.order || 0);
      order = (inSec.length ? Math.max(...inSec) : 0) + 1;
    }
    await writeVersion({
      lineId: target.lineId || newId(), effective, name: f.name.trim(), sectionId: f.sectionId, amount, cadence: f.cadence,
      month: f.cadence === "annual" ? Number(f.month) : 0, date: f.cadence === "onetime" ? f.date : "",
      account: f.account || "", pullDate: f.pullDate || "", provider: f.provider || "", notes: f.notes || "", order: order || 0, ended: false,
    });
    onClose();
  };
  const stop = async () => {
    await writeVersion({ ...b, effective, ended: true });
    onClose();
  };
  const del = async () => {
    if (!confirmDelete) return setConfirmDelete(true);
    await removeMany(versions.map((v) => v.id));
    onClose();
  };
  // Order is layout, not money: it changes on every version of both lines, with no effective month.
  const move = async (dir) => {
    const p = planForMonth(records, viewMonth);
    const sec = p.sections.find((s) => s.lines.some((l) => l.lineId === target.lineId));
    if (!sec) return;
    const list = sec.lines.map((l) => l.lineId);
    const i = list.indexOf(target.lineId), j = i + dir;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    const changes = [];
    list.forEach((id, k) => { for (const v of groups.get(id) || []) if (v.data.order !== k + 1) changes.push({ id: v.id, type: "linev", data: { ...v.data, order: k + 1 } }); });
    await putMany(changes);
  };

  const amountLabel = { monthly: "Amount per month", annual: "Amount (once a year)", irregular: "Yearly budget", onetime: "Amount" }[f.cadence];
  return (
    <Sheet title={isNew ? "New line" : f.name || "Line"} onClose={onClose} testid="line-editor">
      <Field label="Name"><input data-testid="le-name" value={f.name} onChange={set("name")} /></Field>
      <Field label="Section">
        <select data-testid="le-section" value={f.sectionId} onChange={set("sectionId")}>
          {sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </Field>
      <Field label="How often">
        <Seg testid="le-cadence" value={f.cadence} onChange={set("cadence")} options={[["monthly", "Monthly"], ["annual", "Yearly"], ["irregular", "Irregular"], ["onetime", "One time"]]} />
      </Field>
      <p className="hx-dim">{CADENCE_TEXT[f.cadence]}{f.cadence === "irregular" ? ": judged on year-to-date pace, not month by month." : ""}</p>
      <Field label={amountLabel}><input className="hx-typed" data-testid="le-amount" inputMode="decimal" value={f.amountText} onChange={set("amountText")} placeholder="0.00" /></Field>
      {f.cadence === "annual" && (
        <Field label="Month it comes out">
          <select data-testid="le-month" value={f.month} onChange={(e) => setF((x) => ({ ...x, month: Number(e.target.value) }))}>
            {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{monthName(i + 1)}</option>)}
          </select>
        </Field>
      )}
      {f.cadence === "onetime" && <Field label="Date"><input data-testid="le-date" type="date" value={f.date} onChange={set("date")} /></Field>}
      <Field label="Account it comes out of">
        <select data-testid="le-account" value={f.account || ""} onChange={set("account")}>
          <option value="">(none)</option>
          {accounts.filter((a) => !a.archived || a.id === f.account).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </Field>
      <Field label="Pull date" hint='Text, for example "2nd–5th" or "15".'><input data-testid="le-pull" value={f.pullDate || ""} onChange={set("pullDate")} /></Field>
      <Field label="Provider / notes"><input data-testid="le-provider" value={f.provider || ""} onChange={set("provider")} /></Field>
      <Field label="Extra notes"><textarea data-testid="le-notes" rows={3} value={f.notes || ""} onChange={set("notes")} /></Field>
      <Field label="Takes effect from" hint="Months before this keep the plan they had."><MonthInput testid="le-effective" value={effective} onChange={setEffective} /></Field>
      {later.length > 0 && <p className="hx-note-warn" data-testid="le-later">A later change from {monthLabel(later[0].data.effective)} still applies from that month on.</p>}
      {err && <p className="gr-fail" role="alert" data-testid="le-error">{err}</p>}
      <div className="gr-actions" style={{ padding: "8px 0" }}>
        <button className="gr-btn primary" data-testid="le-save" onClick={save}>Save</button>
        <button className="gr-btn" onClick={onClose}>Cancel</button>
      </div>
      {!isNew && (
        <>
          <div className="gr-actions" style={{ padding: "4px 0" }}>
            <button className="gr-btn" data-testid="le-up" onClick={() => move(-1)}><ArrowUp size={14} /> Move up</button>
            <button className="gr-btn" data-testid="le-down" onClick={() => move(1)}><ArrowDown size={14} /> Move down</button>
            <button className="gr-btn" data-testid="le-stop" onClick={stop}>Stop this line from {monthLabel(effective, true)}</button>
          </div>
          <div className="hx-history" data-testid="le-history">
            <b>Changes</b>
            {versions.map((v) => <div key={v.id}>From {monthLabel(v.data.effective)}: {v.data.ended ? "stopped" : `${fmt(v.data.amount)} ${cadenceShort[v.data.cadence].toLowerCase()}`}</div>)}
          </div>
          <button className="gr-btn hx-danger" data-testid="le-delete" onClick={del}>{confirmDelete ? "Tap again: delete this line and all its history" : "Delete line (for mistakes)"}</button>
        </>
      )}
    </Sheet>
  );
}

// ---------------- income editor ----------------
function IncomeEditor({ records, viewMonth, onClose }) {
  const versions = ofType(records, "income").sort((a, b) => (a.data.effective < b.data.effective ? -1 : 1));
  const base = versions.filter((v) => v.data.effective <= viewMonth).pop() || versions[versions.length - 1];
  const b = base ? base.data : { grossYear: null, checksPerYear: 26, lines: [] };
  const [gross, setGross] = useState(editText(b.grossYear));
  const [checks, setChecks] = useState(String(b.checksPerYear || 26));
  const [lines, setLines] = useState((b.lines || []).map((l) => ({ ...l, text: editText(l.perCheck) })));
  const [effective, setEffective] = useState(monthOf());
  const [err, setErr] = useState("");
  const preview = incomeFigures({ grossYear: parseMoney(gross) || 0, checksPerYear: Number(checks) || 0, lines: lines.map((l) => ({ ...l, perCheck: parseMoney(l.text) || 0 })) });
  const setLine = (i, k, v) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, [k]: v } : l)));
  const save = async () => {
    const g = parseMoney(gross), c = Number(checks);
    if (g === null) return setErr("Type the gross pay per year.");
    if (!Number.isInteger(c) || c < 1 || c > 52) return setErr("Checks per year: a whole number from 1 to 52.");
    const clean = [];
    for (const l of lines) {
      if (!l.name.trim() && !l.text.trim()) continue;
      const v = parseMoney(l.text);
      if (!l.name.trim() || v === null) return setErr("Each tax or benefit needs a name and an amount per check.");
      clean.push({ name: l.name.trim(), kind: l.kind === "tax" ? "tax" : "benefit", perCheck: v });
    }
    const same = versions.filter((v) => v.data.effective === effective).pop();
    await put(same ? same.id : null, "income", { effective, grossYear: g, checksPerYear: c, lines: clean });
    onClose();
  };
  return (
    <Sheet title="Income" onClose={onClose} testid="income-editor">
      <Field label="Gross pay per year"><input className="hx-typed" data-testid="ie-gross" inputMode="decimal" value={gross} onChange={(e) => setGross(e.target.value)} /></Field>
      <Field label="Paychecks per year" hint="26 = every two weeks, 24 = twice a month, 12 = monthly."><input className="hx-typed" data-testid="ie-checks" inputMode="numeric" value={checks} onChange={(e) => setChecks(e.target.value)} /></Field>
      <div className="hx-field"><span>Taxes and benefits, per check</span>
        {lines.map((l, i) => (
          <div className="hx-incline" key={i} data-testid={`ie-line-${i}`}>
            <input aria-label="Name" data-testid={`ie-line-name-${i}`} value={l.name} placeholder="Name" onChange={(e) => setLine(i, "name", e.target.value)} />
            <select aria-label="Kind" data-testid={`ie-line-kind-${i}`} value={l.kind} onChange={(e) => setLine(i, "kind", e.target.value)}><option value="tax">Tax</option><option value="benefit">Benefit</option></select>
            <input aria-label="Per check" className="hx-typed" data-testid={`ie-line-amt-${i}`} inputMode="decimal" value={l.text} placeholder="0.00" onChange={(e) => setLine(i, "text", e.target.value)} />
            <button className="gr-iconbtn" aria-label="Remove" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>×</button>
          </div>
        ))}
        <button className="hx-add" data-testid="ie-add-line" onClick={() => setLines((ls) => [...ls, { name: "", kind: "tax", text: "" }])}><Plus size={14} /> Add a tax or benefit</button>
      </div>
      <p data-testid="ie-preview">Take-home: <b className="hx-blue">{fmt(preview.takeHomeCheck)}</b> per check, <b className="hx-blue">{fmt(round2(preview.takeHomeMonth))}</b> per month.</p>
      <Field label="Takes effect from" hint="A raise from this month on. Earlier months keep the old income."><MonthInput testid="ie-effective" value={effective} onChange={setEffective} /></Field>
      {versions.some((v) => v.data.effective > effective) && <p className="hx-note-warn">A later income change still applies from its own month on.</p>}
      {err && <p className="gr-fail" role="alert" data-testid="ie-error">{err}</p>}
      <div className="gr-actions" style={{ padding: "8px 0" }}>
        <button className="gr-btn primary" data-testid="ie-save" onClick={save}>Save</button>
        <button className="gr-btn" onClick={onClose}>Cancel</button>
      </div>
      {versions.length > 0 && (
        <div className="hx-history"><b>Changes</b>{versions.map((v) => <div key={v.id}>From {monthLabel(v.data.effective)}: {fmt(v.data.grossYear)} gross a year</div>)}</div>
      )}
    </Sheet>
  );
}

// ---------------- section editor ----------------
function SectionEditor({ records, section, onClose }) {
  const isNew = !section.id;
  const [name, setName] = useState(section.name || "");
  const [kind, setKind] = useState(section.kind || "spend");
  const [err, setErr] = useState("");
  const sections = sectionsOf(records);
  const used = !isNew && ofType(records, "linev").some((v) => v.data.sectionId === section.id);
  const save = async () => {
    if (!name.trim()) return setErr("Give the section a name.");
    await put(isNew ? null : section.id, "section", { name: name.trim(), kind, order: isNew ? sections.length : section.order ?? 0 });
    onClose();
  };
  const move = async (dir) => {
    const list = sections.map((s) => s.id);
    const i = list.indexOf(section.id), j = i + dir;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    await putMany(list.map((id, k) => { const s = sections.find((x) => x.id === id); return { id, type: "section", data: { name: s.name, kind: s.kind, order: k } }; }).filter((x, k) => sections.find((s) => s.id === x.id).order !== k));
  };
  const del = async () => { if (used) return setErr("Move or delete this section's lines first (their history uses it)."); await removeMany([section.id]); onClose(); };
  return (
    <Sheet title={isNew ? "New section" : "Section"} onClose={onClose} testid="section-editor">
      <Field label="Name" hint="Renaming changes the name everywhere, past months included."><input data-testid="se-name" value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <Field label="Kind"><Seg testid="se-kind" value={kind} onChange={setKind} options={[["spend", "Spending"], ["saving", "Saving"]]} /></Field>
      <p className="hx-dim">Saving sections are gold and never count as spending.</p>
      {err && <p className="gr-fail" role="alert" data-testid="se-error">{err}</p>}
      <div className="gr-actions" style={{ padding: "8px 0" }}>
        <button className="gr-btn primary" data-testid="se-save" onClick={save}>Save</button>
        <button className="gr-btn" onClick={onClose}>Cancel</button>
      </div>
      {!isNew && (
        <div className="gr-actions" style={{ padding: "4px 0" }}>
          <button className="gr-btn" data-testid="se-up" onClick={() => move(-1)}><ArrowUp size={14} /> Move up</button>
          <button className="gr-btn" data-testid="se-down" onClick={() => move(1)}><ArrowDown size={14} /> Move down</button>
          <button className="gr-btn hx-danger" data-testid="se-delete" onClick={del}>Delete section</button>
        </div>
      )}
    </Sheet>
  );
}

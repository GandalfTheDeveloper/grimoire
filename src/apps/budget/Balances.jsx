// Balances. One balance per account per month. Checking and savings fill in automatically from imported
// account-history files (the last balance of the month seen); a card's balance owed is worked out from the
// charges since its last payment once a payment has been imported. Anything typed on "Update balances" wins
// for that month. A month without an entry carries the last one forward (shown as "from <month>"). Amounts
// owed (card, mortgage) are typed as positive numbers and subtracted.
import { useMemo, useState } from "react";
import { Plus, Pencil } from "lucide-react";
import { put, remove } from "./store.js";
import { ACCOUNT_KINDS, accountsOf, balanceAt, balanceEntry, balanceSeries, balanceTotals, monthLabel, ofType } from "./plan.js";
import { fmt, parseMoney, editText } from "./money.js";
import { MonthPicker, Sheet, Field } from "./ui.jsx";
import { LineChart } from "./Chart.jsx";
import { makeDerive } from "./actuals.js";

const LINE_COLORS = ["#2FD9C0", "#E3B23C", "#F4F7F6", "#8FB8FF", "#C79BFF", "#7FD47F"];

export default function Balances({ records, month, setMonth }) {
  const accounts = useMemo(() => accountsOf(records), [records]);
  const all = useMemo(() => accountsOf(records, { includeArchived: true }), [records]);
  const derive = useMemo(() => makeDerive(records), [records]);
  const totals = useMemo(() => balanceTotals(records, month, derive), [records, month, derive]);
  const series = useMemo(() => balanceSeries(records, month, 12, derive), [records, month, derive]);
  const [updating, setUpdating] = useState(false);
  const [editAcct, setEditAcct] = useState(null);
  const invest = accounts.filter((a) => (ACCOUNT_KINDS[a.kind] || {}).group === "invest");

  return (
    <div className="hx-page" data-testid="hx-balances">
      <MonthPicker month={month} onChange={setMonth} testid="bal-month" />
      <div className="hx-tiles">
        <div className="hx-tile"><span>Total cash</span><b className="hx-blue" data-testid="bal-cash">{totals.any ? fmt(totals.cash) : "–"}</b><small>checking + savings − card</small></div>
        <div className="hx-tile"><span>Investments</span><b className="hx-gold" data-testid="bal-invest">{totals.any ? fmt(totals.invest) : "–"}</b><small>brokerage, IRA, HSA, 401(k)</small></div>
        <div className="hx-tile"><span>Net worth</span><b className="hx-gold" data-testid="bal-net">{totals.any ? fmt(totals.netWorth) : "–"}</b><small>everything − everything owed</small></div>
      </div>

      <section className="hx-card" data-testid="bal-accounts">
        <div className="hx-card-head">
          <b>Accounts in {monthLabel(month)}</b>
          {accounts.length > 0 && <button className="gr-btn primary" data-testid="bal-update" onClick={() => setUpdating(true)}>Update balances</button>}
        </div>
        {accounts.length === 0 && <p className="hx-dim">No accounts yet. Add your checking, savings, card and the rest, or import your seed file.</p>}
        <div className="hx-lines">
          {accounts.map((a) => {
            const b = balanceAt(records, a.id, month, derive);
            const owed = (ACCOUNT_KINDS[a.kind] || {}).sign === -1;
            return (
              <button key={a.id} className="hx-line" data-testid={`acct-${a.name}`} onClick={() => setEditAcct(a)}>
                <span className="hx-line-main"><span className="hx-line-name">{a.name}</span><small>{(ACCOUNT_KINDS[a.kind] || ACCOUNT_KINDS.otherAsset).label}</small></span>
                <span className="hx-line-amt">
                  <span className={b && !b.carried ? (b.source === "manual" ? "hx-typed" : "") : "hx-dim"} data-testid={`acct-amt-${a.name}`}>{b ? `${owed ? "−" : ""}${fmt(b.amount)}` : "no data"}</span>
                  {b && b.carried && <small>from {monthLabel(b.month, true)}</small>}
                  {b && !b.carried && b.source === "auto" && <small data-testid={`acct-src-${a.name}`}>from account history, {b.asOf}</small>}
                  {b && !b.carried && b.source === "derived" && <small data-testid={`acct-src-${a.name}`}>charges since the payment on {b.asOf}</small>}
                </span>
              </button>
            );
          })}
        </div>
        <button className="hx-add" data-testid="acct-add" onClick={() => setEditAcct({})}><Plus size={14} /> Add account</button>
      </section>

      {series.some((s) => s.any) && (
        <section className="hx-card hx-charts">
          <LineChart testid="bal-chart-cash" title="Total cash" rows={series.map((s) => ({ month: s.month, cash: s.any ? s.cash : null }))} series={[{ key: "cash", label: "Total cash", color: "var(--hx-blue)" }]} />
          <LineChart testid="bal-chart-net" title="Net worth" rows={series.map((s) => ({ month: s.month, net: s.any ? s.netWorth : null }))} series={[{ key: "net", label: "Net worth", color: "var(--hx-gold)" }]} />
        </section>
      )}
      {invest.length > 0 && series.some((s) => invest.some((a) => s.byAccount[a.id] != null)) && (
        <section className="hx-card">
          <LineChart testid="bal-chart-invest" title="Investments by account" rows={series.map((s) => Object.fromEntries([["month", s.month], ...invest.map((a) => [a.id, s.byAccount[a.id] ?? null])]))}
            series={invest.slice(0, LINE_COLORS.length).map((a, i) => ({ key: a.id, label: a.name, color: LINE_COLORS[i] }))} />
        </section>
      )}

      {updating && <UpdateBalances records={records} accounts={accounts} month={month} onClose={() => setUpdating(false)} />}
      {editAcct && <AccountEditor records={records} account={editAcct} count={all.length} onClose={() => setEditAcct(null)} />}
    </div>
  );
}

function UpdateBalances({ records, accounts, month, onClose }) {
  const [vals, setVals] = useState(() => Object.fromEntries(accounts.map((a) => { const e = balanceEntry(records, a.id, month); return [a.id, e ? editText(e.data.amount) : ""]; })));
  const [err, setErr] = useState("");
  const save = async () => {
    for (const a of accounts) if (vals[a.id].trim() !== "" && parseMoney(vals[a.id]) === null) return setErr(`${a.name}: numbers only.`);
    for (const a of accounts) {
      const e = balanceEntry(records, a.id, month);
      const text = vals[a.id].trim();
      if (text === "") { if (e) await remove(e.id); continue; }
      const amount = parseMoney(text);
      if (e && e.data.amount === amount) continue;
      await put(e ? e.id : null, "bal", { accountId: a.id, month, amount });
    }
    onClose();
  };
  return (
    <Sheet title={`Balances for ${monthLabel(month)}`} onClose={onClose} testid="bal-editor">
      <p className="hx-dim">Type what each account held (amounts owed as positive numbers). Leave a box empty to use the automatic value (from imports) or the last month's value. A typed value wins over an automatic one for this month.</p>
      {accounts.map((a) => {
        const prev = balanceAt(records, a.id, month, makeDerive(records));
        return (
          <Field key={a.id} label={`${a.name} · ${(ACCOUNT_KINDS[a.kind] || ACCOUNT_KINDS.otherAsset).label}`}>
            <input className="hx-typed" inputMode="decimal" data-testid={`be-${a.name}`} value={vals[a.id]} placeholder={prev && prev.carried ? `${editText(prev.amount)} (from ${monthLabel(prev.month, true)})` : prev && prev.source !== "manual" ? `${editText(prev.amount)} (automatic)` : "0.00"} onChange={(e) => setVals((v) => ({ ...v, [a.id]: e.target.value }))} />
          </Field>
        );
      })}
      {err && <p className="gr-fail" role="alert" data-testid="be-error">{err}</p>}
      <div className="gr-actions" style={{ padding: "8px 0" }}>
        <button className="gr-btn primary" data-testid="be-save" onClick={save}>Save</button>
        <button className="gr-btn" onClick={onClose}>Cancel</button>
      </div>
    </Sheet>
  );
}

function AccountEditor({ records, account, count, onClose }) {
  const isNew = !account.id;
  const [name, setName] = useState(account.name || "");
  const [kind, setKind] = useState(account.kind || "checking");
  const [archived, setArchived] = useState(!!account.archived);
  const [err, setErr] = useState("");
  const [confirm, setConfirm] = useState(false);
  const hasBal = !isNew && ofType(records, "bal").some((r) => r.data.accountId === account.id);
  const usedByPlan = !isNew && ofType(records, "linev").some((r) => r.data.account === account.id);
  const save = async () => {
    if (!name.trim()) return setErr("Give the account a name.");
    await put(isNew ? null : account.id, "account", { name: name.trim(), kind, order: isNew ? count : account.order ?? 0, archived });
    onClose();
  };
  const del = async () => {
    if (hasBal || usedByPlan) return setErr("This account has balances or plan lines. Hide it instead (keeps its history).");
    if (!confirm) return setConfirm(true);
    await remove(account.id); onClose();
  };
  return (
    <Sheet title={isNew ? "New account" : "Account"} onClose={onClose} testid="acct-editor">
      <Field label="Name"><input data-testid="ae-name" value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <Field label="Kind">
        <select data-testid="ae-kind" value={kind} onChange={(e) => setKind(e.target.value)}>
          {Object.entries(ACCOUNT_KINDS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </Field>
      {!isNew && (
        <label className="hx-check"><input type="checkbox" data-testid="ae-archived" checked={archived} onChange={(e) => setArchived(e.target.checked)} /> Hide this account (closed). Its history stays; enter 0 as its balance in the month it closed so it stops counting</label>
      )}
      {err && <p className="gr-fail" role="alert" data-testid="ae-error">{err}</p>}
      <div className="gr-actions" style={{ padding: "8px 0" }}>
        <button className="gr-btn primary" data-testid="ae-save" onClick={save}><Pencil size={14} /> Save</button>
        <button className="gr-btn" onClick={onClose}>Cancel</button>
        {!isNew && <button className="gr-btn hx-danger" data-testid="ae-delete" onClick={del}>{confirm ? "Tap again to delete" : "Delete"}</button>}
      </div>
    </Sheet>
  );
}

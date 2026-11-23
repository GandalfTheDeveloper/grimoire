// One transaction: what it is (spending, refund, income, transfer, hidden), which line, or a split across
// several lines (e.g. a warehouse club: groceries + personal). Any change here is a manual edit, which rules
// never touch again (spec 4.5).
import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { put } from "./store.js";
import { round2 } from "./plan.js";
import { fmt, parseMoney, editText } from "./money.js";
import { Sheet, Seg, Field } from "./ui.jsx";
import { lineOptions, LineSelect, KIND_TEXT, accountNamer, lineNamer, TxAmount } from "./txui.jsx";

export default function TxEditor({ records, tx, onClose, onSorted }) {
  const d = tx.data;
  const month = d.date.slice(0, 7);
  const groups = useMemo(() => lineOptions(records, month), [records, month]);
  const acct = accountNamer(records);
  const lineName = lineNamer(records);
  const kinds = d.dir === "in" ? [["refund", "Refund"], ["income", "Income"], ["transfer", "Transfer"], ["ignore", "Hide"]] : [["spend", "Spending"], ["transfer", "Transfer"], ["ignore", "Hide"]];
  const [kind, setKind] = useState(kinds.some(([k]) => k === d.kind) ? d.kind : kinds[0][0]);
  const [lineId, setLineId] = useState(d.lineId || "");
  const [splitting, setSplitting] = useState(Array.isArray(d.splits) && d.splits.length > 0);
  const [parts, setParts] = useState(() => (d.splits && d.splits.length ? d.splits.map((p) => ({ lineId: p.lineId, amount: editText(p.amount) })) : [{ lineId: d.lineId || "", amount: editText(d.amount) }, { lineId: "", amount: "" }]));
  const [note, setNote] = useState(d.note || "");
  const [err, setErr] = useState("");
  const onLine = kind === "spend" || kind === "refund";
  const partSum = round2(parts.reduce((a, p) => a + (parseMoney(p.amount) || 0), 0));
  const left = round2(d.amount - partSum);

  const save = async () => {
    let next = { ...d, kind, note: note.trim(), status: "manual", choices: [] };
    if (!onLine) next = { ...next, lineId: "", splits: [] };
    else if (splitting) {
      const clean = parts.filter((p) => p.lineId || String(p.amount).trim());
      if (clean.length < 2) return setErr("A split needs at least two parts.");
      for (const p of clean) {
        if (!p.lineId) return setErr("Pick a line for every part.");
        const a = parseMoney(p.amount);
        if (a === null || a <= 0) return setErr("Every part needs an amount above zero.");
      }
      if (Math.abs(left) > 0.004) return setErr(`The parts must add up to ${fmt(d.amount, { forceCents: true })} (${fmt(Math.abs(left), { forceCents: true })} ${left > 0 ? "left" : "too much"}).`);
      next = { ...next, lineId: "", splits: clean.map((p) => ({ lineId: p.lineId, amount: parseMoney(p.amount) })) };
    } else {
      if (!lineId) return setErr("Pick a line, or mark it as a transfer or hidden.");
      next = { ...next, lineId, splits: [] };
    }
    await put(tx.id, "tx", next);
    onClose();
    if (onSorted && onLine && !splitting && lineId && d.status !== "manual") onSorted(tx, next, { type: "line", line: lineId });
    else if (onSorted && (kind === "transfer" || kind === "income") && d.status !== "manual") onSorted(tx, next, { type: kind });
  };

  return (
    <Sheet title="Transaction" onClose={onClose} testid="tx-editor">
      <div className="hx-txhead">
        <b>{d.desc}</b>
        <TxAmount d={d} testid="te-amount" />
      </div>
      <dl className="hx-kv" data-testid="te-facts">
        <dt>Date</dt><dd>{d.date}</dd>
        {acct(d.account) && <><dt>Account</dt><dd>{acct(d.account)}</dd></>}
        <dt>As the bank wrote it</dt><dd className="hx-wrap">{d.orig}</dd>
        {d.bankCat && <><dt>Bank's category <small>(hint only)</small></dt><dd>{d.bankCat}</dd></>}
        <dt>From</dt><dd>{d.src === "spend" ? "Spending export" : d.histOnly ? "Only in account history" : "Account history"}</dd>
        <dt>Sorted</dt><dd>{d.status === "manual" ? "By you" : d.status === "auto" ? "By a rule" : "Waiting for review"}</dd>
      </dl>
      {d.choices && d.choices.length > 0 && <p className="hx-dim">A rule asks each time: {d.choices.map((c) => lineName(c, month)).filter(Boolean).join(" or ")}.</p>}
      <Field label="What is it?"><Seg options={kinds} value={kind} onChange={setKind} testid="te-kind" /></Field>
      {kind === "transfer" && <p className="hx-dim">Money moving between your own accounts. Not spending, not income.</p>}
      {kind === "ignore" && <p className="hx-dim">Hidden from every total (kept, so a re-import doesn't bring it back).</p>}
      {onLine && !splitting && (
        <Field label={kind === "refund" ? "Take it off which line?" : "Which line?"}>
          <LineSelect groups={groups} value={lineId} onChange={setLineId} testid="te-line" placeholder="Pick a line…" />
        </Field>
      )}
      {onLine && splitting && (
        <div className="hx-split" data-testid="te-split">
          {parts.map((p, i) => (
            <div key={i} className="hx-splitrow">
              <LineSelect groups={groups} value={p.lineId} onChange={(v) => setParts((ps) => ps.map((x, j) => (j === i ? { ...x, lineId: v } : x)))} testid={`te-part-line-${i}`} placeholder="Line…" />
              <input className="hx-typed" inputMode="decimal" data-testid={`te-part-amt-${i}`} value={p.amount} placeholder="0.00" onChange={(e) => setParts((ps) => ps.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} />
              <button className="gr-iconbtn" aria-label="Remove part" onClick={() => setParts((ps) => ps.filter((_, j) => j !== i))}><Trash2 size={16} /></button>
            </div>
          ))}
          <div className="hx-right">
            <button className="hx-add" data-testid="te-part-add" onClick={() => setParts((ps) => [...ps, { lineId: "", amount: left > 0 ? editText(left) : "" }])}><Plus size={14} /> Add part</button>
            <span className={Math.abs(left) > 0.004 ? "hx-note-warn" : "hx-dim"} data-testid="te-left">{Math.abs(left) > 0.004 ? `${fmt(Math.abs(left), { forceCents: true })} ${left > 0 ? "left to place" : "too much"}` : "Adds up"}</span>
          </div>
        </div>
      )}
      {onLine && (
        <label className="hx-check"><input type="checkbox" data-testid="te-split-toggle" checked={splitting} onChange={(e) => setSplitting(e.target.checked)} /> Split across several lines</label>
      )}
      <Field label="Note (optional)"><input data-testid="te-note" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      {err && <p className="gr-fail" role="alert" data-testid="te-error">{err}</p>}
      <div className="gr-actions" style={{ padding: "8px 0" }}>
        <button className="gr-btn primary" data-testid="te-save" onClick={save}>Save</button>
        <button className="gr-btn" onClick={onClose}>Cancel</button>
      </div>
      <p className="hx-dim">{KIND_TEXT[d.kind] ? `Now: ${KIND_TEXT[d.kind]}${d.lineId ? `, ${lineName(d.lineId, month)}` : ""}.` : ""}</p>
    </Sheet>
  );
}

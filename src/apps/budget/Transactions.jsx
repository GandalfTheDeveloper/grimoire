// Transactions (round B2): import CSVs, the review list, and month-by-month browsing.
// Sorting happens on this device by your rules; the bank's own category is only shown as a hint (spec 2).
import { useMemo, useState } from "react";
import { Upload, ListFilter, Sparkles } from "lucide-react";
import { put, putBatch, putMany, remove } from "./store.js";
import { monthOf, sectionsOf, accountsOf } from "./plan.js";
import { reviewList, txForMonth, lastImportAt, daysSince, coveredThrough, monthCoverage, lineInfo, txParts, COUNTED } from "./actuals.js";
import { demoFiles, demoRulesAndMaps } from "./demo.js";
import { fmt } from "./money.js";
import { MonthPicker, Sheet, Field } from "./ui.jsx";
import { lineOptions, LineSelect, lineNamer, accountNamer, TxAmount, learnRule, KIND_TEXT } from "./txui.jsx";
import ImportSheet from "./ImportSheet.jsx";
import TxEditor from "./TxEditor.jsx";

const SHOW_REVIEW = 40;

export default function Transactions({ records, month, setMonth, demoOn }) {
  const [importing, setImporting] = useState(null); // null | { files? }
  const [editing, setEditing] = useState(null);
  const [offer, setOffer] = useState(null); // { tx, d, action }
  const [offerDone, setOfferDone] = useState("");
  const [rulesOpen, setRulesOpen] = useState(false);
  const [moreReview, setMoreReview] = useState(false);
  const review = useMemo(() => reviewList(records), [records]);
  const last = lastImportAt(records);
  const through = coveredThrough(records);
  const lineName = lineNamer(records);
  const acct = accountNamer(records);

  const sortOne = async (tx, lineId) => {
    const d = { ...tx.data, lineId, splits: [], status: "manual", choices: [] };
    await put(tx.id, "tx", d);
    setOfferDone("");
    if (!(tx.data.choices || []).length) setOffer({ tx, d, action: { type: "line", line: lineId } });
  };
  const acceptOffer = async () => {
    const { rule, waiting } = learnRule(records, offer.d, offer.action);
    const others = waiting.filter((r) => r.id !== offer.tx.id);
    await put(null, "rule", rule);
    if (others.length) await putBatch(others.map((r) => ({ id: r.id, type: "tx", data: { ...r.data, ...(offer.action.type === "line" ? { lineId: offer.action.line } : { kind: offer.action.type, lineId: "" }), status: "auto", choices: [] } })));
    setOfferDone(`Saved. ${offer.d.desc} will be sorted automatically from the next import${others.length ? `, and ${others.length} more waiting here ${others.length === 1 ? "was" : "were"} sorted now` : ""}.`);
    setOffer(null);
  };
  const demoImport = async () => {
    const have = new Set(records.map((r) => r.id));
    const missing = demoRulesAndMaps().filter((r) => !have.has(r.id));
    if (missing.length) await putMany(missing);
    setImporting({ files: demoFiles() });
  };

  return (
    <div className="hx-page" data-testid="hx-transactions">
      <section className="hx-card">
        <div className="hx-card-head">
          <b>Import</b>
          <button className="gr-btn primary" data-testid="tx-import" onClick={() => setImporting({})}><Upload size={14} /> Import CSV files</button>
        </div>
        <p className="hx-badges" data-testid="tx-badges">
          <span className="hx-badge" data-testid="tx-last-import">{last ? `Last import: ${daysSince(last) === 0 ? "today" : `${daysSince(last)} day${daysSince(last) === 1 ? "" : "s"} ago`}` : "No imports yet"}</span>
          {through && <span className="hx-badge">Data through {through}</span>}
          <span className="hx-badge" data-testid="tx-review-count">{review.length} to review</span>
        </p>
        <p className="hx-dim">Your spending export plus your checking account history (savings history optional). Importing the same or overlapping files again is safe: anything already here is skipped.</p>
        <div className="gr-actions" style={{ padding: "6px 0 0" }}>
          <button className="gr-btn" data-testid="tx-rules" onClick={() => setRulesOpen(true)}><ListFilter size={14} /> Sorting rules ({records.filter((r) => r.type === "rule").length})</button>
          {demoOn && <button className="gr-btn" data-testid="tx-demo-import" onClick={demoImport}><Sparkles size={14} /> Import a made-up quarter</button>}
        </div>
      </section>

      {(review.length > 0 || offer || offerDone) && (
        <section className="hx-card" data-testid="tx-review">
          <div className="hx-card-head"><b>To review</b><span className="hx-dim">{review.length} waiting</span></div>
          {offer && (
            <div className="hx-offer" data-testid="tx-offer">
              <span>Always put <b>{offer.d.desc}</b> {offer.action.type === "line" ? <>on <b>{lineName(offer.action.line)}</b></> : <>as <b>{KIND_TEXT[offer.action.type]}</b></>}?</span>
              <span className="hx-right">
                <button className="gr-btn primary" data-testid="tx-offer-yes" onClick={acceptOffer}>Yes, make a rule</button>
                <button className="gr-btn" data-testid="tx-offer-no" onClick={() => setOffer(null)}>No</button>
              </span>
            </div>
          )}
          {offerDone && <p className="gr-pass" role="status" data-testid="tx-offer-done">{offerDone}</p>}
          <div className="hx-lines">
            {(moreReview ? review : review.slice(0, SHOW_REVIEW)).map((r) => (
              <ReviewRow key={r.id} records={records} tx={r} lineName={lineName} acct={acct} onLine={(l) => sortOne(r, l)} onMore={() => setEditing(r)} />
            ))}
          </div>
          {review.length > SHOW_REVIEW && !moreReview && <button className="hx-add" onClick={() => setMoreReview(true)}>Show all {review.length}</button>}
          {review.length === 0 && <p className="hx-dim">Nothing left to sort.</p>}
        </section>
      )}

      <Browse records={records} month={month} setMonth={setMonth} onOpen={setEditing} lineName={lineName} acct={acct} />

      {importing && <ImportSheet records={records} demoOn={demoOn} initialFiles={importing.files} onClose={() => setImporting(null)} />}
      {editing && <TxEditor records={records} tx={records.find((r) => r.id === editing.id) || editing} onClose={() => setEditing(null)} onSorted={(tx, d, action) => { setOfferDone(""); setOffer({ tx, d, action }); }} />}
      {rulesOpen && <RulesSheet records={records} onClose={() => setRulesOpen(false)} />}
    </div>
  );
}

function ReviewRow({ records, tx, lineName, acct, onLine, onMore }) {
  const d = tx.data;
  const month = d.date.slice(0, 7);
  const groups = useMemo(() => lineOptions(records, month), [records, month]);
  return (
    <div className="hx-txrow hx-review" data-testid={`rv-${d.desc}`}>
      <div className="hx-txtop">
        <span className="hx-line-main">
          <span className="hx-line-name">{d.desc}</span>
          <small>{d.date}{acct(d.account) ? ` · ${acct(d.account)}` : ""}{d.bankCat ? ` · bank says ${d.bankCat}` : ""}{d.histOnly ? " · only in account history" : ""}{d.kind === "refund" ? " · refund" : ""}</small>
        </span>
        <TxAmount d={d} />
      </div>
      <div className="hx-txactions">
        {(d.choices || []).length > 0 ? (
          d.choices.map((c) => <button key={c} className="gr-btn" data-testid={`rv-choice-${lineName(c, month)}`} onClick={() => onLine(c)}>{lineName(c, month) || "?"}</button>)
        ) : (
          <LineSelect groups={groups} value="" onChange={(v) => v && onLine(v)} testid={`rv-line-${d.desc}`} />
        )}
        <button className="gr-btn" data-testid={`rv-more-${d.desc}`} onClick={onMore}>More…</button>
      </div>
    </div>
  );
}

function Browse({ records, month, setMonth, onOpen, lineName, acct }) {
  const [section, setSection] = useState("");
  const [account, setAccount] = useState("");
  const [q, setQ] = useState("");
  const [showAll, setShowAll] = useState(false);
  const info = useMemo(() => lineInfo(records), [records]);
  const cov = monthCoverage(records, month);
  const sections = sectionsOf(records);
  const accounts = accountsOf(records, { includeArchived: true });
  const all = useMemo(() => txForMonth(records, month), [records, month]);
  const needle = q.trim().toLowerCase();
  const list = all.filter((r) => {
    const d = r.data;
    if (!showAll && !COUNTED.includes(d.kind) && d.kind !== "income") return false;
    if (account && d.account !== account) return false;
    if (section) { const secs = txParts(d).map((p) => (p.lineId && info(p.lineId, month) ? info(p.lineId, month).sectionId : "none")); if (!secs.includes(section)) return false; }
    if (needle && !`${d.desc} ${d.orig} ${d.note}`.toLowerCase().includes(needle)) return false;
    return true;
  });
  const hidden = all.length - all.filter((r) => COUNTED.includes(r.data.kind) || r.data.kind === "income").length;
  return (
    <section className="hx-card" data-testid="tx-browse">
      <MonthPicker month={month} onChange={setMonth} testid="tx-month" />
      <p className="hx-dim hx-center" data-testid="tx-coverage">{cov.status === "none" ? "No spending imported for this month yet (no data, not $0)." : cov.status === "partial" ? `Partly imported: ${cov.from} to ${cov.through}.` : "Whole month imported."}</p>
      <div className="hx-filters">
        <select className="hx-select" data-testid="tx-f-section" value={section} onChange={(e) => setSection(e.target.value)}>
          <option value="">All sections</option>
          {sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          <option value="none">Not sorted yet</option>
        </select>
        <select className="hx-select" data-testid="tx-f-account" value={account} onChange={(e) => setAccount(e.target.value)}>
          <option value="">All accounts</option>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <input className="hx-search" type="search" placeholder="Search" data-testid="tx-f-search" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <label className="hx-check"><input type="checkbox" data-testid="tx-f-all" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> Also show transfers and hidden ({hidden})</label>
      <div className="hx-lines" data-testid="tx-list">
        {list.map((r) => {
          const d = r.data;
          const where = d.splits && d.splits.length ? `Split: ${d.splits.map((p) => lineName(p.lineId, month)).join(" + ")}` : d.lineId ? lineName(d.lineId, month) : COUNTED.includes(d.kind) ? "Not sorted yet" : KIND_TEXT[d.kind] || d.kind;
          return (
            <button key={r.id} className="hx-line" data-testid={`tx-${d.desc}`} onClick={() => onOpen(r)}>
              <span className="hx-line-main"><span className="hx-line-name">{d.desc}</span><small>{d.date} · {where}{acct(d.account) ? ` · ${acct(d.account)}` : ""}{d.status === "manual" ? " · by you" : ""}</small></span>
              <span className="hx-line-amt"><TxAmount d={d} /></span>
            </button>
          );
        })}
        {list.length === 0 && <p className="hx-dim">{all.length ? "Nothing matches." : "No transactions in this month."}</p>}
      </div>
    </section>
  );
}

// The sorting rules, in the order they are tried (lowest number first). Edit the pattern or the line, or delete.
function RulesSheet({ records, onClose }) {
  const rules = records.filter((r) => r.type === "rule").sort((a, b) => (Number(a.data.order) || 0) - (Number(b.data.order) || 0));
  const lineName = lineNamer(records);
  const [edit, setEdit] = useState(null);
  const actionText = (a) => (!a ? "?" : a.type === "line" ? lineName(a.line) || "(a deleted line)" : a.type === "ask" ? `Ask: ${(a.choices || []).map((c) => lineName(c) || "?").join(" / ")}` : KIND_TEXT[a.type] || a.type);
  return (
    <Sheet title="Sorting rules" onClose={onClose} testid="rules">
      <p className="hx-dim">Tried in this order on newly imported rows only; the first that matches wins. Rows you sorted by hand are never changed by a rule.</p>
      <div className="hx-lines">
        {rules.map((r) => (
          <button key={r.id} className="hx-line" data-testid={`rule-${r.data.pattern}`} onClick={() => setEdit(r)}>
            <span className="hx-line-main"><span className="hx-line-name hx-mono">{r.data.pattern}</span><small>{[r.data.on === "desc" ? "short description" : "", Array.isArray(r.data.months) && r.data.months.length ? `months ${r.data.months.join(", ")}` : "", Number.isFinite(r.data.amountMin) || Number.isFinite(r.data.amountMax) ? `${fmt(r.data.amountMin ?? 0)}–${r.data.amountMax != null ? fmt(r.data.amountMax) : "any"}` : "", r.data.firstEachMonth ? "first each month" : "", r.data.note || ""].filter(Boolean).join(" · ")}</small></span>
            <span className="hx-line-amt"><span>{actionText(r.data.action)}</span></span>
          </button>
        ))}
        {rules.length === 0 && <p className="hx-dim">No rules yet. Sort a row by hand and say yes to "Always put … here?", or import your seed file.</p>}
      </div>
      {edit && <RuleEditor records={records} rule={edit} onClose={() => setEdit(null)} />}
    </Sheet>
  );
}

function RuleEditor({ records, rule, onClose }) {
  const [pattern, setPattern] = useState(rule.data.pattern);
  const [line, setLine] = useState(rule.data.action && rule.data.action.type === "line" ? rule.data.action.line : "");
  const [err, setErr] = useState("");
  const [confirm, setConfirm] = useState(false);
  const groups = lineOptions(records, monthOf());
  const save = async () => {
    try { new RegExp(pattern, "i"); } catch { return setErr("That pattern is not valid. Plain words work; | means or."); }
    if (!pattern.trim()) return setErr("The pattern can't be empty.");
    const action = rule.data.action && rule.data.action.type === "line" ? { type: "line", line } : rule.data.action;
    if (action.type === "line" && !line) return setErr("Pick a line.");
    await put(rule.id, "rule", { ...rule.data, pattern: pattern.trim(), action });
    onClose();
  };
  return (
    <div className="hx-ruleedit" data-testid="rule-editor">
      <Field label="Pattern (matches the bank's description, upper or lower case)"><input className="hx-mono" data-testid="re-pattern" value={pattern} onChange={(e) => setPattern(e.target.value)} /></Field>
      {rule.data.action && rule.data.action.type === "line" && <Field label="Put on line"><LineSelect groups={groups} value={line} onChange={setLine} testid="re-line" placeholder="Pick a line…" /></Field>}
      {err && <p className="gr-fail" role="alert" data-testid="re-error">{err}</p>}
      <div className="gr-actions" style={{ padding: "8px 0" }}>
        <button className="gr-btn primary" data-testid="re-save" onClick={save}>Save rule</button>
        <button className="gr-btn" onClick={onClose}>Cancel</button>
        <button className="gr-btn hx-danger" data-testid="re-delete" onClick={async () => { if (!confirm) return setConfirm(true); await remove(rule.id); onClose(); }}>{confirm ? "Tap again to delete" : "Delete rule"}</button>
      </div>
    </div>
  );
}

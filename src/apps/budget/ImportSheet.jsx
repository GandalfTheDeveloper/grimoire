// Import: pick one or more CSV files -> (unknown format: map its columns once) -> (new account names: say
// which account each is, once) -> summary with the date range each file covers -> Save.
// Everything happens on this device; the files themselves are never stored or sent anywhere.
import { useMemo, useState } from "react";
import { newId } from "../../core/data.js";
import { put, putBatch, realRecords } from "./store.js";
import { accountsOf, ACCOUNT_KINDS } from "./plan.js";
import { readText, detectFormat, readFile, fileRange, assignIds, planImport, hashId, headerKey, profileProblem, MAP_FIELDS, SIGNS, BUILTIN } from "./imports.js";
import { idKeyFor } from "./txids.js";
import { fmt } from "./money.js";
import { Sheet, Seg, Field } from "./ui.jsx";
import { accountNamer } from "./txui.jsx";

const readBlob = (f) => (f.text ? f.text() : new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsText(f); }));
const profilesOf = (records) => records.filter((r) => r.type === "profile").map((r) => ({ id: r.id, ...r.data }));
const acctMapOf = (records) => Object.fromEntries(records.filter((r) => r.type === "acctmap").map((r) => [r.data.key, r.data.accountId || ""]));

export default function ImportSheet({ records, demoOn, initialFiles, onClose, onDone }) {
  const [files, setFiles] = useState(() => (initialFiles ? load(initialFiles, records) : []));
  const [step, setStep] = useState(initialFiles ? "next" : "pick");
  const [err, setErr] = useState("");
  const [plan, setPlan] = useState(null); // { files (read), result }
  const [ranges, setRanges] = useState([]);
  const [progress, setProgress] = useState("");
  const [done, setDone] = useState(null);

  function load(list, recs) {
    const profiles = profilesOf(recs);
    return list.map(({ name, text }) => { const table = readText(text); return { name, table, fmt: table.headers.length ? detectFormat(table.headers, profiles) : null, empty: !table.rows.length }; });
  }
  const onPick = async (e) => {
    const picked = [...(e.target.files || [])];
    e.target.value = "";
    if (!picked.length) return;
    setErr("");
    try {
      const list = await Promise.all(picked.map(async (f) => ({ name: f.name, text: await readBlob(f) })));
      setFiles(load(list, records));
      setStep("next");
    } catch { setErr("A file could not be read. Pick the CSV files your bank gave you."); }
  };

  const toMap = files.findIndex((f) => !f.fmt && !f.empty);
  const acctMap = acctMapOf(records);
  const readAll = useMemo(() => (toMap === -1 && files.length ? files.filter((f) => f.fmt && !f.empty).map((f) => ({ ...f, ...readFile(f.table, f.fmt) })) : []), [files, toMap]);
  const unmapped = useMemo(() => [...new Set(readAll.flatMap((f) => f.rows.map((r) => r.acctKey)))].filter((k) => !(k in acctMap)), [readAll, acctMap]);

  // once everything is recognised and every account is known: build the import (nothing written yet)
  const build = async () => {
    setErr("");
    try {
      const key = await idKeyFor({ demoOn, realRecords: realRecords(), putReal: (id, type, data) => put(id, type, data, { real: true }) });
      const read = [];
      for (const f of readAll) { await assignIds(f.rows, key); read.push({ ...f, range: fileRange(f.rows) }); }
      const result = planImport({ files: read, records, acctMap, batchId: "pending" });
      setPlan({ read, result, key });
      setRanges(read.map((f) => (f.range ? { from: f.range.from, to: f.range.to } : null)));
      setStep("summary");
    } catch (e) { setErr(e && e.message ? e.message : "The import could not be prepared."); }
  };

  const save = async () => {
    setErr(""); setStep("saving");
    try {
      const batchId = demoOn ? `demo-${newId()}` : newId();
      const files2 = plan.read.map((f, i) => ({ ...f, range: ranges[i] && ranges[i].from && ranges[i].to ? ranges[i] : f.range }));
      const result = planImport({ files: files2, records, acctMap, batchId });
      const existingBal = new Map(records.filter((r) => r.type === "bal" && r.data.auto).map((r) => [r.id, r]));
      const balRecs = [];
      for (const b of result.balances) {
        const id = await hashId(plan.key, "b", `bal|${b.accountId}|${b.month}`);
        const cur = existingBal.get(id);
        if (cur && String(cur.data.asOf || "") >= b.asOf) continue;
        balRecs.push({ id, type: "bal", data: { ...b, auto: true } });
      }
      const batch = { id: batchId, type: "batch", data: { at: Date.now(), files: files2.map((f) => ({ kind: f.fmt.kind, rows: f.rows.length })), ranges: result.summary.ranges, summary: { ...result.summary, ranges: undefined } } };
      const list = [...result.add, ...result.updates, ...balRecs, batch];
      await putBatch(list, { onProgress: (n, t) => setProgress(`Saving ${n} of ${t}…`) });
      setDone({ ...result.summary, balances: balRecs.length });
      setStep("done");
      if (onDone) onDone();
    } catch (e) { setErr(`${e && e.message ? e.message : "The import stopped."} Anything saved so far is safe; importing the same files again skips what is already here.`); setStep("summary"); }
  };

  let body;
  if (step === "pick") {
    body = (
      <>
        <p className="hx-dim">Pick your spending export and your checking account history (and the savings history if you have it). You can pick several files at once. They are read on this device and never stored or sent.</p>
        <input type="file" multiple accept=".csv,text/csv,text/plain" data-testid="imp-files" onChange={onPick} />
      </>
    );
  } else if (toMap !== -1) {
    body = <Mapper key={toMap} file={files[toMap]} onSave={async (p) => {
      const rec = await put(null, "profile", p);
      setFiles((fs) => fs.map((f, i) => (i === toMap ? { ...f, fmt: { ...p, id: rec.id, builtIn: false } } : f)));
    }} />;
  } else if (step === "next" && unmapped.length) {
    body = <AccountStep records={records} keys={unmapped} readAll={readAll} />;
  } else if (step === "next") {
    body = (
      <>
        <ul className="hx-filelist" data-testid="imp-recognised">
          {files.map((f, i) => <li key={i}><b>{f.name}</b> <span className="hx-dim">{f.empty ? "has no rows" : f.fmt ? `${f.fmt.name}${f.fmt.builtIn ? "" : " (your saved format)"}` : ""}</span></li>)}
        </ul>
        {!readAll.length ? <p className="hx-dim">Nothing to import in these files.</p> : <button className="gr-btn primary" data-testid="imp-continue" onClick={build}>Continue</button>}
      </>
    );
  } else if (step === "summary" || step === "saving") {
    body = <Summary records={records} plan={plan} ranges={ranges} setRanges={setRanges} saving={step === "saving"} progress={progress} onSave={save} />;
  } else if (step === "done") {
    body = (
      <div data-testid="imp-done">
        <p className="gr-pass" role="status">Imported {done.new} new transaction{done.new === 1 ? "" : "s"}{done.dupes ? `, skipped ${done.dupes} already here` : ""}{done.balances ? `, ${done.balances} month-end balance${done.balances === 1 ? "" : "s"} filled in` : ""}.</p>
        {done.review > 0 ? <p>{done.review} need{done.review === 1 ? "s" : ""} you to sort {done.review === 1 ? "it" : "them"}: they are at the top of Transactions.</p> : <p>Everything was sorted by your rules.</p>}
        <div className="gr-actions" style={{ padding: "8px 0" }}><button className="gr-btn primary" data-testid="imp-finish" onClick={onClose}>Done</button></div>
      </div>
    );
  }

  return (
    <Sheet title="Import CSV files" onClose={step === "saving" ? () => {} : onClose} testid="imp">
      {body}
      {err && <p className="gr-fail" role="alert" data-testid="imp-error">{err}</p>}
    </Sheet>
  );
}

// ---------- unknown format: pick the columns once ----------
function Mapper({ file, onSave }) {
  const headers = file.table.headers;
  const [kind, setKind] = useState("spend");
  const [sign, setSign] = useState("negativeOut");
  const [dateFmt, setDateFmt] = useState("mdy");
  const [map, setMap] = useState({});
  const [name, setName] = useState("");
  const [err, setErr] = useState("");
  const p = { name: name.trim() || file.name.replace(/\.[^.]+$/, ""), kind, headerKey: headerKey(headers), map: Object.fromEntries(Object.entries(map).filter(([, v]) => v)), sign, dateFmt };
  const problem = profileProblem(p, headers);
  const preview = problem ? [] : readFile({ headers, rows: file.table.rows.slice(0, 4) }, p).rows;
  return (
    <div data-testid="imp-mapper">
      <p><b>{file.name}</b>: The Hoard doesn't know this file's layout yet. Say which column is which, once; it is remembered for next time. Only the column names are shown here.</p>
      <Field label="What kind of file is it?"><Seg options={[["spend", "Spending (cards and accounts)"], ["hist", "Account history"]]} value={kind} onChange={(k) => { setKind(k); if (k === "hist" && sign === "type") setSign("debitCredit"); }} testid="map-kind" /></Field>
      <Field label="How is money going out shown?">
        <select data-testid="map-sign" value={sign} onChange={(e) => setSign(e.target.value)}>
          {Object.entries(SIGNS).filter(([k]) => kind === "spend" || k !== "type").map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </Field>
      <Field label="Dates are written"><select data-testid="map-datefmt" value={dateFmt} onChange={(e) => setDateFmt(e.target.value)}><option value="mdy">Month/Day/Year (10/3/2026)</option><option value="dmy">Day/Month/Year (3/10/2026)</option></select></Field>
      {MAP_FIELDS[kind].filter(([f]) => !((f === "debit" || f === "credit") && sign !== "debitCredit") && !(f === "amount" && sign === "debitCredit") && !(f === "type" && sign !== "type")).map(([f, label, need]) => (
        <Field key={f} label={label}>
          <select data-testid={f === "date" ? "map-date-col" : `map-${f}`} value={map[f] || ""} onChange={(e) => setMap((m) => ({ ...m, [f]: e.target.value }))}>
            <option value="">{need ? "Pick a column…" : "(none)"}</option>
            {headers.map((h) => <option key={h} value={h}>{h}</option>)}
          </select>
        </Field>
      ))}
      <Field label="Name for this format"><input data-testid="map-name" value={name} placeholder={p.name} onChange={(e) => setName(e.target.value)} /></Field>
      {problem ? <p className="hx-note-warn" data-testid="map-problem">{problem}</p> : (
        <div data-testid="map-preview" className="hx-dim">First rows as read: {preview.length ? preview.map((r, i) => <div key={i}>{r.date} · {r.dir === "in" ? "in" : "out"} {fmt(r.amount, { forceCents: true })}</div>) : "none could be read; check the date format and amount columns."}</div>
      )}
      {err && <p className="gr-fail" role="alert">{err}</p>}
      <div className="gr-actions" style={{ padding: "8px 0" }}>
        <button className="gr-btn primary" data-testid="map-save" disabled={!!problem} onClick={async () => { if (problem) return setErr(problem); await onSave(p); }}>Save this format</button>
      </div>
    </div>
  );
}

// ---------- new account names in the files: which account is each? ----------
function AccountStep({ records, keys, readAll }) {
  const accounts = accountsOf(records);
  const [pick, setPick] = useState(() => Object.fromEntries(keys.map((k) => [k, ""])));
  const [err, setErr] = useState("");
  const kindOf = (k) => (readAll.find((f) => f.rows.some((r) => r.acctKey === k)) || { fmt: BUILTIN.spend }).fmt.kind;
  const save = async () => {
    for (const k of keys) if (!pick[k]) return setErr(`Say which account "${k}" is.`);
    for (const k of keys) {
      let accountId = pick[k] === "-" ? "" : pick[k];
      if (pick[k].startsWith("new:")) {
        const kind = pick[k].slice(4);
        const rec = await put(null, "account", { name: k, kind, order: accounts.length, archived: false });
        accountId = rec.id;
      }
      await put(null, "acctmap", { key: k, accountId });
    }
  };
  return (
    <div data-testid="imp-accounts">
      <p>Which of your accounts is each of these? Asked once; remembered for next time.</p>
      {keys.map((k) => (
        <Field key={k} label={`${k} (${kindOf(k) === "hist" ? "account history" : "spending export"})`}>
          <select data-testid={`imp-acct-${k}`} value={pick[k]} onChange={(e) => setPick((p) => ({ ...p, [k]: e.target.value }))}>
            <option value="">Pick…</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            <optgroup label="Add it as a new account">
              {["checking", "savings", "card"].map((kd) => <option key={kd} value={`new:${kd}`}>New {ACCOUNT_KINDS[kd].label.toLowerCase()} account named "{k}"</option>)}
            </optgroup>
            <option value="-">Not one of my accounts (leave unlinked)</option>
          </select>
        </Field>
      ))}
      {err && <p className="gr-fail" role="alert" data-testid="imp-acct-error">{err}</p>}
      <div className="gr-actions" style={{ padding: "8px 0" }}><button className="gr-btn primary" data-testid="imp-acct-save" onClick={save}>Save and continue</button></div>
    </div>
  );
}

// ---------- the summary before anything is saved ----------
function Summary({ records, plan, ranges, setRanges, saving, progress, onSave }) {
  const s = plan.result.summary;
  const acct = accountNamer(records);
  const map = acctMapOf(records);
  const rows = [
    ["Rows read", s.read], ["New", s.new], ["Already here (skipped)", s.dupes], ["Pending (skipped)", s.pending],
    ["Already in the spending export (skipped from history)", s.matched], ["Refunds", s.refunds], ["Transfers", s.transfers], ["Income", s.income],
    ["Sorted by your rules", s.auto], ["Need review", s.review], ...(s.bad ? [["Rows that could not be read", s.bad]] : []),
  ];
  return (
    <div data-testid="imp-summary">
      <dl className="hx-kv">{rows.map(([k, v]) => <FragmentRow key={k} k={k} v={v} />)}</dl>
      <p className="hx-dim" style={{ marginTop: 12 }}>The dates each file covers. Months inside these dates count as imported (a month with no rows there is a real $0, not "no data"). Change them if the export covered more or less.</p>
      {plan.read.map((f, i) => (
        <div key={i} className="hx-range" data-testid={`imp-range-${i}`}>
          <b>{f.name}</b> <span className="hx-dim">{f.fmt.name}{f.range ? "" : ": no rows"}{f.rows.length ? ` · ${[...new Set(f.rows.map((r) => acct(map[r.acctKey]) || r.acctKey))].join(", ")}` : ""}</span>
          {ranges[i] && (
            <span className="hx-rangeinputs">
              <input type="date" aria-label="From" data-testid={`imp-from-${i}`} value={ranges[i].from} onChange={(e) => setRanges((rs) => rs.map((r, j) => (j === i ? { ...r, from: e.target.value } : r)))} />
              <span>to</span>
              <input type="date" aria-label="To" data-testid={`imp-to-${i}`} value={ranges[i].to} onChange={(e) => setRanges((rs) => rs.map((r, j) => (j === i ? { ...r, to: e.target.value } : r)))} />
            </span>
          )}
        </div>
      ))}
      <div className="gr-actions" style={{ padding: "12px 0 4px" }}>
        <button className="gr-btn primary" data-testid="imp-save" disabled={saving} onClick={onSave}>{saving ? progress || "Saving…" : `Save ${s.new} transaction${s.new === 1 ? "" : "s"}`}</button>
      </div>
    </div>
  );
}
function FragmentRow({ k, v }) { return <><dt>{k}</dt><dd data-testid={`imp-sum-${k}`}>{v}</dd></>; }

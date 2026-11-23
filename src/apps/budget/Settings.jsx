// The Hoard's own settings (gear in the top bar): demo mode, and the one-time seed file import.
// Device-only: demo mode and its records. The seed import writes your real, encrypted records (synced).
import { useState } from "react";
import { useHoard, setDemoOn, clearDemo, reloadReal, realRecords, put } from "./store.js";
import { parseSeed, importSeed, SEED_TYPE_TEXT } from "./seed.js";

export default function HoardSettings() {
  const { demoOn } = useHoard();
  const [text, setText] = useState("");
  const [parsed, setParsed] = useState(null);
  const [err, setErr] = useState("");
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [cleared, setCleared] = useState(false);

  const read = (t) => {
    setResult(null); setErr(""); setParsed(null);
    try { setParsed(parseSeed(t)); } catch (e) { setErr(e.message); }
  };
  const onFile = async (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const t = await f.text();
    setText(""); read(t);
    e.target.value = "";
  };
  const run = async () => {
    setBusy(true); setErr("");
    try {
      await reloadReal();
      const r = await importSeed(parsed, realRecords().map((x) => x.id), (id, type, data) => put(id, type, data, { real: true }));
      setResult(r); setParsed(null);
    } catch (e) { setErr(e.message || "The import stopped. Nothing after the error was written; importing again is safe."); }
    setBusy(false);
  };

  return (
    <div className="gr-body" data-testid="hx-settings">
      <div className="gr-section">Demo mode (this device only)</div>
      <div className="gr-list">
        <label className="gr-row">
          <span>Demo mode<small>A made-up plan and a year of made-up balances. Never sent to the Sheet. Your real data is untouched and comes back when you turn this off.</small></span>
          <input className="gr-check" style={{ flex: "0 0 auto" }} type="checkbox" data-testid="hx-set-demo" checked={demoOn} onChange={() => { setCleared(false); setDemoOn(!demoOn); }} />
        </label>
        <div className="gr-actions">
          <button className="gr-btn" data-testid="hx-clear-demo" onClick={() => { clearDemo(); setCleared(true); }}>Clear demo data</button>
          {cleared && <span className="gr-note gr-pass" role="status" data-testid="hx-demo-cleared">Demo data cleared. Real data was not touched.</span>}
        </div>
      </div>

      <div className="gr-section">Import seed file (one time)</div>
      <div className="gr-list">
        <p className="gr-note" style={{ padding: "12px 14px 0" }}>
          Your starting plan, income, accounts and rules. It goes into your real data, encrypted, even while demo mode is on.
          Importing twice is safe: anything already here is left alone. <b>Delete the file afterwards</b> and keep it out of the grimoire folder.
        </p>
        <div className="gr-actions">
          <input type="file" accept=".json,application/json" data-testid="hx-seed-file" onChange={onFile} />
        </div>
        <label className="gr-field"><span>…or paste its contents</span>
          <textarea rows={3} data-testid="hx-seed-text" value={text} onChange={(e) => setText(e.target.value)} />
        </label>
        <div className="gr-actions">
          {text.trim() && <button className="gr-btn" data-testid="hx-seed-check" onClick={() => read(text)}>Check pasted text</button>}
        </div>
        {parsed && (
          <div className="gr-note" style={{ padding: "0 14px" }} data-testid="hx-seed-preview">
            The file holds:
            <ul>{Object.entries(parsed.counts).map(([k, n]) => <li key={k}>{n} {SEED_TYPE_TEXT[k] || k}</li>)}</ul>
            <div className="gr-actions" style={{ padding: "4px 0 12px" }}>
              <button className="gr-btn primary" disabled={busy} data-testid="hx-seed-import" onClick={run}>{busy ? "Importing…" : "Import"}</button>
              <button className="gr-btn" onClick={() => setParsed(null)}>Cancel</button>
            </div>
          </div>
        )}
        {err && <p className="gr-note gr-fail" style={{ padding: "0 14px 12px" }} role="alert" data-testid="hx-seed-error">{err}</p>}
        {result && (
          <p className="gr-note gr-pass" style={{ padding: "0 14px 12px" }} role="status" data-testid="hx-seed-done">
            Imported {result.added} records{result.skipped ? ` (${result.skipped} were already here and were left alone)` : ""}. Now delete the seed file from your computer or phone.
            {demoOn ? " Turn demo mode off to see them." : ""}
          </p>
        )}
      </div>
      <p className="gr-note">To copy everything in The Hoard out as a backup: Grimoire settings (home screen gear), Vault, Import / export.</p>
    </div>
  );
}

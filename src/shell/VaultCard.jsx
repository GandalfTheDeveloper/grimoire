import { useState } from "react";
import { Lock, Unlock } from "lucide-react";
import { APPS } from "../apps/registry.js";
import { vault, sync, migration, collectionsFor } from "../core/index.js";
import { exportApp, importApp, parseExport } from "../core/vaultIO.js";
import { useVaultState } from "./useVault.js";
import { VaultSetup, VaultUnlock, ChangePassphrase } from "./VaultForms.jsx";

const STATE_TEXT = { off: "Not encrypted", on: "Encrypted", in: "Moving in…", out: "Moving out…" };

function AppSwitch({ app }) {
  useVaultState();
  const state = vault.appState(app.id);
  const into = state === "off";
  const [confirm, setConfirm] = useState(false);
  const [steps, setSteps] = useState([]);
  const [result, setResult] = useState(null);
  const [err, setErr] = useState("");
  const busy = steps.length > 0 && !result && !err;
  const run = async () => {
    setConfirm(false); setErr(""); setResult(null); setSteps(["Starting"]);
    try {
      const r = await migration.migrateApp({ app: app.id, direction: into ? "in" : "out", onStep: (s) => setSteps((x) => [...x, s]) });
      setResult(r);
    } catch (e) { setErr(e.message); }
  };
  return (
    <div className="gr-row" style={{ display: "block" }} data-testid={`vault-app-${app.id}`}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <span>{app.name}<small data-testid={`vault-state-${app.id}`}>{STATE_TEXT[state]}</small></span>
        {(state === "off" || state === "on") && !confirm && !busy && (
          <button className="gr-btn" data-testid={`vault-toggle-${app.id}`} onClick={() => { setResult(null); setErr(""); setSteps([]); setConfirm(true); }}>{into ? "Encrypt" : "Stop encrypting"}</button>
        )}
      </div>
      {confirm && (
        <div data-testid={`vault-confirm-${app.id}`}>
          <p className="gr-note">
            {into
              ? "First Grimoire backs up the whole Sheet. Then every record and file of this app is encrypted and copied to a new tab, and checked by reading it back from the Sheet. The app is frozen for a few minutes. Afterwards you can no longer read or edit this app's data directly in the Sheet. Your old readable tab is kept until you delete it yourself."
              : "First Grimoire backs up the whole Sheet. Then this app's records and files are decrypted into readable tabs in your Sheet and checked. Anyone who can open your Sheet or Drive will be able to read them. The old encrypted tab is kept until you delete it yourself."}
          </p>
          <div className="gr-actions">
            <button className="gr-btn primary" data-testid={`vault-start-${app.id}`} onClick={run}>Start</button>
            <button className="gr-btn" onClick={() => setConfirm(false)}>Cancel</button>
          </div>
        </div>
      )}
      {steps.length > 0 && <p className="gr-note" data-testid={`vault-progress-${app.id}`} role="status">{steps[steps.length - 1]}</p>}
      {err && <p className="gr-note gr-fail" data-testid={`vault-error-${app.id}`} role="status">{err} Nothing was lost: the app is back the way it was.</p>}
      {result && (
        <p className="gr-note gr-pass" data-testid={`vault-done-${app.id}`} role="status">
          Done: {result.records} records and {result.files} files moved and checked.
          {result.oldTabs.length > 0 && ` Nothing was erased. The old copy is still in the Sheet tab${result.oldTabs.length > 1 ? "s" : ""} ${result.oldTabs.join(", ")}. When you are happy, delete ${result.oldTabs.length > 1 ? "them" : "it"} by hand (steps in docs/vault.md).`}
        </p>
      )}
    </div>
  );
}

function ImportExport() {
  const apps = APPS.filter((a) => collectionsFor(a.id).length > 0);
  const [id, setId] = useState(apps[0] ? apps[0].id : "");
  const [text, setText] = useState("");
  const [msg, setMsg] = useState("");
  if (apps.length === 0) return <p className="gr-note" data-testid="io-none">No app has data to export yet. This appears when the first app is built.</p>;
  const doExport = async (how) => {
    try {
      const t = JSON.stringify(await exportApp(id, collectionsFor), null, 1);
      if (how === "copy") { await navigator.clipboard.writeText(t); setMsg("Copied everything to the clipboard as text. It is NOT encrypted: paste it somewhere private."); }
      else {
        const url = URL.createObjectURL(new Blob([t], { type: "application/json" }));
        const a = document.createElement("a"); a.href = url; a.download = `grimoire-${id}-export.json`; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
        setMsg("Download started. The file is NOT encrypted.");
      }
    } catch (e) { setMsg(e.code === "locked" ? "Unlock the Vault first." : e.message); }
  };
  const doImport = async (src) => {
    try {
      const s = await importApp(id, parseExport(src), collectionsFor);
      setMsg(`Imported ${s.imported} records (${s.skipped} already here or older).${s.unknown.length ? ` Skipped unknown parts: ${s.unknown.join(", ")}.` : ""}`);
      setText("");
    } catch (e) { setMsg(e.code === "locked" ? "Unlock the Vault first." : e.message); }
  };
  const fromFile = async (e) => { const f = e.target.files && e.target.files[0]; if (f) await doImport(await f.text()); e.target.value = ""; };
  return (
    <div data-testid="vault-io">
      <label className="gr-field"><span>App</span>
        <select data-testid="io-app" value={id} onChange={(e) => setId(e.target.value)}>{apps.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
      <div className="gr-actions">
        <button className="gr-btn" data-testid="io-copy" onClick={() => doExport("copy")}>Copy everything out</button>
        <button className="gr-btn" data-testid="io-download" onClick={() => doExport("file")}>Download as file</button>
      </div>
      <label className="gr-field"><span>Import: paste an export here, or choose a file</span>
        <textarea data-testid="io-text" rows={3} value={text} onChange={(e) => setText(e.target.value)} /></label>
      <div className="gr-actions">
        <button className="gr-btn" data-testid="io-import" disabled={!text.trim()} onClick={() => doImport(text)}>Import pasted text</button>
        <input type="file" data-testid="io-file" accept="application/json,.json,text/plain" onChange={fromFile} />
      </div>
      {msg && <p className="gr-note" data-testid="io-msg" role="status">{msg}</p>}
    </div>
  );
}

export default function VaultCard() {
  const st = useVaultState();
  const [open, setOpen] = useState("");
  return (
    <>
      <div className="gr-section">The Vault</div>
      <div className="gr-list" data-testid="vault-card">
        <div className="gr-row"><span>{!st.setup ? "Not set up yet" : st.unlocked ? "Unlocked" : "Locked"}<small>Encrypts on this device before anything reaches the Sheet or Drive.</small></span>
          {st.setup && (st.unlocked
            ? <button className="gr-btn" data-testid="vault-lock" onClick={() => vault.lock()}><Lock size={14} /> Lock now</button>
            : <Unlock size={18} aria-hidden />)}
        </div>
        {!st.setup && <VaultSetup />}
        {st.setup && !st.unlocked && <VaultUnlock />}
        {st.setup && st.unlocked && (
          <>
            <div className="gr-section" style={{ margin: "12px 14px 6px" }}>Apps</div>
            {APPS.map((a) => <AppSwitch key={a.id} app={a} />)}
            <div className="gr-actions">
              <button className="gr-btn" data-testid="vault-open-change" onClick={() => setOpen(open === "change" ? "" : "change")}>Change passphrase</button>
              <button className="gr-btn" data-testid="vault-open-io" onClick={() => setOpen(open === "io" ? "" : "io")}>Import / export</button>
            </div>
            {open === "change" && <ChangePassphrase />}
            {open === "io" && <ImportExport />}
          </>
        )}
      </div>
      <p className="gr-note">{deviceNote()}</p>
    </>
  );
}

function deviceNote() {
  return window.innerWidth < 700
    ? "This phone stays unlocked until you tap Lock now (your phone's lock screen is the protection)."
    : "This tablet asks for the passphrase every time you open a Vault app, and locks again when you leave it.";
}

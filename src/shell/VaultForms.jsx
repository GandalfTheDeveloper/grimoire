import { useState } from "react";
import { vault, sync } from "../core/index.js";
import { MIN_PASSPHRASE } from "../core/vault.js";
import { getSyncStatus } from "../core/syncStatus.js";

const pw = { type: "password", autoCapitalize: "none", autoCorrect: "off", spellCheck: false, autoComplete: "off" };

// First-time setup. The key record must reach the Sheet, so this needs the connection.
export function VaultSetup({ onDone }) {
  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");
  const [wrote, setWrote] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const ok = p1.length >= MIN_PASSPHRASE && p1 === p2 && wrote && !busy;

  const create = async () => {
    setBusy(true); setMsg("");
    try {
      if (!getSyncStatus().configured) throw new Error("Connect to your Sheet first (Settings, Connection). The Vault's key is stored there so your other device can use it.");
      await sync.syncNow("all"); // another device may already have made one
      await vault.refresh();
      if (vault.setupDone) throw new Error("A Vault already exists (made on another device). Unlock it with that passphrase instead.");
      await vault.setup(p1);
      await sync.syncNow("all");
      setMsg(getSyncStatus().pending > 0 ? "Vault created on this device, but it has not reached the Sheet yet. Keep the app open until the dot is green." : "Vault created and saved to your Sheet.");
      setP1(""); setP2(""); setWrote(false);
      if (onDone) onDone();
    } catch (e) { setMsg(e.message); }
    setBusy(false);
  };

  return (
    <div data-testid="vault-setup">
      <label className="gr-field"><span>New passphrase (at least {MIN_PASSPHRASE} characters; a few random words works well)</span>
        <input data-testid="vault-pass1" {...pw} value={p1} onChange={(e) => setP1(e.target.value)} /></label>
      <label className="gr-field"><span>Type it again</span>
        <input data-testid="vault-pass2" {...pw} value={p2} onChange={(e) => setP2(e.target.value)} /></label>
      {p2 !== "" && p1 !== p2 && <p className="gr-note gr-fail" role="status">The two entries don't match.</p>}
      <label className="gr-row">
        <span>I wrote it down and will keep two copies in two separate places<small>It cannot be recovered. Not by Grimoire, not by anyone. If it is lost, encrypted data is gone for good.</small></span>
        <input className="gr-check" type="checkbox" data-testid="vault-wrote" checked={wrote} onChange={(e) => setWrote(e.target.checked)} />
      </label>
      <div className="gr-actions"><button className="gr-btn primary" data-testid="vault-create" disabled={!ok} onClick={create}>{busy ? "Creating…" : "Create the Vault"}</button></div>
      {msg && <p className="gr-note" data-testid="vault-msg" role="status">{msg}</p>}
    </div>
  );
}

export function VaultUnlock({ onDone }) {
  const [p, setP] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const go = async (e) => {
    if (e) e.preventDefault();
    setBusy(true); setMsg("");
    try { await vault.unlock(p); setP(""); if (onDone) onDone(); }
    catch (err) { setMsg(err.code === "passphrase" ? "That passphrase didn't work." : err.message); }
    setBusy(false);
  };
  return (
    <form data-testid="vault-unlock" onSubmit={go}>
      <label className="gr-field"><span>Passphrase</span><input data-testid="vault-pass" {...pw} value={p} onChange={(e) => setP(e.target.value)} /></label>
      <div className="gr-actions"><button type="submit" className="gr-btn primary" data-testid="vault-unlock-btn" disabled={busy || p === ""}>{busy ? "Unlocking…" : "Unlock"}</button></div>
      {msg && <p className="gr-note gr-fail" data-testid="vault-msg" role="status">{msg}</p>}
    </form>
  );
}

export function ChangePassphrase() {
  const [o, setO] = useState(""); const [n1, setN1] = useState(""); const [n2, setN2] = useState("");
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState("");
  const ok = o !== "" && n1.length >= MIN_PASSPHRASE && n1 === n2 && !busy;
  const go = async () => {
    setBusy(true); setMsg("");
    try {
      await vault.changePassphrase(o, n1);
      await sync.syncNow("all");
      setMsg("Passphrase changed. Your other devices need the new one next time they unlock. Write it down in two places before you close this.");
      setO(""); setN1(""); setN2("");
    } catch (e) { setMsg(e.code === "passphrase" ? "The current passphrase is wrong." : e.message); }
    setBusy(false);
  };
  return (
    <div data-testid="vault-change">
      <label className="gr-field"><span>Current passphrase</span><input data-testid="vault-old" {...pw} value={o} onChange={(e) => setO(e.target.value)} /></label>
      <label className="gr-field"><span>New passphrase (at least {MIN_PASSPHRASE} characters)</span><input data-testid="vault-new1" {...pw} value={n1} onChange={(e) => setN1(e.target.value)} /></label>
      <label className="gr-field"><span>New passphrase again</span><input data-testid="vault-new2" {...pw} value={n2} onChange={(e) => setN2(e.target.value)} /></label>
      <div className="gr-actions"><button className="gr-btn primary" data-testid="vault-change-btn" disabled={!ok} onClick={go}>{busy ? "Changing…" : "Change passphrase"}</button></div>
      {msg && <p className="gr-note" data-testid="vault-change-msg" role="status">{msg}</p>}
    </div>
  );
}

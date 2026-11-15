import { useState } from "react";
import { vault, sync, rekey } from "../core/index.js";
import { MIN_PASSPHRASE } from "../core/vault.js";
import { getSyncStatus } from "../core/syncStatus.js";

const pw = { autoCapitalize: "none", autoCorrect: "off", spellCheck: false, autoComplete: "off" };

// One passphrase box with a Show button, so a typo can be seen instead of guessed at.
export function PassField({ label, testid, showid, value, onChange }) {
  const [show, setShow] = useState(false);
  return (
    <label className="gr-field"><span>{label}</span>
      <span style={{ display: "flex", gap: 8 }}>
        <input data-testid={testid} {...pw} type={show ? "text" : "password"} value={value} onChange={onChange} style={{ flex: 1 }} />
        <button type="button" className="gr-btn" data-testid={showid} onClick={() => setShow(!show)}>{show ? "Hide" : "Show"}</button>
      </span>
    </label>
  );
}

const unlockProblem = (e) => {
  if (e.code !== "passphrase") return e.message;
  if (e.detail === "same") return "That passphrase didn't work. This device's key matches the one in your Sheet, so the key is fine and the passphrase typed doesn't match the one used to create the Vault. Tap Show and check for capital letters, spaces and look-alike characters.";
  if (e.detail === "offline") return "That passphrase didn't work. (Could not reach the Sheet to double-check the key; try again when connected.) Tap Show to check what you typed.";
  return "That passphrase didn't work. Tap Show to check what you typed.";
};

// First-time setup. The key record must reach the Sheet, so this needs the connection.
export function VaultSetup({ onDone }) {
  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");
  const [wrote, setWrote] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const ok = p1.length >= MIN_PASSPHRASE && p1 === p2 && p1 === p1.trim() && wrote && !busy;

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
      <PassField label={`New passphrase (at least ${MIN_PASSPHRASE} characters; a few random words works well)`} testid="vault-pass1" showid="vault-show1" value={p1} onChange={(e) => setP1(e.target.value)} />
      <PassField label="Type it again" testid="vault-pass2" showid="vault-show2" value={p2} onChange={(e) => setP2(e.target.value)} />
      {p1 !== p1.trim() && <p className="gr-note gr-fail" role="status">The passphrase starts or ends with a space. That is easy to miss when typing it later. Remove it.</p>}
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

// Only for a lost passphrase. Needs RESET typed in capitals so it cannot happen by accident.
function StartOver() {
  const [open, setOpen] = useState(false);
  const [word, setWord] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const go = async () => {
    setBusy(true); setMsg("");
    try { await vault.reset(); await sync.syncNow("all"); }
    catch (e) { setMsg(e.message); }
    setBusy(false);
  };
  if (!open) return <div className="gr-actions"><button type="button" className="gr-btn" data-testid="vault-startover" onClick={() => setOpen(true)}>Lost the passphrase? Start over</button></div>;
  return (
    <div data-testid="vault-reset">
      <p className="gr-note gr-fail">Starting over deletes this Vault's key. Anything already encrypted with it can never be opened again, by anyone. Only do this if the Vault holds nothing you need. Your other devices will ask you to set up a new Vault.</p>
      <label className="gr-field"><span>Type RESET to confirm</span>
        <input data-testid="vault-reset-word" autoCapitalize="characters" autoCorrect="off" spellCheck={false} value={word} onChange={(e) => setWord(e.target.value)} /></label>
      <div className="gr-actions">
        <button type="button" className="gr-btn primary" data-testid="vault-reset-go" disabled={word !== "RESET" || busy} onClick={go}>{busy ? "Resetting…" : "Delete the key and start over"}</button>
        <button type="button" className="gr-btn" onClick={() => { setOpen(false); setWord(""); }}>Cancel</button>
      </div>
      {msg && <p className="gr-note gr-fail" role="status">{msg}</p>}
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
    catch (err) { setMsg(unlockProblem(err)); }
    setBusy(false);
  };
  return (
    <form data-testid="vault-unlock" onSubmit={go}>
      <PassField label="Passphrase" testid="vault-pass" showid="vault-show" value={p} onChange={(e) => setP(e.target.value)} />
      <div className="gr-actions"><button type="submit" className="gr-btn primary" data-testid="vault-unlock-btn" disabled={busy || p === ""}>{busy ? "Unlocking…" : "Unlock"}</button></div>
      {msg && <p className="gr-note gr-fail" data-testid="vault-msg" role="status">{msg}</p>}
      <StartOver />
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
      <PassField label="Current passphrase" testid="vault-old" showid="vault-show-old" value={o} onChange={(e) => setO(e.target.value)} />
      <PassField label={`New passphrase (at least ${MIN_PASSPHRASE} characters)`} testid="vault-new1" showid="vault-show-new1" value={n1} onChange={(e) => setN1(e.target.value)} />
      <PassField label="New passphrase again" testid="vault-new2" showid="vault-show-new2" value={n2} onChange={(e) => setN2(e.target.value)} />
      <div className="gr-actions"><button className="gr-btn primary" data-testid="vault-change-btn" disabled={!ok} onClick={go}>{busy ? "Changing…" : "Change passphrase"}</button></div>
      {msg && <p className="gr-note" data-testid="vault-change-msg" role="status">{msg}</p>}
    </div>
  );
}

// Lost or replaced a device: swap the Vault's data key for a new one (docs/lost-device.md says when).
export function RekeyForm() {
  const [pass, setPass] = useState("");
  const [next, setNext] = useState("");
  const [ack, setAck] = useState(false);
  const [steps, setSteps] = useState([]);
  const [err, setErr] = useState("");
  const [result, setResult] = useState(null);
  const busy = steps.length > 0 && !result && !err;
  const newBad = next !== "" && (next.length < MIN_PASSPHRASE || next !== next.trim());
  const ok = pass !== "" && ack && !newBad && !busy;
  const run = async () => {
    setErr(""); setResult(null); setSteps(["Starting"]);
    try {
      const r = await rekey.rekey({ passphrase: pass, newPassphrase: next, onStep: (x) => setSteps((a) => [...a, x]) });
      setResult(r); setPass(""); setNext(""); setAck(false);
    } catch (e) { setErr(e.message); }
  };
  return (
    <div data-testid="vault-rekey">
      <p className="gr-note">Use this after losing a device, or if someone else may have used one. It makes a new key for the Vault and re-encrypts everything, so a lost phone's remembered unlock stops working. Do the other steps in the lost-device plan first (docs/lost-device.md). On every device, wait for the green dot before you start. It backs up the Sheet first and takes a minute or two. Keep Grimoire open until it says Done.</p>
      <PassField label="Current passphrase" testid="rekey-pass" showid="rekey-show" value={pass} onChange={(e) => setPass(e.target.value)} />
      <PassField label={`New passphrase (optional, at least ${MIN_PASSPHRASE} characters; leave empty to keep the current one)`} testid="rekey-new" showid="rekey-show-new" value={next} onChange={(e) => setNext(e.target.value)} />
      {newBad && <p className="gr-note gr-fail" role="status">The new passphrase needs at least {MIN_PASSPHRASE} characters and no space at either end.</p>}
      <label className="gr-row">
        <span>My other devices will lock and ask for the passphrase again<small>This device stays unlocked. It cannot take back what a lost device already holds, so also erase it (see the plan).</small></span>
        <input className="gr-check" type="checkbox" data-testid="rekey-ack" checked={ack} onChange={(e) => setAck(e.target.checked)} />
      </label>
      <div className="gr-actions"><button className="gr-btn primary" data-testid="rekey-go" disabled={!ok} onClick={run}>{busy ? "Re-keying…" : "Re-key the Vault"}</button></div>
      {steps.length > 0 && !result && !err && <p className="gr-note" data-testid="rekey-progress" role="status">{steps[steps.length - 1]}</p>}
      {err && <p className="gr-note gr-fail" data-testid="rekey-error" role="status">{err}</p>}
      {result && <p className="gr-note gr-pass" data-testid="rekey-done" role="status">Done: {result.records} records re-encrypted with a new key and checked in the Sheet.{result.passphraseChanged ? " The passphrase was changed too: write the new one down in two places." : ""} Now unlock your other devices with the passphrase.</p>}
    </div>
  );
}

import { useState } from "react";
import { Copy, Eye, EyeOff } from "lucide-react";
import { sync } from "../core/index.js";
import { setSyncStatus } from "../core/syncStatus.js";
import { loadSyncConfig, saveSyncConfig, generateKey, looksLikeScriptUrl } from "../core/syncConfig.js";

// Settings card: where the backend lives (URL) and the key. Both stay on this device only.
export default function Connection() {
  const saved = loadSyncConfig();
  const [url, setUrl] = useState(saved.url);
  const [key, setKey] = useState(saved.key);
  const [show, setShow] = useState(false);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const urlBad = url.trim() !== "" && !looksLikeScriptUrl(url);
  const keyShort = key.trim() !== "" && key.trim().length < 32;

  const save = () => {
    if (urlBad) { setMsg("That doesn't look like a script address. It should start with https://script.google.com/macros/s/ and end with /exec"); return false; }
    if (keyShort) { setMsg("The key must be at least 32 characters. Use Generate key, or paste the full key."); return false; }
    saveSyncConfig({ url, key });
    setSyncStatus({ configured: url.trim() !== "" && key.trim() !== "" });
    setMsg("Saved on this device.");
    return true;
  };
  const test = async () => {
    if (!save()) return;
    setBusy(true);
    try {
      const r = await sync.call({ action: "ping" });
      setMsg(`Connected. Backend version ${r.version}.`);
      sync.syncNow("all");
    } catch (e) {
      setMsg(`Not connected: ${e.message}`);
    } finally { setBusy(false); }
  };
  const generate = () => { setKey(generateKey()); setShow(true); setMsg("New key made. It is not saved anywhere yet. Copy it, put it in the Sheet's Script Properties (see the setup steps), then tap Save."); };
  const copy = async () => { try { await navigator.clipboard.writeText(key); setMsg("Key copied."); } catch { setMsg("Couldn't copy automatically. Select the key and copy it by hand."); } };

  return (
    <>
      <div className="gr-section">Connection to your Sheet</div>
      <div className="gr-list" data-testid="connection">
        <label className="gr-field">
          <span>Script address</span>
          <input data-testid="conn-url" type="text" inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="https://script.google.com/macros/s/…/exec" value={url} onChange={(e) => setUrl(e.target.value)} />
        </label>
        <label className="gr-field">
          <span>Key</span>
          <div className="gr-inline">
            <input data-testid="conn-key" type={show ? "text" : "password"} autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} />
            <button type="button" className="gr-iconbtn" aria-label={show ? "Hide key" : "Show key"} data-testid="conn-show" onClick={() => setShow(!show)}>{show ? <EyeOff size={18} /> : <Eye size={18} />}</button>
            <button type="button" className="gr-iconbtn" aria-label="Copy key" data-testid="conn-copy" onClick={copy} disabled={!key}><Copy size={18} /></button>
          </div>
        </label>
        <div className="gr-actions">
          <button type="button" className="gr-btn" data-testid="conn-generate" onClick={generate}>Generate key</button>
          <button type="button" className="gr-btn" data-testid="conn-save" onClick={save}>Save</button>
          <button type="button" className="gr-btn primary" data-testid="conn-test" onClick={test} disabled={busy}>{busy ? "Testing…" : "Save and test"}</button>
        </div>
      </div>
      {msg && <p className="gr-note" data-testid="conn-msg" role="status">{msg}</p>}
      <p className="gr-note">Stored on this device only. The key is sent inside each request, never in the address.</p>
    </>
  );
}

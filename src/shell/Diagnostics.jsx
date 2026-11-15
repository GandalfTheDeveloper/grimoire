import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { getSyncStatus, subscribeSync } from "../core/syncStatus.js";
import { allKeys } from "../core/storage.js";
import { APPS } from "../apps/registry.js";
import { deviceType } from "../core/device.js";
import { db, data, sync, selftestCol } from "../core/index.js";
import { runSelfTest, clearSelfTest } from "../core/selftest.js";

// No personal content here. Copy-paste friendly on purpose.
export default function Diagnostics() {
  const s = useSyncExternalStore(subscribeSync, getSyncStatus);
  const [store, setStore] = useState("checking…");
  const [counts, setCounts] = useState(null);
  const [busy, setBusy] = useState("");
  const [result, setResult] = useState(null);

  const loadCounts = useCallback(async () => {
    try { await db.open(); setCounts(await data.counts()); } catch { setCounts({}); }
  }, []);
  useEffect(() => { loadCounts(); }, [loadCounts, s.lastSync, s.pending]);
  useEffect(() => {
    (async () => {
      try {
        const persisted = navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted() : false;
        const est = navigator.storage && navigator.storage.estimate ? await navigator.storage.estimate() : null;
        const used = est && est.usage != null ? `${Math.round(est.usage / 1024)} KB used` : "usage unknown";
        setStore(`${persisted ? "persistent" : "not persistent"}, ${used}`);
      } catch { setStore("unavailable"); }
    })();
  }, []);

  const act = (name, fn) => async () => {
    setBusy(name); setResult(null);
    try {
      if (!getSyncStatus().configured) setResult({ text: "Not connected yet. Add the script address and key under Settings first.", pass: false });
      else setResult(await fn());
    } catch (e) { setResult({ text: `Problem: ${e.message}`, pass: false }); }
    setBusy(""); loadCounts();
  };
  const syncNow = act("sync", async () => { await sync.syncNow("all"); const st = getSyncStatus(); return st.lastError ? { text: `Sync problem: ${st.lastError}`, pass: false } : { text: "Synced.", pass: true }; });
  const resend = act("resend", async () => { const n = await data.markAllDirty(); await sync.syncNow("all"); return { text: `Marked ${n} records to re-send, then synced.`, pass: !getSyncStatus().lastError }; });
  const test = act("test", async () => {
    const r = await runSelfTest({ col: selftestCol, sync, data });
    return { pass: r.pass, text: r.pass ? `Sync test passed (${r.checked} values checked in the real Sheet).` : `Sync test FAILED: ${r.mismatches.join(", ")}` };
  });
  const clear = act("clear", async () => { const n = await clearSelfTest({ col: selftestCol, sync }); return { pass: true, text: `Cleared ${n} test records.` }; });

  const countText = counts && Object.keys(counts).length
    ? Object.entries(counts).map(([k, v]) => `${k} ${v.total - v.deleted}${v.deleted ? ` (+${v.deleted} deleted)` : ""}`).join("; ")
    : "none yet";
  const rows = [
    ["Build", __BUILD__],
    ["Device", deviceType()],
    ["Connection", s.configured ? (s.lastError ? `set up, last attempt failed` : "set up") : "not set up"],
    ["Backend version", s.backendVersion || "unknown until first sync"],
    ["Syncing now", s.syncing ? "yes" : "no"],
    ["Items pending", String(s.pending)],
    ["Last sync", s.lastSync ? new Date(s.lastSync).toLocaleString() : "never"],
    ["Recent errors", s.errors.length ? s.errors.join("; ") : "none"],
    ["Row counts", countText],
    ["Storage", `${db.mode === "opening" ? "opening" : db.mode}; ${store}`],
    ["Storage keys", String(allKeys().filter((k) => k.startsWith("grimoire:")).length)],
    ["Apps registered", String(APPS.length)],
  ];
  const off = !!busy;
  return (
    <div className="gr-body" data-testid="diagnostics">
      <div className="gr-list">
        <dl className="gr-kv">
          {rows.map(([k, v]) => (<span key={k} style={{ display: "contents" }}><dt>{k}</dt><dd>{v}</dd></span>))}
        </dl>
      </div>
      <div className="gr-section">Tools</div>
      <div className="gr-list">
        <div className="gr-actions">
          <button className="gr-btn" data-testid="diag-sync" disabled={off} onClick={syncNow}>{busy === "sync" ? "Syncing…" : "Sync now"}</button>
          <button className="gr-btn" data-testid="diag-test" disabled={off} onClick={test}>{busy === "test" ? "Testing…" : "Run sync test"}</button>
          <button className="gr-btn" data-testid="diag-clear" disabled={off} onClick={clear}>Clear test data</button>
          <button className="gr-btn" data-testid="diag-resend" disabled={off} onClick={resend}>Re-send everything</button>
        </div>
      </div>
      {result && <p className={"gr-note " + (result.pass ? "gr-pass" : "gr-fail")} data-testid="diag-result" role="status">{result.text}</p>}
      <p className="gr-note">The sync test writes three invented rows (times, dates, leading zeros, a formula) into a tab named selftest_items and reads them back to prove Sheets doesn't mangle them. "Re-send everything" is for after you restore the Sheet from a backup. It is safe to run any time.</p>
    </div>
  );
}

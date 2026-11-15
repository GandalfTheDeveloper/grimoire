import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { getSyncStatus, subscribeSync } from "../core/syncStatus.js";
import { allKeys } from "../core/storage.js";
import { APPS } from "../apps/registry.js";
import { deviceType } from "../core/device.js";
import { db, data, sync, selftestCol, vault, vaultTestCol, files, usage } from "../core/index.js";
import { runSelfTest, clearSelfTest, runVaultTest, clearVaultTest, runFileTest } from "../core/selftest.js";
import { useVaultState } from "./useVault.js";

// No personal content here. Copy-paste friendly on purpose.
export default function Diagnostics() {
  const s = useSyncExternalStore(subscribeSync, getSyncStatus);
  const vs = useVaultState();
  const u = useSyncExternalStore(usage.subscribe, usage.get);
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

  const vaultTest = act("vtest", async () => {
    const r = await runVaultTest({ col: vaultTestCol, sync, vault, data });
    return r;
  });
  const vaultClear = act("vclear", async () => ({ pass: true, text: `Cleared ${await clearVaultTest({ col: vaultTestCol, sync })} vault test records.` }));
  const fileTest = act("ftest", async () => runFileTest({ files, vault }));
  const backupNow = act("backup", async () => { const r = await sync.call({ action: "backup" }); return { pass: true, text: `Backup made: ${r.name}. ${r.kept} kept (the last 8) in the Drive folder "Grimoire Backups".` }; });
  const checkUsage = act("usage", async () => { const st = await usage.check({ force: true }); return { pass: st.warnings.length === 0, text: st.warnings.length ? st.warnings.join(" ") : "Usage is fine: the Sheet and your Google storage are well under their limits." }; });

  const pct = (x) => `${(x * 100).toFixed(x < 0.01 && x > 0 ? 2 : 1)}%`;
  const gb = (b) => `${(b / 1024 ** 3).toFixed(2)} GB`;
  const encApps = APPS.filter((a) => vs.setup && vault.isEncrypted(a.id)).map((a) => a.name);
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
    ["Vault", !vs.setup ? "not set up" : vs.unlocked ? "unlocked" : "locked"],
    ["Apps in the Vault", encApps.length ? encApps.join(", ") : "none"],
    ["Files waiting to upload", String(files.pendingCount())],
    ["Sheet size", u.checkedAt ? `${u.cells.toLocaleString("en-US")} of ${u.cellLimit.toLocaleString("en-US")} cells (${pct(u.cellPct)})` : "not checked yet"],
    ["Google storage", u.checkedAt ? `${gb(u.driveUsed)} of ${gb(u.driveLimit)} (${pct(u.drivePct)})` : "not checked yet"],
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
        <div className="gr-actions">
          <button className="gr-btn" data-testid="diag-vtest" disabled={off} onClick={vaultTest}>{busy === "vtest" ? "Testing…" : "Run vault test"}</button>
          <button className="gr-btn" data-testid="diag-vclear" disabled={off} onClick={vaultClear}>Clear vault test data</button>
          <button className="gr-btn" data-testid="diag-ftest" disabled={off} onClick={fileTest}>{busy === "ftest" ? "Testing…" : "Run file test"}</button>
        </div>
        <div className="gr-actions">
          <button className="gr-btn" data-testid="diag-backup" disabled={off} onClick={backupNow}>{busy === "backup" ? "Backing up…" : "Back up now"}</button>
          <button className="gr-btn" data-testid="diag-usage" disabled={off} onClick={checkUsage}>Check usage</button>
        </div>
      </div>
      {result && <p className={"gr-note " + (result.pass ? "gr-pass" : "gr-fail")} data-testid="diag-result" role="status">{result.text}</p>}
      <p className="gr-note">The sync test writes three invented rows (times, dates, leading zeros, a formula) into a tab named selftest_items and reads them back to prove Sheets doesn't mangle them. "Re-send everything" is for after you restore the Sheet from a backup. It is safe to run any time.</p>
      <p className="gr-note">The vault test (needs the Vault unlocked) writes two invented records and checks in the real Sheet that they are scrambled and decrypt back exactly. The file test sends a few MB of invented bytes through your Drive, plain and encrypted, then deletes them. Back up now makes a copy of the Sheet right away, like the weekly one.</p>
    </div>
  );
}

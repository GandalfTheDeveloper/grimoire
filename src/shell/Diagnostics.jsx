import { useEffect, useState, useSyncExternalStore } from "react";
import { getSyncStatus, subscribeSync } from "../core/syncStatus.js";
import { allKeys } from "../core/storage.js";
import { APPS } from "../apps/registry.js";
import { deviceType } from "../core/device.js";

// No personal content here. Copy-paste friendly on purpose.
export default function Diagnostics() {
  const s = useSyncExternalStore(subscribeSync, getSyncStatus);
  const [store, setStore] = useState("checking…");
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
  const rows = [
    ["Build", __BUILD__],
    ["Device", deviceType()],
    ["Items pending", String(s.pending)],
    ["Last sync", s.lastSync ? new Date(s.lastSync).toLocaleString() : "never (sync not built yet)"],
    ["Recent errors", s.errors.length ? s.errors.join("; ") : "none"],
    ["Row counts", "none yet"],
    ["Storage", store],
    ["Storage keys", String(allKeys().filter((k) => k.startsWith("grimoire:")).length)],
    ["Apps registered", String(APPS.length)],
  ];
  return (
    <div className="gr-body" data-testid="diagnostics">
      <div className="gr-list">
        <dl className="gr-kv">
          {rows.map(([k, v]) => (<span key={k} style={{ display: "contents" }}><dt>{k}</dt><dd>{v}</dd></span>))}
        </dl>
      </div>
    </div>
  );
}

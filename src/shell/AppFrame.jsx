import { Suspense, lazy, useEffect, useMemo } from "react";
import { getApp } from "../apps/registry.js";
import { themeStyle } from "../core/theme.js";
import TopBar from "./TopBar.jsx";
import { go } from "../core/useRoute.js";
import { deviceType } from "../core/device.js";
import { vault } from "../core/index.js";
import { useVaultState } from "./useVault.js";
import VaultGate from "./VaultGate.jsx";

// Loads one app on demand, wrapped in its own theme. Closing the app unmounts it, which is what
// stops its timers, polling, wake locks and listeners (apps clean up in useEffect returns).
export default function AppFrame({ id }) {
  const app = getApp(id);
  const Comp = useMemo(() => (app ? lazy(app.load) : null), [app]);
  useVaultState();
  // Tablet rule (charter): a Vault app locks again when you leave it. The phone stays unlocked until Lock now.
  useEffect(() => () => { if (deviceType() === "tablet" && vault.isEncrypted(id)) vault.lock(); }, [id]);
  if (!app) {
    return (
      <>
        <TopBar title="Not found" onBack={() => go("/")} />
        <div className="gr-body"><p className="gr-empty">That app doesn't exist.</p></div>
      </>
    );
  }
  return (
    <div style={{ ...themeStyle(app.theme), display: "flex", flexDirection: "column", flex: 1, minHeight: 0, background: "var(--bg)" }} data-testid={`frame-${id}`}>
      <TopBar title={app.name} onBack={() => go("/")} lockable={vault.isEncrypted(id) && vault.getState().unlocked} />
      <VaultGate app={app}>
        <Suspense fallback={<div className="gr-body"><p className="gr-empty">Loading…</p></div>}>
          <Comp />
        </Suspense>
      </VaultGate>
    </div>
  );
}

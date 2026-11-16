import { Suspense, lazy, useEffect, useMemo, useState } from "react";
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
//
// An app with its own settings (meta.settings, loaded on demand like the app) gets a gear in the top bar.
// Its settings open as a panel over the app, which stays open underneath, so whatever you were typing is
// still there when you come back. The back arrow closes the panel.
export default function AppFrame({ id }) {
  const app = getApp(id);
  const Comp = useMemo(() => (app ? lazy(app.load) : null), [app]);
  const SettingsComp = useMemo(() => (app && app.settings ? lazy(app.settings) : null), [app]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  useVaultState();
  // Tablet rule (charter): a Vault app locks again when you leave it. The phone stays unlocked until Lock now.
  useEffect(() => () => { if (deviceType() === "tablet" && vault.isEncrypted(id)) vault.lock(); }, [id]);
  useEffect(() => setSettingsOpen(false), [id]);
  if (!app) {
    return (
      <>
        <TopBar title="Not found" onBack={() => go("/")} />
        <div className="gr-body"><p className="gr-empty">That app doesn't exist.</p></div>
      </>
    );
  }
  const loading = <div className="gr-body"><p className="gr-empty">Loading…</p></div>;
  return (
    <div style={{ ...themeStyle(app.theme), display: "flex", flexDirection: "column", flex: 1, minHeight: 0, background: "var(--bg)" }} data-testid={`frame-${id}`}>
      <TopBar
        title={settingsOpen ? `${app.name} settings` : app.name}
        onBack={settingsOpen ? () => setSettingsOpen(false) : () => go("/")}
        onAppSettings={SettingsComp && !settingsOpen ? () => setSettingsOpen(true) : null}
        lockable={vault.isEncrypted(id) && vault.getState().unlocked}
      />
      <VaultGate app={app}>
        {SettingsComp ? (
          // only apps with settings get this extra layer, so apps without settings (Fitness) lay out exactly as before
          <div style={{ position: "relative", display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
            <Suspense fallback={loading}><Comp /></Suspense>
            {settingsOpen && (
              <div data-testid="app-settings-panel" style={{ position: "absolute", inset: 0, zIndex: 20, display: "flex", flexDirection: "column", background: "var(--bg)" }}>
                <Suspense fallback={loading}><SettingsComp /></Suspense>
              </div>
            )}
          </div>
        ) : (
          <Suspense fallback={loading}><Comp /></Suspense>
        )}
      </VaultGate>
    </div>
  );
}

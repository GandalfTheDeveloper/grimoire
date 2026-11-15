import { Suspense, lazy, useMemo } from "react";
import { getApp } from "../apps/registry.js";
import { themeStyle } from "../core/theme.js";
import TopBar from "./TopBar.jsx";
import { go } from "../core/useRoute.js";

// Loads one app on demand, wrapped in its own theme. Closing the app unmounts it, which is what
// stops its timers, polling, wake locks and listeners (apps clean up in useEffect returns).
export default function AppFrame({ id }) {
  const app = getApp(id);
  const Comp = useMemo(() => (app ? lazy(app.load) : null), [app]);
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
      <TopBar title={app.name} onBack={() => go("/")} />
      <Suspense fallback={<div className="gr-body"><p className="gr-empty">Loading…</p></div>}>
        <Comp />
      </Suspense>
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import "./shell.css";
import { slate, themeStyle } from "../core/theme.js";
import { go, useRoute } from "../core/useRoute.js";
import { loadAppsOnDevice, saveAppsOnDevice, loadOpenOnLaunch, saveOpenOnLaunch } from "../core/deviceSettings.js";
import { requestPersistence, getItem } from "../core/storage.js";
import { setAppPending } from "../core/syncStatus.js";
import { getApp, APPS } from "../apps/registry.js";
import { initCore, registerAppCollections, sync } from "../core/index.js";
import TopBar from "./TopBar.jsx";
import Home from "./Home.jsx";
import Settings from "./Settings.jsx";
import Diagnostics from "./Diagnostics.jsx";
import AppFrame from "./AppFrame.jsx";
import UpdateBanner from "./UpdateBanner.jsx";
import UsageBanner from "./UsageBanner.jsx";

export default function App() {
  const route = useRoute();
  const [appIds, setAppIds] = useState(loadAppsOnDevice);
  const [openOnLaunch, setOpenOnLaunch] = useState(loadOpenOnLaunch);
  const launched = useRef(false);
  const openRef = useRef(null);

  // Edits an app (Fitness) left waiting on this device count in the status dot from the moment Grimoire opens.
  useEffect(() => {
    APPS.forEach((a) => { const q = getItem(a.id, "queue", []); if (Array.isArray(q) && q.length) setAppPending(a.id, q.length); });
  }, []);

  // Sync runs here in the shell, so switching apps never interrupts it. Stops when the shell unmounts.
  useEffect(() => {
    registerAppCollections(APPS);
    let cancelled = false;
    initCore().then(() => { if (!cancelled) sync.start({ getOpenApp: () => openRef.current }); });
    return () => { cancelled = true; sync.stop(); };
  }, []);
  useEffect(() => {
    openRef.current = route.name === "app" ? route.id : null;
    sync.setOpenApp(openRef.current);
  }, [route]);

  // Open on launch: applied once, only when no route was given (a fresh open).
  useEffect(() => {
    if (launched.current) return;
    launched.current = true;
    requestPersistence();
    const hash = window.location.hash.replace(/^#\/?/, "");
    if (hash) return;
    const target = loadOpenOnLaunch();
    if (target !== "home" && getApp(target) && loadAppsOnDevice().includes(target)) {
      window.history.replaceState(null, "", `#/app/${target}`);
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    }
  }, []);

  const updateIds = (ids) => { setAppIds(ids); saveAppsOnDevice(ids); if (!ids.includes(openOnLaunch) && openOnLaunch !== "home") updateLaunch("home"); };
  const updateLaunch = (v) => { setOpenOnLaunch(v); saveOpenOnLaunch(v); };

  let body;
  if (route.name === "app") body = <AppFrame id={route.id} />;
  else if (route.name === "settings") body = (<><TopBar title="Settings" onBack={() => go("/")} /><Settings appIds={appIds} onAppIds={updateIds} openOnLaunch={openOnLaunch} onOpenOnLaunch={updateLaunch} /></>);
  else if (route.name === "diagnostics") body = (<><TopBar title="Diagnostics" onBack={() => window.history.length > 1 ? window.history.back() : go("/settings")} /><Diagnostics /></>);
  else body = (<><TopBar title="Grimoire" showSettings /><Home appIds={appIds} /></>);

  return (
    <div className="gr" style={themeStyle(slate)} data-testid="shell">
      <UpdateBanner />
      <UsageBanner />
      {body}
    </div>
  );
}

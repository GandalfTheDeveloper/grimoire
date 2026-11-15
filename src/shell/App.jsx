import { useEffect, useRef, useState } from "react";
import "./shell.css";
import { slate, themeStyle } from "../core/theme.js";
import { go, useRoute } from "../core/useRoute.js";
import { loadAppsOnDevice, saveAppsOnDevice, loadOpenOnLaunch, saveOpenOnLaunch } from "../core/deviceSettings.js";
import { requestPersistence } from "../core/storage.js";
import { getApp } from "../apps/registry.js";
import TopBar from "./TopBar.jsx";
import Home from "./Home.jsx";
import Settings from "./Settings.jsx";
import Diagnostics from "./Diagnostics.jsx";
import AppFrame from "./AppFrame.jsx";
import UpdateBanner from "./UpdateBanner.jsx";

export default function App() {
  const route = useRoute();
  const [appIds, setAppIds] = useState(loadAppsOnDevice);
  const [openOnLaunch, setOpenOnLaunch] = useState(loadOpenOnLaunch);
  const launched = useRef(false);

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
      {body}
    </div>
  );
}

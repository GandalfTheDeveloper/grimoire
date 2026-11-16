import { ArrowLeft, Lock, Maximize2, Minimize2, Settings as Gear } from "lucide-react";
import { vault } from "../core/index.js";
import { useFullscreen } from "../core/fullscreen.js";
import { useSyncExternalStore } from "react";
import { getSyncStatus, subscribeSync, totalPending } from "../core/syncStatus.js";
import { go } from "../core/useRoute.js";

export function StatusDot() {
  const s = useSyncExternalStore(subscribeSync, getSyncStatus);
  const pending = totalPending(s);
  const amber = pending > 0;
  return (
    <button
      className={"gr-dot" + (amber ? " amber" : "")}
      data-testid="status-dot"
      aria-label={amber ? `${pending} items waiting on this device` : "Everything is in the Sheet"}
      onClick={() => go("/diagnostics")}
    >
      <i />
      {amber ? pending : null}
    </button>
  );
}

// showSettings: Grimoire's settings (home screen). onAppSettings: the open app's own settings (apps that have them).
export default function TopBar({ title, onBack, showSettings, onAppSettings, lockable }) {
  const fs = useFullscreen();
  return (
    <header className="gr-top" data-testid="topbar">
      {onBack && (
        <button className="gr-iconbtn" aria-label="Back" data-testid="back" onClick={onBack}>
          <ArrowLeft size={20} />
        </button>
      )}
      <div className="gr-title">{title}</div>
      <StatusDot />
      {lockable && (
        <button className="gr-iconbtn" aria-label="Lock the Vault now" data-testid="lock-now" onClick={() => vault.lock()}>
          <Lock size={20} />
        </button>
      )}
      {fs.supported && (
        <button className="gr-iconbtn" aria-label={fs.on ? "Exit full screen" : "Full screen"} data-testid="fullscreen" onClick={fs.toggle}>
          {fs.on ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
        </button>
      )}
      {onAppSettings && (
        <button className="gr-iconbtn" aria-label={`${title} settings`} data-testid="app-settings" onClick={onAppSettings}>
          <Gear size={20} />
        </button>
      )}
      {showSettings && (
        <button className="gr-iconbtn" aria-label="Settings" data-testid="open-settings" onClick={() => go("/settings")}>
          <Gear size={20} />
        </button>
      )}
    </header>
  );
}

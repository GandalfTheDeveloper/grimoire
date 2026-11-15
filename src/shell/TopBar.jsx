import { ArrowLeft, Settings as Gear } from "lucide-react";
import { useSyncExternalStore } from "react";
import { getSyncStatus, subscribeSync } from "../core/syncStatus.js";
import { go } from "../core/useRoute.js";

export function StatusDot() {
  const s = useSyncExternalStore(subscribeSync, getSyncStatus);
  const amber = s.pending > 0;
  return (
    <button
      className={"gr-dot" + (amber ? " amber" : "")}
      data-testid="status-dot"
      aria-label={amber ? `${s.pending} items waiting on this device` : "Everything is in the Sheet"}
      onClick={() => go("/diagnostics")}
    >
      <i />
      {amber ? s.pending : null}
    </button>
  );
}

export default function TopBar({ title, onBack, showSettings }) {
  return (
    <header className="gr-top" data-testid="topbar">
      {onBack && (
        <button className="gr-iconbtn" aria-label="Back" data-testid="back" onClick={onBack}>
          <ArrowLeft size={20} />
        </button>
      )}
      <div className="gr-title">{title}</div>
      <StatusDot />
      {showSettings && (
        <button className="gr-iconbtn" aria-label="Settings" data-testid="open-settings" onClick={() => go("/settings")}>
          <Gear size={20} />
        </button>
      )}
    </header>
  );
}

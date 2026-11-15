import { useState, useSyncExternalStore } from "react";
import { usage } from "../core/index.js";
import { go } from "../core/useRoute.js";

// Charter: warn at 80% of the Sheet's cell limit and at 85% of Google storage. Dismiss hides it until the next launch.
export default function UsageBanner() {
  const u = useSyncExternalStore(usage.subscribe, usage.get);
  const [hidden, setHidden] = useState(false);
  if (hidden || !u.warnings.length) return null;
  return (
    <div className="gr-banner" role="alert" data-testid="usage-banner">
      <span>{u.warnings.join(" ")}</span>
      <span style={{ display: "flex", gap: 6 }}>
        <button onClick={() => go("/diagnostics")}>Details</button>
        <button data-testid="usage-dismiss" onClick={() => setHidden(true)}>Dismiss</button>
      </span>
    </div>
  );
}

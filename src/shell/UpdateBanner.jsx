import { useSyncExternalStore } from "react";
import { applyUpdate, subscribeUpdates, updateReady } from "../core/updates.js";

export default function UpdateBanner() {
  const ready = useSyncExternalStore(subscribeUpdates, updateReady);
  if (!ready) return null;
  return (
    <div className="gr-banner" data-testid="update-banner" role="status">
      <span>Update available</span>
      <button data-testid="update-now" onClick={applyUpdate}>Update now</button>
    </div>
  );
}

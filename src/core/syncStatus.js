// Status the header dot and Diagnostics read. The sync engine writes here; nothing else should.
// green = pending is 0, amber = items waiting on this device.
let state = {
  pending: 0,
  lastSync: null,
  errors: [],
  syncing: false,
  configured: false,
  backendVersion: null,
  lastError: null,
  appPending: 0, // edits waiting inside apps that keep their own queue (Fitness), added to the dot
};
const listeners = new Set();

export const getSyncStatus = () => state;
export function setSyncStatus(next) {
  const changed = Object.keys(next).some((k) => {
    const a = state[k], b = next[k];
    return Array.isArray(a) && Array.isArray(b) ? a.length !== b.length || a.some((x, i) => x !== b[i]) : a !== b;
  });
  if (!changed) return; // no change, no re-render
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}
// Apps that keep their own queue report how many edits are waiting; the dot and Diagnostics add it to the sync engine's count.
const appQueues = {};
export function setAppPending(appId, n) {
  appQueues[appId] = n;
  setSyncStatus({ appPending: Object.values(appQueues).reduce((a, b) => a + b, 0) });
}
export const totalPending = (s) => s.pending + (s.appPending || 0);
export function subscribeSync(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

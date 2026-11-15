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
export function subscribeSync(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

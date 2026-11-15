// Placeholder for the sync engine (Round 2). The header dot and Diagnostics read from this store,
// so they already work with fake values and need no change when real sync arrives.
let state = { pending: 0, lastSync: null, errors: [] };
const listeners = new Set();

export const getSyncStatus = () => state;
export function setSyncStatus(next) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}
export function subscribeSync(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

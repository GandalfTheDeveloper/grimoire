// Service worker registration + "update available" signal.
let waiting = null;
const listeners = new Set();
const notify = () => listeners.forEach((l) => l());

export const updateReady = () => !!waiting;
export function subscribeUpdates(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function applyUpdate() {
  if (waiting) waiting.postMessage("SKIP_WAITING");
}

export function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("./sw.js").then((reg) => {
    const watch = (sw) => {
      sw.addEventListener("statechange", () => {
        if (sw.state === "installed" && navigator.serviceWorker.controller) {
          waiting = sw;
          notify();
        }
      });
    };
    if (reg.waiting && navigator.serviceWorker.controller) {
      waiting = reg.waiting;
      notify();
    }
    reg.addEventListener("updatefound", () => reg.installing && watch(reg.installing));
    // Check for a new version whenever the app comes back to the foreground.
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") reg.update().catch(() => {});
    });
  }).catch(() => {});
  let reloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloaded) return;
    reloaded = true;
    window.location.reload();
  });
}

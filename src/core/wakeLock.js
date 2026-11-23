// Keeps the screen on while `active` is true (Super Shrexy's tablet display mode uses this).
//
// Why this is more than one request: the browser can drop a screen wake lock on its own (the page is
// hidden, the screen is turned off, battery saver, another app on top). When that happens the lock
// object is marked "released" but nothing tells the app unless it listens. The old code kept the
// released lock in its ref, saw "I already have one" and never asked again, so after the first drop
// the tablet fell back to its normal screen timeout for the rest of the day.
//
// This hook:
//   - asks for the lock when active, and clears its ref the moment the browser releases it
//   - asks again when the page becomes visible, on any tap, and every 30 seconds as a safety net
//   - reports its state ({ supported, held, error }) so Settings can show whether it is working
//   - gives the lock back and stops everything when inactive or unmounted (charter: stop on close)
import { useEffect, useRef, useState } from "react";

export const WAKE_RETRY_MS = 30 * 1000;

export function useWakeLock(active) {
  const lockRef = useRef(null);
  const pendingRef = useRef(false);
  const [state, setState] = useState({ supported: typeof navigator !== "undefined" && "wakeLock" in navigator, held: false, error: null });

  useEffect(() => {
    const supported = typeof navigator !== "undefined" && "wakeLock" in navigator;
    let alive = true;
    const report = (patch) => { if (alive) setState((s) => ({ ...s, supported, ...patch })); };

    const held = () => !!lockRef.current && !lockRef.current.released;

    const acquire = async () => {
      if (!alive || !active || !supported || pendingRef.current || held()) return;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return; // the browser refuses while hidden
      pendingRef.current = true;
      try {
        const lock = await navigator.wakeLock.request("screen");
        if (!alive || !active) { lock.release?.().catch?.(() => {}); return; }
        lockRef.current = lock;
        lock.addEventListener?.("release", () => {
          if (lockRef.current === lock) lockRef.current = null;
          report({ held: false });
        });
        report({ held: true, error: null });
      } catch (err) {
        lockRef.current = null;
        report({ held: false, error: (err && (err.name || err.message)) || "refused" });
      } finally {
        pendingRef.current = false;
      }
    };

    const release = () => {
      const lock = lockRef.current;
      lockRef.current = null;
      if (lock) lock.release?.().catch?.(() => {});
    };

    if (!active) { release(); report({ held: false, error: null }); return () => { alive = false; }; }

    acquire();
    const onVisible = () => { if (document.visibilityState === "visible") acquire(); };
    const onTap = () => acquire();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pointerdown", onTap, true);
    const timer = setInterval(acquire, WAKE_RETRY_MS);
    return () => {
      alive = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pointerdown", onTap, true);
      release();
    };
  }, [active]);

  return state;
}

// One line for Settings, in plain words.
export function wakeLockText(st, active) {
  if (!active) return "Only used in display mode (the tablet view).";
  if (!st.supported) return "Off: this browser can't keep the screen on. The device's own screen timeout applies.";
  if (st.held) return "On: the screen stays awake while this view is open.";
  if (st.error) return `Off: the browser refused (${st.error}). Battery saver can cause this. Tap the screen to retry.`;
  return "Starting…";
}

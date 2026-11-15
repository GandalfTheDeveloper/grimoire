// Full screen (hides the clock, wifi and battery bar). Two layers:
//  1. The manifest asks Android to launch the installed app full screen (display_override).
//  2. A toggle button for when the browser allows it. Browsers only allow entering full screen from a tap,
//     so it can never switch on by itself at launch. iPhone Safari does not offer it for web apps; the button hides there.
import { useEffect, useState } from "react";

export const fullscreenSupported = () => typeof document !== "undefined" && !!document.fullscreenEnabled;
export const isFullscreen = () => typeof document !== "undefined" && !!document.fullscreenElement;
// true when the installed app was already launched full screen by the manifest
export const launchedFullscreen = () => typeof window !== "undefined" && !!window.matchMedia && window.matchMedia("(display-mode: fullscreen)").matches;

export function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen?.();
  else document.documentElement.requestFullscreen?.().catch(() => {});
}

export function useFullscreen() {
  const [on, setOn] = useState(isFullscreen);
  useEffect(() => {
    const h = () => setOn(isFullscreen());
    document.addEventListener("fullscreenchange", h);
    return () => document.removeEventListener("fullscreenchange", h);
  }, []);
  return { on, supported: fullscreenSupported() && !launchedFullscreen(), toggle: toggleFullscreen };
}

import { useEffect, useState } from "react";

// Hash routes: "#/" home, "#/app/<id>", "#/settings", "#/diagnostics".
// Using the hash keeps iOS swipe-back and Android back working with no server config.
export function parseHash(hash) {
  const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  if (parts[0] === "app" && parts[1]) return { name: "app", id: parts[1] };
  if (parts[0] === "settings") return { name: "settings" };
  if (parts[0] === "diagnostics") return { name: "diagnostics" };
  return { name: "home" };
}
export const go = (path) => { window.location.hash = path; };

export function useRoute() {
  const [route, setRoute] = useState(() => parseHash(window.location.hash));
  useEffect(() => {
    const on = () => setRoute(parseHash(window.location.hash));
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return route;
}

// Per-device connection settings (never synced): the script URL and the key.
// Stored on this device only, under grimoire:sync:*. The key travels in request bodies, never in a URL.
import { getItem, setItem } from "./storage.js";

export const loadSyncConfig = () => getItem("sync", "config", { url: "", key: "" });
export function saveSyncConfig({ url, key }) {
  return setItem("sync", "config", { url: String(url || "").trim(), key: String(key || "").trim() });
}

export function getDeviceId() {
  let id = getItem("sync", "deviceId", null);
  if (!id) {
    id = Math.random().toString(36).slice(2, 10);
    setItem("sync", "deviceId", id);
  }
  return id;
}

// 48 random characters from a-z, A-Z, 0-9 (about 285 bits). Uses the browser's secure random source.
export function generateKey() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = new Uint8Array(48);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += chars[b % chars.length];
  return out;
}

export const looksLikeScriptUrl = (u) => /^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(String(u).trim());

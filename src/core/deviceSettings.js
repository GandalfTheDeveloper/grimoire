// Per-device settings (never synced): which apps this device uses, and what opens on launch.
import { getItem, setItem } from "./storage.js";
import { appsForDevice } from "../apps/registry.js";
import { deviceType } from "./device.js";

export function loadAppsOnDevice() {
  const saved = getItem("shell", "appsOnDevice", null);
  const valid = appsForDevice(deviceType()).map((a) => a.id);
  if (!Array.isArray(saved)) return valid;
  return saved.filter((id) => valid.includes(id));
}
export const saveAppsOnDevice = (ids) => setItem("shell", "appsOnDevice", ids);

// "home" or an app id. Default: phone opens home, tablet opens Fitness.
export function defaultOpenOnLaunch() {
  return deviceType() === "tablet" ? "fitness" : "home";
}
export function loadOpenOnLaunch() {
  return getItem("shell", "openOnLaunch", null) ?? defaultOpenOnLaunch();
}
export const saveOpenOnLaunch = (v) => setItem("shell", "openOnLaunch", v);

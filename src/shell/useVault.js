import { useSyncExternalStore } from "react";
import { vault } from "../core/index.js";

// Re-renders when the Vault is set up, locked, unlocked, or an app's encryption changes.
export const useVaultState = () => useSyncExternalStore(vault.subscribe, vault.getState);

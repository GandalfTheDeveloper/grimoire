import { Lock } from "lucide-react";
import { useVaultState } from "./useVault.js";
import { vault } from "../core/index.js";
import { VaultSetup, VaultUnlock } from "./VaultForms.jsx";

// Wraps an app that is in the Vault. Shows setup or unlock instead of the app until it can be used.
export default function VaultGate({ app, children }) {
  useVaultState();
  const frozen = vault.isFrozen(app.id);
  if (frozen) return <div className="gr-body" data-testid="vault-frozen"><p className="gr-empty">This app is being moved {vault.appState(app.id) === "in" ? "into" : "out of"} the Vault.<br />It opens again in a moment.</p></div>;
  if (!vault.isEncrypted(app.id)) return children;
  const st = vault.getState();
  if (!st.setup) {
    return (
      <div className="gr-body" data-testid="vault-gate-setup">
        <p className="gr-note"><Lock size={14} /> {app.name} is kept in the Vault, which is not set up yet. Create it once; it covers every app you put in the Vault.</p>
        <div className="gr-list"><VaultSetup /></div>
      </div>
    );
  }
  if (!st.unlocked) {
    return (
      <div className="gr-body" data-testid="vault-gate-unlock">
        <p className="gr-note"><Lock size={14} /> {app.name} is locked. Enter your passphrase.</p>
        <div className="gr-list"><VaultUnlock /></div>
      </div>
    );
  }
  return children;
}

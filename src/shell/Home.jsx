import { Lock } from "lucide-react";
import { getApp } from "../apps/registry.js";
import { go } from "../core/useRoute.js";

export default function Home({ appIds }) {
  const apps = appIds.map(getApp).filter(Boolean);
  return (
    <div className="gr-body">
      {apps.length === 0 ? (
        <p className="gr-empty">No apps on this device yet.<br />Turn some on in Settings.</p>
      ) : (
        <div className="gr-grid" data-testid="home-grid">
          {apps.map((a) => {
            const Icon = a.icon;
            return (
              <button key={a.id} className="gr-tile" data-testid={`tile-${a.id}`} onClick={() => go(`/app/${a.id}`)}>
                <span className="row">
                  <Icon size={24} />
                  {a.vault && <Lock size={14} aria-label="In the Vault" />}
                </span>
                <span className="name">{a.name}</span>
              </button>
            );
          })}
        </div>
      )}
      <div className="gr-foot" data-testid="build-number">Build {__BUILD__}</div>
    </div>
  );
}

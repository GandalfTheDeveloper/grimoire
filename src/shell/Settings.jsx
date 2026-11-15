import { APPS, appsForDevice } from "../apps/registry.js";
import { deviceType } from "../core/device.js";
import { go } from "../core/useRoute.js";

export default function Settings({ appIds, onAppIds, openOnLaunch, onOpenOnLaunch }) {
  const available = appsForDevice(deviceType());
  const toggle = (id) => onAppIds(appIds.includes(id) ? appIds.filter((x) => x !== id) : [...appIds, id]);
  const launchOptions = [{ id: "home", name: "Home screen" }, ...APPS.filter((a) => appIds.includes(a.id))];
  return (
    <div className="gr-body" data-testid="settings">
      <div className="gr-section">This device</div>
      <div className="gr-list">
        <label className="gr-row">
          <span>Open on launch<small>Per device. Not synced.</small></span>
          <select data-testid="open-on-launch" value={openOnLaunch} onChange={(e) => onOpenOnLaunch(e.target.value)}>
            {launchOptions.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </label>
      </div>
      <div className="gr-section">Apps on this device</div>
      <div className="gr-list">
        {available.map((a) => (
          <label key={a.id} className="gr-row">
            <span>{a.name}</span>
            <input className="gr-check" type="checkbox" data-testid={`toggle-${a.id}`} checked={appIds.includes(a.id)} onChange={() => toggle(a.id)} />
          </label>
        ))}
      </div>
      <p className="gr-note">Only these apps sync down to this device. Everything is always backed up in the Sheet.</p>
      <button className="gr-link" data-testid="open-diagnostics" onClick={() => go("/diagnostics")}>Diagnostics</button>
    </div>
  );
}

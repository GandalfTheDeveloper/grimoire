// Golden Ratio's own settings, opened from the gear in the top bar (Grimoire's settings are on the home screen).
// Synced: the same on every device.
import { useGoldenSettings } from "./settings.js";

export default function GoldenSettings() {
  const s = useGoldenSettings();
  return (
    <div className="gr-body" data-testid="gx-settings">
      <div className="gr-section">Golden Ratio</div>
      <div className="gr-list">
        <label className="gr-row">
          <span>Show "Try demo mode"<small>The link at the top of the history. You can always leave demo mode.</small></span>
          <input className="gr-check" style={{ flex: "0 0 auto" }} type="checkbox" data-testid="gx-set-demo" checked={!s.hideDemo} onChange={() => s.update({ hideDemo: !s.hideDemo })} />
        </label>
        <label className="gr-row">
          <span>Copy the unit too<small>{s.copyUnit ? 'On: copies "6.1803 mm".' : 'Off: copies "6.1803".'} Feet-and-inches values always keep their ' and " marks.</small></span>
          <input className="gr-check" style={{ flex: "0 0 auto" }} type="checkbox" data-testid="gx-set-copyunit" checked={s.copyUnit} onChange={() => s.update({ copyUnit: !s.copyUnit })} />
        </label>
      </div>
      <p className="gr-note">These settings sync, so they are the same on every device.</p>
    </div>
  );
}

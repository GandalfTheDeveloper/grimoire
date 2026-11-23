// The Hoard inside Grimoire. Seven sections share one month picker; the shell's VaultGate has already
// made sure the Vault is unlocked before this opens.
import { useState } from "react";
import { LayoutDashboard, ListChecks, Receipt, Landmark, Home, PiggyBank, Target } from "lucide-react";
import "./hoard.css";
import { useHoard } from "./store.js";
import { monthOf } from "./plan.js";
import { getItem, setItem } from "../../core/storage.js";
import Overview from "./Overview.jsx";
import Plan from "./Plan.jsx";
import Balances from "./Balances.jsx";
import Later from "./Later.jsx";

export const SECTIONS = [
  ["overview", "Overview", LayoutDashboard], ["plan", "Plan", ListChecks], ["transactions", "Transactions", Receipt],
  ["balances", "Balances", Landmark], ["mortgage", "Mortgage", Home], ["retirement", "Retirement", PiggyBank], ["goals", "Goals", Target],
];

export default function App() {
  const { records, demoOn, loaded, error } = useHoard();
  const [tab, setTabState] = useState(() => { const t = getItem("budget", "tab", "overview"); return SECTIONS.some(([id]) => id === t) ? t : "overview"; });
  const [month, setMonth] = useState(monthOf);
  const setTab = (t) => { setTabState(t); setItem("budget", "tab", t); };

  let body;
  if (!loaded) body = <p className="gr-empty">Opening…</p>;
  else if (error) body = <p className="gr-empty" data-testid="hx-error">{error}</p>;
  else if (tab === "overview") body = <Overview records={records} month={month} setMonth={setMonth} go={setTab} />;
  else if (tab === "plan") body = <Plan records={records} month={month} setMonth={setMonth} demoOn={demoOn} />;
  else if (tab === "balances") body = <Balances records={records} month={month} setMonth={setMonth} />;
  else body = <Later section={tab} />;

  return (
    <div className="hx" data-testid="hx-app">
      <nav className="hx-tabs" role="tablist" aria-label="The Hoard sections">
        {SECTIONS.map(([id, label, Icon]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? "on" : ""} data-testid={`hx-tab-${id}`} onClick={() => setTab(id)}>
            <Icon size={18} /><span>{label}</span>
          </button>
        ))}
      </nav>
      {demoOn && <div className="hx-demo" data-testid="hx-demo-banner">Demo mode: made-up numbers, kept on this device only. Turn it off in settings (gear, top right).</div>}
      <div className="hx-scroll">{body}</div>
    </div>
  );
}

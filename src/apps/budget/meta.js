import { Wallet } from "lucide-react";
import { slate } from "../../core/theme.js";

export const app = {
  id: "budget",
  name: "Budget",
  icon: Wallet,
  devices: ["phone", "tablet"], // confirm at this app's planning
  vault: false,
  theme: { ...slate, name: "Budget (placeholder)" }, // each app gets its own theme at its build
  note: "Planned. Manual entry and uploads only. Vault decision at its planning.",
  load: () => import("./index.jsx"),
};

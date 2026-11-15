import { ListChecks } from "lucide-react";
import { slate } from "../../core/theme.js";

export const app = {
  id: "lists",
  name: "Lists",
  icon: ListChecks,
  devices: ["phone", "tablet"], // confirm at this app's planning
  vault: true,
  theme: { ...slate, name: "Lists (placeholder)" }, // each app gets its own theme at its build
  note: "Planned. In the Vault. The most complex app.",
  load: () => import("./index.jsx"),
};

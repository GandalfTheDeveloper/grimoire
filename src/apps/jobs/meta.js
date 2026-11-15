import { Briefcase } from "lucide-react";
import { slate } from "../../core/theme.js";

export const app = {
  id: "jobs",
  name: "Job Search",
  icon: Briefcase,
  devices: ["phone", "tablet"], // confirm at this app's planning
  vault: false,
  theme: { ...slate, name: "Job Search (placeholder)" }, // each app gets its own theme at its build
  note: "Planned. Vault decision at its planning.",
  load: () => import("./index.jsx"),
};

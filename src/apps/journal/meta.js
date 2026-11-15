import { BookOpen } from "lucide-react";
import { slate } from "../../core/theme.js";

export const app = {
  id: "journal",
  name: "Journal",
  icon: BookOpen,
  devices: ["phone", "tablet"], // confirm at this app's planning
  vault: true,
  theme: { ...slate, name: "Journal (placeholder)" }, // each app gets its own theme at its build
  note: "Planned. In the Vault. Imports your existing journal doc.",
  load: () => import("./index.jsx"),
};

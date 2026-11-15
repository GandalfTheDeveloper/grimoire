import { Dumbbell } from "lucide-react";
import { slate } from "../../core/theme.js";

// Fitness keeps Shrexy's own dark-teal look (its palette is still hard-coded inside the app for now).
export const app = {
  id: "fitness",
  name: "Fitness",
  icon: Dumbbell,
  devices: ["phone", "tablet"],
  vault: false,
  theme: {
    name: "Fitness (Shrexy teal)",
    vars: { ...slate.vars, "--bg": "#0D1917", "--card": "#152321", "--card-hover": "#1A2C29", "--line": "#243733", "--ink": "#E9F2EF", "--sub": "#7FA39B", "--dim": "#5C7C75", "--accent": "#2FD9C0" },
  },
  note: "Super Shrexy Tracker, nested (Phase 2). Still talks to the old Shrexy Apps Script until Phase 3.",
  load: () => import("./index.jsx"),
};

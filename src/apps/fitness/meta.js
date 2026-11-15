import { Dumbbell } from "lucide-react";
import { slate } from "../../core/theme.js";

export const app = {
  id: "fitness",
  name: "Fitness",
  icon: Dumbbell,
  devices: ["phone", "tablet"], // confirm at this app's planning
  vault: false,
  theme: { ...slate, name: "Fitness (placeholder)" }, // each app gets its own theme at its build
  note: "Super Shrexy Tracker moves in here in Phase 2.",
  load: () => import("./index.jsx"),
};

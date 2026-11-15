import { Sparkles } from "lucide-react";
import { slate } from "../../core/theme.js";

export const app = {
  id: "goldenratio",
  name: "Golden Ratio",
  icon: Sparkles,
  devices: ["phone", "tablet"], // confirm at this app's planning
  vault: false,
  theme: { ...slate, name: "Golden Ratio (placeholder)" }, // each app gets its own theme at its build
  note: "Planned. Starts simple and may gain saved data.",
  load: () => import("./index.jsx"),
};

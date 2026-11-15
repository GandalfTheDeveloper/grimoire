import { ChefHat } from "lucide-react";
import { slate } from "../../core/theme.js";

export const app = {
  id: "cookbook",
  name: "Cookbook",
  icon: ChefHat,
  devices: ["phone", "tablet"], // confirm at this app's planning
  vault: false,
  theme: { ...slate, name: "Cookbook (placeholder)" }, // each app gets its own theme at its build
  note: "Planned. Uses your macro database. Adds ingredients to the grocery list.",
  load: () => import("./index.jsx"),
};

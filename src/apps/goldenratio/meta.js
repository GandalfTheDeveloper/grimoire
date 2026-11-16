import { Sparkles } from "lucide-react";
import iconSrc from "./icon.svg";
import { slate } from "../../core/theme.js";
import { COLLECTIONS } from "./schema.js";

// Golden Ratio: neutral grey (no green tint), Super Shrexy's gold for calculated values, white for typed values.
// a, b and a+b are turquoise, red and white everywhere (graphic, fields, history boxes); gold only ever means "calculated".
export const app = {
  id: "goldenratio",
  name: "Golden Ratio",
  icon: Sparkles, // fallback only; the tile shows iconSrc (gold spiral)
  iconSrc,
  devices: ["phone", "tablet"], // "tablet" is also what a computer browser counts as (700 px and wider)
  vault: false,
  collections: COLLECTIONS, // history -> goldenratio_history, settings -> goldenratio_settings
  theme: {
    name: "Golden Ratio (grey and gold)",
    vars: {
      ...slate.vars,
      "--bg": "#3A3A3C", "--card": "#2B2B2D", "--card-hover": "#47474A", "--line": "#4E4E52",
      "--ink": "#F4F7F6", "--sub": "#A8A8AD", "--dim": "#86868B", "--accent": "#E3B23C",
      "--gx-gold": "#E3B23C", "--gx-typed": "#F4F7F6",
      "--gx-a": "#2FD9C0", "--gx-b": "#F0453F", "--gx-whole": "#F4F7F6", // Shrexy turquoise, Shrexy red (brightened for thin lines on grey), Shrexy white
      "--gx-on-a": "#06211D", "--gx-on-b": "#ffffff", "--gx-on-gold": "#332405",
      "--gx-keypad": "#222224", "--gx-key": "#3A3A3C", "--gx-key2": "#4A4A4D", "--gx-select": "#E3B23C33",
    },
  },
  note: "Golden ratio calculator with synced history. Spec: docs/apps/goldenratio.md.",
  load: () => import("./index.jsx"),
  settings: () => import("./Settings.jsx"), // the gear in the top bar while the app is open
};

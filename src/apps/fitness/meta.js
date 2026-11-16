import { Dumbbell } from "lucide-react";
import iconSrc from "./icon.png";
import { slate } from "../../core/theme.js";
import { COLLECTIONS } from "./schema.js";

// Super Shrexy keeps its own dark-teal look. The palette lives here; the app reads it through theme.js.
export const app = {
  id: "fitness",
  name: "Super Shrexy",
  icon: Dumbbell, // fallback only; the tile shows iconSrc (the original Super Shrexy "S" icon)
  iconSrc,
  devices: ["phone", "tablet"],
  vault: false,
  collections: COLLECTIONS, // daily, exercise, run, notes, plan (see schema.js)
  theme: {
    name: "Super Shrexy (teal)",
    vars: {
      ...slate.vars,
      "--bg": "#0D1917", "--card": "#152321", "--card-hover": "#1A2C29", "--line": "#243733",
      "--ink": "#E9F2EF", "--sub": "#7FA39B", "--dim": "#5C7C75", "--accent": "#2FD9C0",
      // Super Shrexy's extra palette (used through src/apps/fitness/theme.js)
      "--fx-gold": "#E3B23C", "--fx-red": "#D00000", "--fx-slate": "#3A4D48", "--fx-white": "#F4F7F6",
      "--fx-on-accent": "#06211D", "--fx-on-gold": "#332405", "--fx-on-red": "#ffffff",
      "--fx-scrim": "#000000cc", "--fx-scrim-light": "#000000a6",
      "--fx-shadow": "0 12px 40px #000000aa", "--fx-shadow-soft": "0 6px 22px #000000aa",
    },
  },
  note: "Super Shrexy Tracker (fitness), nested in Grimoire. Uses Grimoire's one connection.",
  load: () => import("./index.jsx"),
};

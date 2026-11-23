import { Coins } from "lucide-react";
import { slate } from "../../core/theme.js";
import { COLLECTIONS } from "./schema.js";

// The Hoard (ID "budget", which never changes). Spec: docs/apps/budget.md.
// Colors (Isaac's scheme, charter v1.7): grey background, red = spending, blue = money in, gold = savings,
// white = values you typed (plan targets are white marks). "Blue" is Super Shrexy's turquoise, as everywhere.
export const app = {
  id: "budget",
  name: "The Hoard",
  icon: Coins,
  devices: ["phone", "tablet"], // "tablet" is also what a computer browser counts as (700 px and wider)
  vault: true, // in the Vault from day one (charter section 5)
  collections: COLLECTIONS, // data -> budget_dataenc, tx -> budget_txenc (encrypted twins)
  theme: {
    name: "The Hoard (grey, red, blue, gold, white)",
    vars: {
      ...slate.vars,
      "--bg": "#3A3A3C", "--card": "#2B2B2D", "--card-hover": "#47474A", "--line": "#4E4E52",
      "--ink": "#F4F7F6", "--sub": "#B4B4B9", "--dim": "#8E8E93", "--accent": "#E3B23C",
      "--hx-red": "#F0453F", "--hx-blue": "#2FD9C0", "--hx-gold": "#E3B23C", "--hx-white": "#F4F7F6",
      "--hx-track": "#232325", "--hx-sheet": "#2B2B2D",
    },
  },
  note: "Budget, balances, mortgage, retirement and goals. Spec: docs/apps/budget.md.",
  load: () => import("./index.jsx"),
  settings: () => import("./Settings.jsx"),
};

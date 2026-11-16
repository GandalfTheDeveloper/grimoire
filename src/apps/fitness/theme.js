// ---- Palette: dark teal base, turquoise / mustard gold / red accents ----
// The actual colors live in meta.js (the app's theme vars). Components only use these names, which are
// CSS variables, so changing the palette (or adding a second theme) touches meta.js only.
export const BG = "var(--bg)";
export const CARD = "var(--card)";
export const CARD2 = "var(--card-hover)";
export const LINE = "var(--line)";
export const INK = "var(--ink)";
export const SUB = "var(--sub)";
export const ACCENT = "var(--accent)"; // turquoise - primary
export const GOLD = "var(--fx-gold)"; // mustard - partial / secondary
export const REDC = "var(--fx-red)"; // matched red - none / alert / delete
export const SLATE = "var(--fx-slate)"; // neutral / no-data
export const WHITE_C = "var(--fx-white)";
export const ON_ACCENT = "var(--fx-on-accent)"; // text on a turquoise button
export const ON_GOLD = "var(--fx-on-gold)"; // text on a gold button
export const ON_RED = "var(--fx-on-red)";
export const SCRIM = "var(--fx-scrim)"; // dim layer behind a popup
export const SCRIM_LIGHT = "var(--fx-scrim-light)";
export const SHADOW = "var(--fx-shadow)";
export const SHADOW_SOFT = "var(--fx-shadow-soft)";

export const RAINBOW = [ACCENT, GOLD, REDC, WHITE_C];

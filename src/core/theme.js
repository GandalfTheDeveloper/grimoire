// Theme tokens. Shell and every app get their own theme object; components only read CSS variables
// (never hard-coded colors), so a theme swap (custom images, new palette) touches this file only.
export const slate = {
  name: "Quiet slate",
  vars: {
    "--bg": "#101113",
    "--bg-image": "none",       // later: a custom background image, e.g. url(...)
    "--card": "#18191c",
    "--card-hover": "#1e2024",
    "--line": "#2a2c30",
    "--ink": "#e6e7e9",
    "--sub": "#9ca3af",
    "--dim": "#6b7280",
    "--accent": "#e6e7e9",
    "--ok": "#5dcaa5",
    "--warn": "#e3b23c",
    "--danger": "#e24b4a",
    "--radius": "14px",
    "--font": "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  },
};

export function themeStyle(theme) {
  return { ...theme.vars };
}

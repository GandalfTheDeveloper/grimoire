import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import pkg from "./package.json" with { type: "json" };

// Build number: version + UTC date/time of the build. Shown in the app so stale code is easy to spot.
const BUILD_ID = `${pkg.version}-${Date.now()}`;
const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
export default defineConfig({
  base: "./",
  plugins: [
    react(),
    {
      // Stamp the service worker with the build id so every deploy is a byte-different worker.
      name: "stamp-sw",
      closeBundle() {
        const f = "dist/sw.js";
        if (fs.existsSync(f)) fs.writeFileSync(f, fs.readFileSync(f, "utf8").replaceAll("__BUILD_ID__", BUILD_ID));
      },
    },
  ],
  define: {
    __BUILD__: JSON.stringify(`${pkg.version} · ${stamp} UTC`),
    __BUILD_ID__: JSON.stringify(BUILD_ID),
  },
  test: { environment: "jsdom", globals: true },
});

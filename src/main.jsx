import React from "react";
import { createRoot } from "react-dom/client";
import App from "./shell/App.jsx";
import { registerServiceWorker } from "./core/updates.js";
import { blockZoom } from "./core/noZoom.js";

blockZoom();
createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
if (import.meta.env.PROD) registerServiceWorker();

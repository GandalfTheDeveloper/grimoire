import Placeholder from "../../shell/Placeholder.jsx";
import { app } from "./meta.js";

// Empty app slot. The real app replaces this file when its build round happens.
export default function App() {
  return <Placeholder app={app} />;
}

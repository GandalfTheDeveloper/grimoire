import GoldenCalculator from "./GoldenCalculator.jsx";

// Full-screen Golden Ratio inside Grimoire. The calculator itself is self-contained (see GoldenCalculator.jsx)
// so another app can later open it as a pop-up without any change to it.
export default function App() {
  return <GoldenCalculator source="goldenratio" />;
}

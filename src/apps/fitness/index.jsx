import WorkoutTracker from "./WorkoutTracker.jsx";

// Super Shrexy Tracker, nested (Phase 2). Closing the app unmounts this, which stops its timers,
// polling, wake lock and listeners. Notes on the minimal changes: docs/apps/fitness.md.
export default function App() {
  return <WorkoutTracker />;
}

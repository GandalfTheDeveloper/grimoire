// Super Shrexy's records in Grimoire's shared format. One collection per old tab, same column names,
// so the Sheet tabs (fitness_daily, fitness_exercise, fitness_run, fitness_notes, fitness_plan) read like the old ones
// plus the standard columns (Id, CreatedAt, UpdatedAt, SyncedAt, Deleted, SchemaVersion).
export const FIELDS = {
  daily: { Date: "text", Weight: "number", CompletionStatus: "text", Notes: "text", StatusManual: "text" },
  exercise: { Date: "text", ExerciseName: "text", SetNumber: "number", Reps: "number", Weight: "number" },
  run: { Date: "text", Distance: "number", Time: "text", Pace: "text" },
  notes: { Date: "text", Note: "text" },
  plan: { Key: "text", Rows: "json" },
};
export const COLLECTIONS = Object.entries(FIELDS).map(([name, fields]) => ({ name, fields }));

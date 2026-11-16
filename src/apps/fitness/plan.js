import { dayName, startOfWeek } from "./dates.js";

export const PLAN_DAYS = [
  { Week: 1, DayOfWeek: "Monday", Type: "Lift", MuscleGroups: "Back, Biceps, Core", Notes: "" },
  { Week: 1, DayOfWeek: "Tuesday", Type: "Run+Mobility", MuscleGroups: "Cardio, Flexibility", Notes: "30-45 min trail run zone 2 + yoga" },
  { Week: 1, DayOfWeek: "Wednesday", Type: "Lift", MuscleGroups: "Chest, Legs, Calves", Notes: "" },
  { Week: 1, DayOfWeek: "Thursday", Type: "Lift", MuscleGroups: "Core, Biceps, Triceps", Notes: "Pickleball same day" },
  { Week: 1, DayOfWeek: "Friday", Type: "Rest", MuscleGroups: "", Notes: "Full rest day" },
  { Week: 1, DayOfWeek: "Saturday", Type: "Run", MuscleGroups: "Cardio", Notes: "30-45 min trail run zone 2" },
  { Week: 1, DayOfWeek: "Sunday", Type: "Lift", MuscleGroups: "Chest, Shoulders, Butt, Legs, Calves, Triceps", Notes: "" },
  { Week: 2, DayOfWeek: "Monday", Type: "Lift", MuscleGroups: "Back, Biceps, Core", Notes: "" },
  { Week: 2, DayOfWeek: "Tuesday", Type: "Run+Mobility", MuscleGroups: "Cardio, Flexibility", Notes: "30-45 min trail run zone 2 + yoga" },
  { Week: 2, DayOfWeek: "Wednesday", Type: "Lift", MuscleGroups: "Chest, Legs, Calves", Notes: "" },
  { Week: 2, DayOfWeek: "Thursday", Type: "Lift", MuscleGroups: "Core, Biceps, Triceps", Notes: "Pickleball same day" },
  { Week: 2, DayOfWeek: "Friday", Type: "Rest", MuscleGroups: "", Notes: "Full rest day" },
  { Week: 2, DayOfWeek: "Saturday", Type: "HIIT", MuscleGroups: "Cardio", Notes: "Jump rope VO2 max intervals" },
  { Week: 2, DayOfWeek: "Sunday", Type: "Lift", MuscleGroups: "Chest, Shoulders, Butt, Legs, Calves, Triceps", Notes: "" },
];

export const RAW_EX = `1,Monday,1,Back,Cable Rows,3,12
1,Monday,2,Back,Bent Over Fly's,3,15
1,Monday,3,Back,Hyperextensions,3,12
1,Monday,4,Back,Dumbbell Row,3,12
1,Monday,5,Biceps,Bicep Barbell Curls,3,8
1,Monday,6,Biceps,Hammer Curls,3,12
1,Monday,7,Biceps,Incline Dumbbell Curls,3,10
1,Monday,8,Core,Hanging Leg Raises,3,10
1,Monday,9,Core,Weighted Vee Twists,3,12
1,Monday,10,Core,Plank,3,60s
1,Wednesday,1,Chest,Dumbbell Bench Press,3,10
1,Wednesday,2,Chest,Incline Dumbbell Press,3,8
1,Wednesday,3,Chest,Dumbbell Chest Fly,3,10
1,Wednesday,4,Legs,Squats,3,8
1,Wednesday,5,Legs,Bulgarian Split Squats,3,10
1,Wednesday,6,Calves,Calf Raises,4,15-20
1,Wednesday,7,Triceps,Tricep Rope Pushdown,2,12
1,Thursday,1,Core,Ab Roller,3,10
1,Thursday,2,Core,Weighted Vee Twists,3,12
1,Thursday,3,Core,Hanging Leg Raises,3,10
1,Thursday,4,Biceps,Concentration Curls,3,10
1,Thursday,5,Biceps,EZ Bar Preacher Curls,3,12
1,Thursday,6,Biceps,Alternating Dumbbell Curls,3,12
1,Thursday,7,Triceps,Face Pulls,2,12
1,Thursday,8,Triceps,Overhead Tricep Extension,3,12
1,Sunday,1,Chest,Incline Dumbbell Press,3,10
1,Sunday,2,Chest,Slow Pushups,2,Failure
1,Sunday,3,Chest,Cable Crossovers,3,12
1,Sunday,4,Shoulders,Seated Dumbbell Press,3,10
1,Sunday,5,Shoulders,Lateral Raises,3,15
1,Sunday,6,Shoulders,Front Raises,3,10
1,Sunday,7,Butt,Bulgarian Split Squats,3,12
1,Sunday,8,Butt,Weighted Hip Thrusts,3,12
1,Sunday,9,Butt,Weighted Step Ups,3,12
1,Sunday,10,Legs,Leg Curls,3,12
1,Sunday,11,Legs,Leg Extensions,3,12
1,Sunday,12,Legs,Leg Press,3,10
1,Sunday,13,Calves,Calf Raises,4,15-20
1,Sunday,14,Triceps,Overhead Tricep Extension,3,12
1,Sunday,15,Triceps,Face Pulls,2,12
2,Monday,1,Back,Cable Rows,3,12
2,Monday,2,Back,Bent Over Fly's,3,15
2,Monday,3,Back,Hyperextensions,3,12
2,Monday,4,Back,Dumbbell Row,3,12
2,Monday,5,Biceps,Bicep Barbell Curls,3,8
2,Monday,6,Biceps,Hammer Curls,3,12
2,Monday,7,Biceps,Incline Dumbbell Curls,3,10
2,Monday,8,Core,Hanging Leg Raises,3,10
2,Monday,9,Core,Weighted Vee Twists,3,12
2,Monday,10,Core,Plank,3,60s
2,Wednesday,1,Chest,Dumbbell Bench Press,3,10
2,Wednesday,2,Chest,Incline Dumbbell Press,3,8
2,Wednesday,3,Chest,Dumbbell Chest Fly,3,10
2,Wednesday,4,Legs,Squats,3,8
2,Wednesday,5,Legs,Bulgarian Split Squats,3,10
2,Wednesday,6,Calves,Calf Raises,4,15-20
2,Wednesday,7,Triceps,Tricep Rope Pushdown,2,12
2,Thursday,1,Core,Ab Roller,3,10
2,Thursday,2,Core,Weighted Vee Twists,3,12
2,Thursday,3,Core,Hanging Leg Raises,3,10
2,Thursday,4,Biceps,Concentration Curls,3,10
2,Thursday,5,Biceps,EZ Bar Preacher Curls,3,12
2,Thursday,6,Biceps,Alternating Dumbbell Curls,3,12
2,Thursday,7,Triceps,Face Pulls,2,12
2,Thursday,8,Triceps,Overhead Tricep Extension,3,12
2,Sunday,1,Chest,Incline Dumbbell Press,3,10
2,Sunday,2,Chest,Slow Pushups,2,Failure
2,Sunday,3,Chest,Cable Crossovers,3,12
2,Sunday,4,Shoulders,Seated Dumbbell Press,3,10
2,Sunday,5,Shoulders,Lateral Raises,3,15
2,Sunday,6,Shoulders,Front Raises,3,10
2,Sunday,7,Butt,Bulgarian Split Squats,3,12
2,Sunday,8,Butt,Weighted Hip Thrusts,3,12
2,Sunday,9,Butt,Weighted Step Ups,3,12
2,Sunday,10,Legs,Leg Curls,3,12
2,Sunday,11,Legs,Leg Extensions,3,12
2,Sunday,12,Legs,Leg Press,3,10
2,Sunday,13,Calves,Calf Raises,4,15-20
2,Sunday,14,Triceps,Overhead Tricep Extension,3,12
2,Sunday,15,Triceps,Face Pulls,2,12`;

// "weighted" (reps + weight), "reps" (bodyweight, reps only), "time" (timer, seconds only)
export const REPS_ONLY_NAMES = new Set(["Hanging Leg Raises", "Ab Roller", "Slow Pushups"]);
export function classifyExerciseType(name, targetReps) {
  if (/s$/i.test(String(targetReps || "").trim())) return "time";
  if (REPS_ONLY_NAMES.has(name)) return "reps";
  return "weighted";
}

export const PLAN_EXERCISES = RAW_EX.split("\n").map((line) => {
  const [Week, DayOfWeek, Order, MuscleGroup, ExerciseName, TargetSets, TargetReps] = line.split(",");
  return { Week: Number(Week), DayOfWeek, Order: Number(Order), MuscleGroup, ExerciseName, TargetSets, TargetReps, ExerciseType: classifyExerciseType(ExerciseName, TargetReps) };
});

export function getWeekNumber(date, anchorStr) {
  const anchor = new Date(anchorStr + "T00:00:00");
  const monday = startOfWeek(date);
  const anchorMonday = startOfWeek(anchor);
  const diffWeeks = Math.round((monday - anchorMonday) / (7 * 86400000));
  const mod = ((diffWeeks % 2) + 2) % 2;
  return mod === 0 ? 1 : 2;
}
export const parseTargetSets = (ts) => { const n = parseInt(ts, 10); return isNaN(n) ? 1 : n; };
// Fixed once, on purpose: this used to be a per-device editable setting, which
// let each device's local storage drift out of sync with the others (one
// device says Week 1, another says Week 2, for the same calendar day).
// Sep 21, 2026 is a confirmed Week 1 Monday.
export const CYCLE_ANCHOR = "2026-09-21";
export function getPlanTypeForDate(dateStr, anchorDate) {
  const d = new Date(dateStr + "T00:00:00");
  const wk = getWeekNumber(d, anchorDate);
  return PLAN_DAYS.find((p) => p.Week === wk && p.DayOfWeek === dayName(d))?.Type;
}
export const planKey = (wk, dn) => `${wk}-${dn}`;
export function getEffectiveExercises(overrides, wk, dn) {
  const key = planKey(wk, dn);
  if (overrides && overrides[key]) return overrides[key].map((e, i) => ({ ...e, Week: wk, DayOfWeek: dn, Order: i + 1, ExerciseType: e.ExerciseType || "weighted" }));
  return PLAN_EXERCISES.filter((e) => e.Week === wk && e.DayOfWeek === dn).sort((a, b) => a.Order - b.Order);
}
export const DAYS_OF_WEEK = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

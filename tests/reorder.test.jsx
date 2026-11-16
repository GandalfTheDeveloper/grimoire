// Reordering a day's exercises on the entry screen: long-press a card's background, drag up or down, let go. Fake data only.
import React, { useState } from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, act, waitFor } from "@testing-library/react";
import App from "../src/shell/App.jsx";
import { sync } from "../src/core/index.js";
import { resetCore } from "./helpers/resetCore.js";
import { setSyncStatus, setAppPending } from "../src/core/syncStatus.js";
import { LogEntryView } from "../src/apps/fitness/LogEntryView.jsx";
import { CYCLE_ANCHOR, getEffectiveExercises, getWeekNumber, planKey, reorderPlanChanges } from "../src/apps/fitness/plan.js";
import { dayName } from "../src/apps/fitness/dates.js";
import { layoutDrag } from "../src/apps/fitness/useReorder.js";

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); cleanup(); });

describe("where the card lands", () => {
  // four cards, 100 px tall, 20 px apart
  const tops = [0, 120, 240, 360], heights = [100, 100, 100, 100];
  it("nothing moves until the card passes the middle of a neighbour", () => {
    expect(layoutDrag(tops, heights, 0, 0, 20)).toEqual({ to: 0, shifts: [0, 0, 0, 0] });
    expect(layoutDrag(tops, heights, 0, 60, 20).to).toBe(0); // centre at 110, neighbour's middle is 170
    const d = layoutDrag(tops, heights, 0, 130, 20); // centre at 180, past 170
    expect(d.to).toBe(1);
    expect(d.shifts).toEqual([0, -120, 0, 0]); // the neighbour slides up by one card plus the gap
  });
  it("works upwards and over several cards", () => {
    expect(layoutDrag(tops, heights, 3, -250, 20)).toEqual({ to: 1, shifts: [0, 120, 120, 0] });
    expect(layoutDrag(tops, heights, 0, 5000, 20).to).toBe(3);
    expect(layoutDrag(tops, heights, 3, -5000, 20).to).toBe(0);
  });
});

describe("saving the new order as the day's default", () => {
  it("moves one exercise and saves that day; the other week gets it too when it has the same exercises", () => {
    const c = reorderPlanChanges({}, 1, "Monday", 0, 2);
    expect(c.map((x) => x.key)).toEqual(["1-Monday", "2-Monday"]);
    const names = c[0].rows.map((r) => r.ExerciseName);
    expect(names.slice(0, 3)).toEqual(["Bent Over Fly's", "Hyperextensions", "Cable Rows"]);
    expect(names.length).toBe(10);
    expect(c[1].rows.map((r) => r.ExerciseName)).toEqual(names);
    expect(c[0].rows[2]).toMatchObject({ ExerciseName: "Cable Rows", TargetSets: "3", TargetReps: "12", ExerciseType: "weighted" });
  });
  it("leaves the other week alone when its exercises differ, and keeps its own sets and reps when they match", () => {
    const differs = { "2-Monday": [{ ExerciseName: "Only This", TargetSets: "1", TargetReps: "1", ExerciseType: "weighted" }] };
    expect(reorderPlanChanges(differs, 1, "Monday", 0, 1).map((x) => x.key)).toEqual(["1-Monday"]);
    const own = getEffectiveExercises({}, 2, "Wednesday").map((e) => ({ ExerciseName: e.ExerciseName, TargetSets: "9", TargetReps: "9", ExerciseType: e.ExerciseType }));
    const c = reorderPlanChanges({ "2-Wednesday": own }, 1, "Wednesday", 0, 1);
    expect(c[1].key).toBe("2-Wednesday");
    expect(c[1].rows.every((r) => r.TargetSets === "9")).toBe(true);
    expect(c[0].rows.every((r) => r.TargetSets !== "9")).toBe(true);
  });
  it("moving something where it already is, or out of range, saves nothing", () => {
    expect(reorderPlanChanges({}, 1, "Monday", 3, 3)).toEqual([]);
    expect(reorderPlanChanges({}, 1, "Monday", 0, 99)).toEqual([]);
    expect(reorderPlanChanges({}, 1, "Friday", 0, 1)).toEqual([]); // rest day: no exercises
  });
});

// ---- on screen ----
// jsdom has no layout: cards sit 120 px apart, 100 px tall, inside a list that starts at the top of the screen.
const layout = () => vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function rect() {
  let top = 0, height = 0, bottom = 0;
  if (this.hasAttribute && this.hasAttribute("data-excard")) { top = 100 + [...this.parentNode.querySelectorAll("[data-excard]")].indexOf(this) * 120; height = 100; bottom = top + 100; }
  else if (this.style && this.style.overflowY === "auto" && this.style.height === "100%") { top = 0; height = 2000; bottom = 2000; }
  return { top, bottom, left: 0, right: 300, width: 300, height, x: 0, y: top, toJSON() {} };
});
const names = () => screen.getAllByTestId("exercise-name").map((n) => n.textContent);
const cards = () => [...document.querySelectorAll("[data-excard]")];
const bg = (i) => cards()[i].querySelector('[data-testid="bar-today"]'); // the card's own background (its stripe)
const hold = () => act(() => { vi.advanceTimersByTime(500); });

function Host({ saved }) {
  const [ov, setOv] = useState({});
  return (
    <LogEntryView date={new Date("2026-11-16T00:00:00")} setDate={() => {}} anchorDate="2026-09-21" dailyLog={[]} exerciseLog={[]} runLog={[]} queue={[]}
      planOverrides={ov} onSavePlan={(key, rows) => { saved.push({ key, rows }); setOv((p) => ({ ...p, [key]: rows })); }}
      isEditingHistorical={false} onDone={() => {}} onSave={async () => ({ fail: 0 })} onSwipeSave={() => {}} onLocalSave={() => {}} onSync={async () => {}} syncing={false} pendingCount={0} />
  );
}
const start = () => { layout(); vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] }); const saved = []; render(<Host saved={saved} />); return saved; };
const FIRST = ["Cable Rows", "Bent Over Fly's", "Hyperextensions", "Dumbbell Row"];

describe("long-press and drag on the entry screen", () => {
  it("mouse: hold a card's background, drag it down past two cards, let go: it lands there and the new order is saved", () => {
    const saved = start();
    expect(names().slice(0, 4)).toEqual(FIRST);
    fireEvent.mouseDown(bg(0), { button: 0, clientX: 60, clientY: 150 });
    hold();
    fireEvent.mouseMove(document, { clientX: 60, clientY: 410 }); // 260 px down: past the middle of cards 2 and 3
    expect(cards()[0].style.transform).toBe("translateY(260px) scale(1.02)"); // straight down, no sideways movement
    expect(cards()[1].style.transform).toBe("translateY(-120px)");
    expect(cards()[2].style.transform).toBe("translateY(-120px)");
    expect(cards()[3].style.transform).toBe("");
    fireEvent.mouseUp(document);
    expect(names().slice(0, 4)).toEqual(["Bent Over Fly's", "Hyperextensions", "Cable Rows", "Dumbbell Row"]);
    cards().forEach((c) => { expect(c.style.transform).toBe(""); expect(c.style.zIndex).toBe(""); });
    expect(saved.map((s) => s.key)).toEqual(["1-Monday", "2-Monday"]);
    expect(saved[0].rows.slice(0, 3).map((r) => r.ExerciseName)).toEqual(["Bent Over Fly's", "Hyperextensions", "Cable Rows"]);
  });
  it("touch: the drag stops the list scrolling, ignores sideways movement, and can go upwards", () => {
    const saved = start();
    fireEvent.touchStart(bg(3), { touches: [{ clientX: 40, clientY: 510 }] });
    hold();
    const notPrevented = fireEvent.touchMove(bg(3), { touches: [{ clientX: 330, clientY: 300 }], cancelable: true }); // sideways and up
    expect(notPrevented).toBe(false); // preventDefault was called, so the page doesn't scroll
    expect(cards()[3].style.transform).toBe("translateY(-210px) scale(1.02)");
    fireEvent.touchEnd(bg(3), { touches: [] });
    expect(names().slice(0, 4)).toEqual(["Cable Rows", "Bent Over Fly's", "Dumbbell Row", "Hyperextensions"]);
    expect(saved.length).toBe(2);
  });
  it("dropping it back where it started saves nothing", () => {
    const saved = start();
    fireEvent.mouseDown(bg(1), { button: 0, clientY: 270 });
    hold();
    fireEvent.mouseMove(document, { clientY: 290 });
    fireEvent.mouseUp(document);
    act(() => { vi.advanceTimersByTime(200); });
    expect(names().slice(0, 4)).toEqual(FIRST);
    expect(saved).toEqual([]);
    cards().forEach((c) => expect(c.style.transform).toBe(""));
  });
  it("a quick tap, or moving a finger to scroll before the hold is up, never starts a drag", () => {
    const saved = start();
    fireEvent.touchStart(bg(0), { touches: [{ clientX: 40, clientY: 150 }] });
    act(() => { vi.advanceTimersByTime(200); });
    fireEvent.touchEnd(bg(0), { touches: [] });
    act(() => { vi.advanceTimersByTime(600); });
    expect(cards()[0].style.zIndex).toBe("");
    fireEvent.touchStart(bg(0), { touches: [{ clientX: 40, clientY: 150 }] });
    fireEvent.touchMove(bg(0), { touches: [{ clientX: 40, clientY: 190 }] }); // 40 px: that's a scroll
    hold();
    expect(cards()[0].style.zIndex).toBe("");
    fireEvent.touchMove(bg(0), { touches: [{ clientX: 40, clientY: 600 }] });
    fireEvent.touchEnd(bg(0), { touches: [] });
    expect(names().slice(0, 4)).toEqual(FIRST);
    expect(saved).toEqual([]);
  });
  it("boxes, buttons and icons inside a card don't start a drag", () => {
    const saved = start();
    for (const el of [cards()[0].querySelector("input"), cards()[0].querySelector('[data-testid="overload-btn"]'), cards()[0].querySelector("svg")]) {
      fireEvent.touchStart(el, { touches: [{ clientX: 40, clientY: 150 }] });
      hold();
      expect(cards()[0].style.zIndex).toBe("");
      fireEvent.touchEnd(el, { touches: [] });
    }
    expect(saved).toEqual([]);
  });
  it("a cancelled touch (a call, a notification) puts the card back and saves nothing", () => {
    const saved = start();
    fireEvent.touchStart(bg(0), { touches: [{ clientX: 40, clientY: 150 }] });
    hold();
    fireEvent.touchMove(bg(0), { touches: [{ clientX: 40, clientY: 410 }] });
    fireEvent.touchCancel(bg(0), { touches: [] });
    act(() => { vi.advanceTimersByTime(200); });
    expect(names().slice(0, 4)).toEqual(FIRST);
    expect(saved).toEqual([]);
    cards().forEach((c) => expect(c.style.transform).toBe(""));
  });
});

// ---- the whole app: the new order is kept, and survives closing and reopening ----
const p = () => window.localStorage;
describe("the new order is the new default", () => {
  beforeEach(async () => {
    vi.spyOn(sync, "start").mockImplementation(() => {});
    cleanup();
    await new Promise((r) => setTimeout(r, 50));
    p().clear();
    await resetCore();
    window.location.hash = "";
    setSyncStatus({ pending: 0, lastSync: null, errors: [], configured: false, lastError: null, backendVersion: null });
    setAppPending("fitness", 0);
    Object.defineProperty(window, "innerWidth", { value: 390, configurable: true });
  });
  it("drag on the phone, close Super Shrexy, open it again: the order is still the new one", async () => {
    const now = new Date();
    const key = planKey(getWeekNumber(now, CYCLE_ANCHOR), dayName(now));
    const row = (n) => ({ ExerciseName: n, TargetSets: "3", TargetReps: "10", ExerciseType: "weighted" });
    p().setItem("grimoire:fitness:planOverrides", JSON.stringify({ [key]: [row("Test A"), row("Test B"), row("Test C")] }));
    window.location.hash = "#/app/fitness";
    layout();
    render(<App />);
    await screen.findByText("Test A");
    expect(names()).toEqual(["Test A", "Test B", "Test C"]);
    // Let Super Shrexy finish loading before dragging. On a slow machine (GitHub Actions) the list can still
    // re-render just after "Test A" first appears, and a drag started in that moment never reaches the list.
    await act(async () => { await new Promise((r) => setTimeout(r, 300)); });
    expect(names()).toEqual(["Test A", "Test B", "Test C"]);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    fireEvent.mouseDown(bg(0), { button: 0, clientY: 150 });
    hold();
    fireEvent.mouseMove(document, { clientY: 410 });
    fireEvent.mouseUp(document);
    vi.useRealTimers();
    expect(names()).toEqual(["Test B", "Test C", "Test A"]);
    cleanup();
    await new Promise((r) => setTimeout(r, 100));
    render(<App />);
    await screen.findByText("Test A");
    await waitFor(() => expect(names()).toEqual(["Test B", "Test C", "Test A"]));
  });
});

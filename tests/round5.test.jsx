// App 0.7.0 changes. Fake data only.
//  1. tablet home tiles are big            2. Fitness is "Super Shrexy" with its original "S" icon
//  3. tap a graph point to read its data   4. no pinch-zoom (scrolling still works)
//  5. app-side fixes: unsynced notes survive a refresh, Fitness's waiting edits show in the status dot
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";
import App from "../src/shell/App.jsx";
import { sync, data } from "../src/core/index.js";
import { resetCore } from "./helpers/resetCore.js";
import { setSyncStatus, setAppPending } from "../src/core/syncStatus.js";
import { blockZoom } from "../src/core/noZoom.js";
import { createBackend } from "./sim/sheetsSim.js";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const URL_ = "https://script.google.com/macros/s/GRIMOIRE/exec";
const KEY = "G".repeat(48);
const setWidth = (w) => { Object.defineProperty(window, "innerWidth", { value: w, configurable: true }); };
const p2 = (n) => String(n).padStart(2, "0");
const ago = (k) => { const d = new Date(); d.setDate(d.getDate() - k); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`; };
const put = (name, v) => window.localStorage.setItem(`grimoire:fitness:${name}`, JSON.stringify(v));
const seedConn = () => window.localStorage.setItem("grimoire:sync:config", JSON.stringify({ url: URL_, key: KEY }));

const H = { DailyLog: ["Date", "Weight", "CompletionStatus", "Notes", "StatusManual"], ExerciseLog: ["Date", "ExerciseName", "SetNumber", "Reps", "Weight"], RunLog: ["Date", "Distance", "Time", "Pace"], CalendarNotes: ["Date", "Note"] };
function makeSheet() {
  const be = createBackend({ key: KEY });
  for (const [tab, h] of Object.entries(H)) { const sh = be.ss.insertSheet(tab); sh.getRange(1, 1, 1, h.length).setValues([h]); }
  const calls = { gets: 0 };
  const fetch = async (url, init = {}) => { const b = JSON.parse(init.body); if (b.action === "fitness_getAll") calls.gets++; return be.fetch(url, init); };
  return { be, calls, fetch, all: () => be.post({ key: KEY, action: "fitness_getAll" }) };
}

let sheet;
beforeEach(async () => {
  vi.spyOn(sync, "start").mockImplementation(() => {});
  cleanup();
  await new Promise((r) => setTimeout(r, 50)); // a previous test's Fitness sends its last-chance request a moment after closing
  window.localStorage.clear();
  await resetCore();
  window.location.hash = "";
  setSyncStatus({ pending: 0, lastSync: null, errors: [], configured: false, lastError: null, backendVersion: null });
  setAppPending("fitness", 0);
  setWidth(390);
  sheet = makeSheet();
  window.fetch = sheet.fetch;
});
afterEach(() => { vi.restoreAllMocks(); });

describe("home tiles", () => {
  it("the Fitness tile is now Super Shrexy, with the original S icon, and the name 'Fitness' is gone from it", () => {
    render(<App />);
    const tile = screen.getByTestId("tile-fitness");
    expect(tile.textContent).toBe("Super Shrexy");
    const img = tile.querySelector("img.gr-tile-img");
    expect(img).toBeTruthy();
    expect(img.getAttribute("src")).toMatch(/icon.*\.png$/);
  });
  it("opening it keeps the same app (same storage, same route) and titles the top bar Super Shrexy", async () => {
    render(<App />);
    fireEvent.click(screen.getByTestId("tile-fitness"));
    await screen.findByTestId("fitness-root");
    expect(window.location.hash).toBe("#/app/fitness");
    expect(screen.getByTestId("topbar").textContent).toMatch(/Super Shrexy/);
  });
  it("the original S icon file is the one from the old Shrexy app (512 px PNG, teal on dark)", () => {
    const buf = fs.readFileSync(path.join(root, "src/apps/fitness/icon.png"));
    expect(buf.subarray(1, 4).toString()).toBe("PNG");
    expect(buf.readUInt32BE(16)).toBe(512);
    expect(buf.readUInt32BE(20)).toBe(512);
  });
  it("tablet tiles are much bigger than phone tiles (CSS guard: icon, tile height and name)", () => {
    const css = fs.readFileSync(path.join(root, "src/shell/shell.css"), "utf8");
    const media = css.slice(css.indexOf("/* Tablet"));
    const px = (re) => Number(media.match(re)[1]);
    expect(px(/\.gr-tile \.gr-tile-icon \{ width: (\d+)px/)).toBeGreaterThanOrEqual(64);
    expect(px(/\.gr-tile \.gr-tile-img \{ width: (\d+)px/)).toBeGreaterThanOrEqual(72);
    expect(px(/\.gr-tile \{ min-height: (\d+)px/)).toBeGreaterThanOrEqual(180);
    expect(px(/\.gr-tile \.name \{ font-size: (\d+)px/)).toBeGreaterThanOrEqual(20);
    expect(css).toMatch(/\.gr-tile-img \{ width: 36px/); // phone tiles are unchanged in kind
  });
  it("every other app still shows its own icon (no image) on the tile", () => {
    render(<App />);
    expect(screen.getByTestId("tile-journal").querySelector("img")).toBeNull();
    expect(screen.getByTestId("tile-journal").querySelector("svg")).toBeTruthy();
  });
});

describe("no pinch-zoom", () => {
  it("the page says so, and allows panning only", () => {
    const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
    expect(html).toMatch(/name="viewport" content="[^"]*maximum-scale=1[^"]*user-scalable=no/);
    expect(html).toMatch(/touch-action: pan-x pan-y/);
  });
  it("Safari's pinch events and any two-finger move are cancelled; a one-finger scroll is not", () => {
    const off = blockZoom(document);
    const fire = (type, extra = {}) => { const e = new Event(type, { bubbles: true, cancelable: true }); Object.assign(e, extra); document.body.dispatchEvent(e); return e.defaultPrevented; };
    expect(fire("gesturestart")).toBe(true);
    expect(fire("gesturechange")).toBe(true);
    expect(fire("gestureend")).toBe(true);
    expect(fire("touchmove", { touches: [{}, {}] })).toBe(true);
    expect(fire("touchmove", { touches: [{}] })).toBe(false); // scrolling stays
    expect(fire("touchend", { touches: [] })).toBe(false); // quick taps on buttons are never swallowed
    off();
    expect(fire("gesturestart")).toBe(false);
  });
});

// ---- graphs ----
function seedGraphs() {
  put("settings", { slides: ["progress"], slideshowEnabled: false, abCycleSeconds: 3 });
  // Seeded the way an interrupted save would leave it: in the on-device journal, recovered into records on open.
  const items = [];
  [7, 6, 5, 4, 3, 2, 1, 0].forEach((k) => items.push({ action: "logDaily", data: { Date: ago(k), Weight: 190 + k * 0.5, CompletionStatus: "Complete", Notes: "", StatusManual: "FALSE" } }));
  [21, 14, 7, 0].forEach((k, i) => [1, 2, 3].forEach((s) => items.push({ action: "logExercise", data: { Date: ago(k), ExerciseName: "Bench Press", SetNumber: s, Reps: 8 + (s === 3 ? 0 : 1), Weight: 135 + i * 5 } })));
  items.push({ action: "logRun", data: { Date: ago(5), Distance: 3.1, Time: "32:15", Pace: "10:24" } });
  items.push({ action: "logRun", data: { Date: ago(2), Distance: 4, Time: "40:00", Pace: "10:00" } });
  put("queue", items);
}
// (No connection here on purpose: reading an empty fake Sheet would replace the data seeded above.)
const openProgress = async () => { window.location.hash = "#/app/fitness"; setWidth(1000); render(<App />); await screen.findByTestId("fitness-root"); await screen.findByText("Progress"); };
const dots = (r) => [...document.querySelectorAll(`[data-testid="chart-svg"] circle[r="${r}"]`)];
const tapAt = (c) => fireEvent.click(c.closest("svg"), { clientX: Number(c.getAttribute("cx")), clientY: Number(c.getAttribute("cy")) });

describe("tap a point on a graph", () => {
  it("body weight: tapping a weigh-in dot shows its date, weight and trend; tapping it again closes it", async () => {
    seedGraphs();
    await openProgress();
    fireEvent.click(screen.getByText("Body weight"));
    await waitFor(() => expect(dots(3).length).toBe(8));
    expect(screen.queryByTestId("chart-tip")).toBeNull();
    tapAt(dots(3)[7]); // the newest weigh-in
    const tip = await screen.findByTestId("chart-tip");
    expect(tip.textContent).toMatch(/Weigh-in: 190\.0 lb/);
    expect(tip.textContent).toMatch(/Trend/);
    expect(tip.textContent).toContain(new Date(ago(0) + "T00:00:00Z").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }));
    tapAt(dots(3)[7]);
    expect(screen.queryByTestId("chart-tip")).toBeNull();
  });
  it("tapping a different dot moves the readout; tapping empty space closes it", async () => {
    seedGraphs();
    await openProgress();
    fireEvent.click(screen.getByText("Body weight"));
    await waitFor(() => expect(dots(3).length).toBe(8));
    tapAt(dots(3)[0]);
    expect((await screen.findByTestId("chart-tip")).textContent).toMatch(/Weigh-in: 193\.5 lb/);
    tapAt(dots(3)[3]);
    expect(screen.getAllByTestId("chart-tip").length).toBe(1);
    expect(screen.getByTestId("chart-tip").textContent).toMatch(/Weigh-in: 192\.0 lb/);
    const svg = dots(3)[0].closest("svg");
    fireEvent.click(svg, { clientX: 1, clientY: 1 }); // far from every dot
    expect(screen.queryByTestId("chart-tip")).toBeNull();
  });
  it("a tap needs to land near a dot: a tap well away from every dot does nothing", async () => {
    seedGraphs();
    await openProgress();
    fireEvent.click(screen.getByText("Body weight"));
    await waitFor(() => expect(dots(3).length).toBe(8));
    const c = dots(3)[2];
    fireEvent.click(c.closest("svg"), { clientX: Number(c.getAttribute("cx")) + 80, clientY: Number(c.getAttribute("cy")) + 80 });
    expect(screen.queryByTestId("chart-tip")).toBeNull();
  });
  it("lift graphs (A): both lines' values for that day show together", async () => {
    seedGraphs();
    await openProgress();
    fireEvent.click(screen.getByText("Lift progress"));
    await screen.findByText(/Bench Press · A · Raw performance/);
    await waitFor(() => expect(dots(4).length).toBe(8)); // 4 sessions x 2 lines
    tapAt(dots(4)[3]); // first line, newest session
    const t = (await screen.findByTestId("chart-tip")).textContent;
    expect(t).toMatch(/Avg weight: 150 lb/);
    expect(t).toMatch(/Avg reps \/ set: 8\.7/);
    expect(t).toMatch(/3 sets/);
  });
  it("lift graphs (B): shows the session and WHY it got its color", async () => {
    seedGraphs();
    await openProgress();
    fireEvent.click(screen.getByText("Lift progress"));
    await screen.findByText(/Bench Press · A/);
    fireEvent.click(screen.getByText("B"));
    await screen.findByText(/Bench Press · B/);
    await waitFor(() => expect(dots(4).length).toBe(4));
    tapAt(dots(4)[3]);
    const t = (await screen.findByTestId("chart-tip")).textContent;
    expect(t).toMatch(/Volume load: /);
    expect(t).toMatch(/150 lb avg × 8\.7 reps avg · 3 sets/);
    
    expect(t).toMatch(/Improved vs last week/); // the reason for the color
  });
  it("run graph: pace and distance for the tapped run", async () => {
    seedGraphs();
    await openProgress();
    fireEvent.click(screen.getByText("Run pace"));
    await waitFor(() => expect(dots(4).length).toBe(4));
    tapAt(dots(4)[1]); // pace of the newer run
    const t = (await screen.findByTestId("chart-tip")).textContent;
    expect(t).toMatch(/Pace: 10:00 \/mi/);
    expect(t).toMatch(/Distance: 4\.00 mi/);
  });
  it("consistency graph (no dots): tapping the line gives that day's number", async () => {
    seedGraphs();
    await openProgress();
    fireEvent.click(screen.getByText("Consistency"));
    await screen.findByText(/Consistency · A/);
    const path_ = await waitFor(() => { const p = document.querySelector('[data-testid="chart-svg"] path[stroke-width="4"], [data-testid="chart-svg"] line[stroke-width="4"]'); if (!p) throw new Error("no line yet"); return p; });
    const svg = path_.closest("svg");
    const seg = path_.tagName === "line" ? [Number(path_.getAttribute("x1")), Number(path_.getAttribute("y1"))] : path_.getAttribute("d").slice(1).split("C")[0].split(",").map(Number);
    fireEvent.click(svg, { clientX: seg[0], clientY: seg[1] });
    const t = (await screen.findByTestId("chart-tip")).textContent;
    expect(t).toMatch(/\d+% of scheduled sessions \(7 days\)/);
  });
  it("the A/B auto-switch waits while a readout is open, and carries on once it is closed", async () => {
    seedGraphs();
    await openProgress();
    fireEvent.click(screen.getByText("Lift progress"));
    await screen.findByText(/Bench Press · A · Raw performance/);
    await waitFor(() => expect(dots(4).length).toBe(8));
    tapAt(dots(4)[0]);
    await screen.findByTestId("chart-tip");
    await new Promise((r) => setTimeout(r, 3600)); // longer than the 3 s cycle
    expect(screen.queryByText(/Bench Press · A · Raw performance/)).toBeTruthy();
    expect(screen.queryByTestId("chart-tip")).toBeTruthy();
    tapAt(dots(4)[0]); // close it
    await screen.findByText(/Bench Press · B/, {}, { timeout: 4500 });
  }, 20000);
});

// ---- app-side fixes ----
const waiting = () => data.dirtySnapshot().filter((r) => r.app === "fitness").length;
describe("a note you save is never lost to the old data or to a refresh", () => {
  it("a note saved on this device stays shown after the old Sheet data (which does not have it) is imported", async () => {
    setWidth(1000); seedConn();
    const note = "Bring the belt";
    put("settings", { slides: ["week"], slideshowEnabled: false });
    put("queue", [{ action: "logNote", data: { Date: ago(0), Note: note } }]);
    window.location.hash = "#/app/fitness";
    render(<App />);
    await screen.findByTestId("fitness-root");
    await waitFor(() => expect(sheet.calls.gets).toBeGreaterThanOrEqual(1));
    await waitFor(() => expect(sheet.be.rows("fitness_notes").length).toBe(1));
    expect(screen.getByText(new RegExp(note))).toBeTruthy();
    expect(sheet.all().calendarNotes.length).toBe(0); // the old tab never got it
  });
  it("a note you cleared stays cleared even though the old Sheet tab still has it", async () => {
    setWidth(1000); seedConn();
    sheet.be.tab("CalendarNotes").getRange(2, 1, 1, 2).setValues([[ago(0), "old note text"]]);
    put("settings", { slides: ["week"], slideshowEnabled: false });
    put("queue", [{ action: "logNote", data: { Date: ago(0), Note: "" } }]);
    window.location.hash = "#/app/fitness";
    render(<App />);
    await screen.findByTestId("fitness-root");
    await waitFor(() => expect(sheet.calls.gets).toBeGreaterThanOrEqual(1));
    await waitFor(() => expect(sheet.be.rows("fitness_notes").length).toBe(1));
    expect(screen.queryByText(/old note text/)).toBeNull();
    expect(sheet.be.rows("fitness_notes")[0]).toMatchObject({ Deleted: 1 });
  });
});

describe("Grimoire's status dot counts Fitness's waiting edits", () => {
  const items = () => [ago(2), ago(1)].map((d) => ({ action: "logDaily", data: { Date: d, Weight: 190, CompletionStatus: "None", Notes: "", StatusManual: "FALSE" } }));
  it("is amber on the home screen from the start for edits an earlier build left on the device", () => {
    put("queue", items());
    render(<App />);
    expect(screen.getByTestId("status-dot").getAttribute("aria-label")).toMatch(/2 items waiting/);
  });
  it("turns green once those edits are saved as records and really sent", async () => {
    seedConn(); setWidth(390);
    put("queue", items());
    window.location.hash = "#/app/fitness";
    render(<App />);
    await screen.findByTestId("fitness-root");
    fireEvent.click(await waitFor(() => document.querySelector("svg.lucide-refresh-cw")));
    await waitFor(() => expect(sheet.be.rows("fitness_daily").length).toBe(2));
    await waitFor(() => expect(screen.getByTestId("status-dot").getAttribute("aria-label")).toMatch(/Everything is in the Sheet/));
    expect(waiting()).toBe(0);
  });
  it("counts records waiting in Fitness while offline (amber), through the engine's own count", async () => {
    setWidth(390);
    put("queue", items());
    window.location.hash = "#/app/fitness";
    render(<App />);
    await screen.findByTestId("fitness-root");
    await waitFor(() => expect(waiting()).toBe(2));
    sync.refreshPending();
    await waitFor(() => expect(screen.getByTestId("status-dot").getAttribute("aria-label")).toMatch(/2 items waiting/));
  });
  it("Diagnostics' 'Items pending' agrees with the dot", () => {
    put("queue", items());
    window.location.hash = "#/diagnostics";
    render(<App />);
    const row = [...document.querySelectorAll("dt")].find((d) => d.textContent === "Items pending");
    expect(row.nextSibling.textContent).toBe("2");
  });
});

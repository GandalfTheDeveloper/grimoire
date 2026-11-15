// Phase 2 tests: Fitness nested in Grimoire with minimal changes. Fake data only.
// The old Shrexy Apps Script is simulated below (same actions and tab shapes as the real Code.gs).
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, act, waitFor } from "@testing-library/react";
import App from "../src/shell/App.jsx";
import { sync } from "../src/core/index.js";
import { setSyncStatus } from "../src/core/syncStatus.js";

import { createBackend } from "./sim/sheetsSim.js";

const URL_ = "https://script.google.com/macros/s/GRIMOIRE/exec";
const KEY = "G".repeat(48);
const setWidth = (w) => { Object.defineProperty(window, "innerWidth", { value: w, configurable: true }); };
const today = () => { const d = new Date(); const p = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };

// The real Grimoire Apps Script (.gs files) on a simulated Sheet that also has the old Shrexy tabs.
const H = { DailyLog: ["Date", "Weight", "CompletionStatus", "Notes", "StatusManual"], ExerciseLog: ["Date", "ExerciseName", "SetNumber", "Reps", "Weight"], RunLog: ["Date", "Distance", "Time", "Pace"], CalendarNotes: ["Date", "Note"] };
function makeSheet({ down = false } = {}) {
  const be = createBackend({ key: KEY });
  for (const [tab, h] of Object.entries(H)) { const sh = be.ss.insertSheet(tab); sh.getRange(1, 1, 1, h.length).setValues([h]); }
  const put = (tab, row) => { const sh = be.tab(tab); const r = sh.getLastRow() + 1; sh.getRange(r, 1, 1, row.length).setValues([row]); };
  const calls = { posts: [], keepalive: 0, urls: new Set(), gets: 0 };
  const fetch = async (url, init = {}) => {
    calls.urls.add(url);
    if (down) throw new TypeError("offline");
    const body = JSON.parse(init.body);
    calls.posts.push(body);
    if (init.keepalive) calls.keepalive++;
    if (body.action === "fitness_getAll") calls.gets++;
    return be.fetch(url, init);
  };
  const all = () => be.post({ key: KEY, action: "fitness_getAll" });
  return { be, put, calls, fetch, rows: (t) => be.rows(t), all };
}

let startSpy, shrexy;
const seedConn = () => window.localStorage.setItem("grimoire:sync:config", JSON.stringify({ url: URL_, key: KEY }));
const seedSettings = seedConn;
const open = async () => { window.location.hash = "#/app/fitness"; render(<App />); return screen.findByTestId("fitness-root"); };

beforeEach(async () => {
  startSpy = vi.spyOn(sync, "start").mockImplementation(() => {});
  // Closing the previous test's Fitness schedules its last-chance send a moment later. Let it fire
  // (into the old fake Sheet) before this test installs its own, or it would be counted here.
  cleanup();
  await new Promise((r) => setTimeout(r, 50));
  window.localStorage.clear();
  window.location.hash = "";
  setSyncStatus({ pending: 0, lastSync: null, errors: [], configured: false, lastError: null, backendVersion: null });
  setWidth(390);
  shrexy = makeSheet();
  window.fetch = shrexy.fetch;
});
afterEach(() => { vi.restoreAllMocks(); delete navigator.wakeLock; });

describe("storage", () => {
  it("every Fitness key is grimoire:fitness:*, and old unprefixed Shrexy keys are never read or changed", async () => {
    window.localStorage.setItem("settings", JSON.stringify({ apiUrl: "https://old.example/exec", apiKey: "OLDKEY" }));
    window.localStorage.setItem("queue", JSON.stringify([{ action: "logDaily", data: { Date: "2026-01-01" } }]));
    seedConn();
    shrexy.put("DailyLog", ["2026-11-01", 190, "Complete", "", "FALSE"]);
    await open();
    await waitFor(() => expect(JSON.parse(window.localStorage.getItem("grimoire:fitness:dailyLog") || "[]").length).toBe(1));
    expect(window.localStorage.getItem("settings")).toBe(JSON.stringify({ apiUrl: "https://old.example/exec", apiKey: "OLDKEY" }));
    expect(window.localStorage.getItem("queue")).toBe(JSON.stringify([{ action: "logDaily", data: { Date: "2026-01-01" } }]));
    for (const k of Object.keys(window.localStorage)) if (!["settings", "queue"].includes(k)) expect(k.startsWith("grimoire:")).toBe(true);
  });
  it("a script address and key saved by 0.5.0 inside Fitness are removed from this device", async () => {
    seedConn();
    window.localStorage.setItem("grimoire:fitness:settings", JSON.stringify({ apiUrl: "https://old.example/exec", apiKey: "OLDKEY", slideSeconds: 90 }));
    await open();
    await waitFor(() => { const s = JSON.parse(window.localStorage.getItem("grimoire:fitness:settings")); expect(s.apiUrl).toBeUndefined(); expect(s.apiKey).toBeUndefined(); expect(s.slideSeconds).toBe(90); });
    expect(JSON.stringify(window.localStorage)).not.toMatch(/OLDKEY/);
  });
});

describe("one connection for all of Grimoire", () => {
  it("every request goes to Grimoire's address with Grimoire's key, and Fitness settings has no address or key box", async () => {
    seedConn();
    await open();
    await waitFor(() => expect(shrexy.calls.gets).toBeGreaterThan(0));
    expect([...shrexy.calls.urls]).toEqual([URL_]);
    expect(shrexy.calls.posts.every((b) => b.key === KEY)).toBe(true);
    fireEvent.click(document.querySelector("svg.lucide-settings"));
    expect(await screen.findByTestId("fitness-conn-note")).toBeTruthy();
    expect(screen.queryByText(/Apps Script web app URL/)).toBeNull();
    expect(screen.queryByText(/Secret key/)).toBeNull();
  });
  it("with no connection set up, edits are kept on the device and nothing is sent", async () => {
    await open();
    fireEvent.change(await screen.findByPlaceholderText("body weight"), { target: { value: "190" } });
    fireEvent.click(screen.getByText("Save"));
    await waitFor(() => expect(screen.getByTestId("fitness-sync-msg").textContent).toMatch(/Grimoire's Settings/));
    expect(JSON.parse(window.localStorage.getItem("grimoire:fitness:queue")).length).toBe(1);
    expect(shrexy.calls.posts.length).toBe(0);
  });
  it("a wrong key shows a plain message and keeps the edit queued", async () => {
    window.localStorage.setItem("grimoire:sync:config", JSON.stringify({ url: URL_, key: "W".repeat(48) }));
    await open();
    fireEvent.change(await screen.findByPlaceholderText("body weight"), { target: { value: "190" } });
    fireEvent.click(screen.getByText("Save"));
    await waitFor(() => expect(screen.getByTestId("fitness-sync-msg").textContent).toMatch(/key was rejected/));
    expect(JSON.parse(window.localStorage.getItem("grimoire:fitness:queue")).length).toBe(1);
  });
});

describe("data matches the Sheet (the same tabs old Shrexy uses)", () => {
  it("loads all four tabs, with dates and times repaired", async () => {
    seedConn();
    shrexy.put("DailyLog", ["2026-11-02", "188.4", "Partial", "• felt ok", "TRUE"]);
    shrexy.put("ExerciseLog", ["2026-11-02", "Bench", 1, 8, 135]);
    shrexy.put("RunLog", ["2026-11-01", 3.1, "32:15", "10:24"]);
    shrexy.put("CalendarNotes", ["2026-11-03", "pickleball"]);
    await open();
    const get = (n) => JSON.parse(window.localStorage.getItem(`grimoire:fitness:${n}`) || "null");
    await waitFor(() => expect(get("calendarNotes")).toEqual({ "2026-11-03": "pickleball" }));
    expect(get("dailyLog")).toEqual([{ Date: "2026-11-02", Weight: 188.4, CompletionStatus: "Partial", Notes: "• felt ok", StatusManual: "TRUE" }]);
    expect(get("exerciseLog")).toEqual([{ Date: "2026-11-02", ExerciseName: "Bench", SetNumber: 1, Reps: 8, Weight: 135 }]);
    expect(get("runLog")).toEqual([{ Date: "2026-11-01", Distance: 3.1, Time: "32:15", Pace: "10:24" }]);
  });
  it("a phone save lands in the old DailyLog tab and clears the queue", async () => {
    seedConn();
    await open();
    fireEvent.change(await screen.findByPlaceholderText("body weight"), { target: { value: "187.5" } });
    fireEvent.click(screen.getByText("Save"));
    await waitFor(() => expect(shrexy.all().dailyLog.length).toBe(1));
    expect(shrexy.all().dailyLog[0]).toMatchObject({ Date: today(), Weight: 187.5, StatusManual: "FALSE" });
    expect(shrexy.calls.posts.find((b) => b.action === "fitness_logBatch").items[0].action).toBe("logDaily");
    await waitFor(() => expect(JSON.parse(window.localStorage.getItem("grimoire:fitness:queue"))).toEqual([]));
  });
});

describe("closing the app stops everything", () => {
  it("leaves no timers or listeners running after you go back to Home", async () => {
    seedConn();
    const live = new Set(); const origSet = window.setInterval, origClr = window.clearInterval;
    window.setInterval = (...a) => { const id = origSet(...a); live.add(id); return id; };
    window.clearInterval = (id) => { live.delete(id); return origClr(id); };
    const added = {};
    const track = (o, tag) => { const a = o.addEventListener.bind(o), r = o.removeEventListener.bind(o);
      o.addEventListener = (t, f, ...x) => { if (["visibilitychange", "pagehide", "keydown", "fullscreenchange", "resize"].includes(t)) (added[t + tag] = added[t + tag] || new Set()).add(f); return a(t, f, ...x); };
      o.removeEventListener = (t, f, ...x) => { added[t + tag]?.delete(f); return r(t, f, ...x); }; };
    track(document, ":d"); track(window, ":w");
    render(<App />); await screen.findByTestId("home-grid");
    const baselineTimers = new Set(live); const baselineListeners = Object.fromEntries(Object.entries(added).map(([k, v]) => [k, v.size]));
    act(() => { window.location.hash = "#/app/fitness"; });
    await screen.findByTestId("fitness-root");
    await screen.findByPlaceholderText("body weight");
    expect(live.size).toBeGreaterThan(baselineTimers.size);
    fireEvent.click(screen.getByTestId("back"));
    await screen.findByTestId("home-grid");
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect([...live].filter((id) => !baselineTimers.has(id))).toEqual([]);
    for (const [k, v] of Object.entries(added)) expect(v.size).toBe(baselineListeners[k] || 0);
    window.setInterval = origSet; window.clearInterval = origClr;
  });
  it("tablet display mode: takes the screen wake lock, and gives it back on close", async () => {
    setWidth(1000); seedConn();
    const release = vi.fn(async () => {});
    const request = vi.fn(async () => ({ release }));
    Object.defineProperty(navigator, "wakeLock", { value: { request }, configurable: true });
    await open();
    await waitFor(() => expect(request).toHaveBeenCalled());
    fireEvent.click(screen.getByTestId("back"));
    await screen.findByTestId("home-grid");
    await waitFor(() => expect(release).toHaveBeenCalled());
  });
  it("makes no more requests to the Sheet after it is closed", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      seedConn();
      window.localStorage.setItem("grimoire:fitness:settings", JSON.stringify({ refreshMinutes: 1 }));
      await open();
      await waitFor(() => expect(shrexy.calls.gets).toBeGreaterThan(0));
      fireEvent.click(screen.getByTestId("back"));
      await screen.findByTestId("home-grid");
      await act(async () => { await vi.advanceTimersByTimeAsync(10); });
      const before = shrexy.calls.gets;
      await act(async () => { await vi.advanceTimersByTimeAsync(10 * 60 * 1000); });
      expect(shrexy.calls.gets).toBe(before);
    } finally { vi.useRealTimers(); }
  });
});

describe("saving never loses an edit", () => {
  it("an edit made offline survives leaving the app, and is re-sent when you return", async () => {
    seedConn();
    shrexy = makeSheet({ down: true }); window.fetch = shrexy.fetch;
    await open();
    fireEvent.change(await screen.findByPlaceholderText("body weight"), { target: { value: "186" } });
    fireEvent.click(screen.getByTestId("back"));
    await screen.findByTestId("home-grid");
    const q = JSON.parse(window.localStorage.getItem("grimoire:fitness:queue"));
    expect(q.length).toBe(1);
    expect(q[0].data).toMatchObject({ Date: today(), Weight: "186" });
    shrexy = makeSheet(); window.fetch = shrexy.fetch;
    await open();
    fireEvent.click(await waitFor(() => document.querySelector("svg.lucide-refresh-cw")));
    await waitFor(() => expect(shrexy.all().dailyLog.length).toBe(1));
    expect(shrexy.all().dailyLog[0].Weight).toBe(186);
  });
  it("leaving the app with unsent edits sends them in a last-chance keepalive request", async () => {
    seedConn();
    await open();
    fireEvent.change(await screen.findByPlaceholderText("body weight"), { target: { value: "185" } });
    fireEvent.click(screen.getByTestId("back"));
    await screen.findByTestId("home-grid");
    await waitFor(() => expect(shrexy.calls.keepalive).toBe(1));
    expect(shrexy.all().dailyLog[0]).toMatchObject({ Date: today(), Weight: 185 });
  });
  it("sending the same edit twice (keepalive, then a normal sync) makes one row, not two", async () => {
    seedConn();
    await open();
    fireEvent.change(await screen.findByPlaceholderText("body weight"), { target: { value: "184" } });
    fireEvent.click(screen.getByTestId("back"));
    await waitFor(() => expect(shrexy.calls.keepalive).toBe(1));
    await open();
    fireEvent.click(await waitFor(() => document.querySelector("svg.lucide-refresh-cw")));
    await waitFor(() => expect(shrexy.calls.posts.filter((b) => b.action === "fitness_logBatch").length).toBeGreaterThanOrEqual(2));
    expect(shrexy.all().dailyLog.length).toBe(1);
  });
});

describe("layout inside Grimoire", () => {
  it("fills the space under Grimoire's top bar (no 100vh), has one title and no second fullscreen button", async () => {
    seedConn();
    const root = await open();
    expect(root.getAttribute("style")).not.toMatch(/100vh/);
    expect(screen.queryByText("Super Shrexy Tracker")).toBeNull();
    expect(screen.queryAllByLabelText(/full screen/i).length).toBeLessThanOrEqual(1);
    expect(screen.getByTestId("topbar").textContent).toMatch(/Fitness/);
  });
  it("tablet opens Fitness in display mode (wall display) by default", async () => {
    setWidth(1000); seedConn();
    render(<App />);
    await screen.findByTestId("fitness-root");
    expect(screen.queryByPlaceholderText("body weight")).toBeNull();
  });
});

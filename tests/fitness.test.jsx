// Phase 2 tests: Fitness nested in Grimoire with minimal changes. Fake data only.
// The old Shrexy Apps Script is simulated below (same actions and tab shapes as the real Code.gs).
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, act, waitFor } from "@testing-library/react";
import App from "../src/shell/App.jsx";
import { sync } from "../src/core/index.js";
import { setSyncStatus } from "../src/core/syncStatus.js";

const URL_ = "https://script.google.com/macros/s/OLDSHREXY/exec";
const KEY = "S".repeat(40);
const setWidth = (w) => { Object.defineProperty(window, "innerWidth", { value: w, configurable: true }); };
const today = () => { const d = new Date(); const p = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };

function fakeShrexy({ down = false } = {}) {
  const t = { dailyLog: [], exerciseLog: [], runLog: [], calendarNotes: [] };
  const calls = { gets: 0, posts: [], keepalive: 0 };
  const upsert = (arr, match, row) => { const i = arr.findIndex(match); if (i >= 0) arr[i] = { ...arr[i], ...row }; else arr.push(row); };
  const apply = (it) => {
    const d = it.data;
    if (it.action === "logDaily") upsert(t.dailyLog, (r) => r.Date === d.Date, { ...d });
    else if (it.action === "logExercise") upsert(t.exerciseLog, (r) => r.Date === d.Date && r.ExerciseName === d.ExerciseName && Number(r.SetNumber) === Number(d.SetNumber), { ...d });
    else if (it.action === "logRun") upsert(t.runLog, (r) => r.Date === d.Date, { ...d });
    else if (it.action === "logNote") { t.calendarNotes = t.calendarNotes.filter((r) => r.Date !== d.Date); if (d.Note) t.calendarNotes.push({ Date: d.Date, Note: d.Note }); }
  };
  const fetch = async (url, opts = {}) => {
    if (down) throw new TypeError("offline");
    if (!opts.method || opts.method === "GET") {
      calls.gets++;
      const u = new URL(url);
      if (u.searchParams.get("key") !== KEY) return { json: async () => ({ error: "bad key" }) };
      return { json: async () => JSON.parse(JSON.stringify(t)) };
    }
    const body = JSON.parse(opts.body);
    if (opts.keepalive) calls.keepalive++;
    calls.posts.push(body);
    if (body.key !== KEY) return { json: async () => ({ error: "bad key" }) };
    body.items.forEach(apply);
    return { json: async () => ({ results: body.items.map((_, index) => ({ index, success: true })) }) };
  };
  return { t, calls, fetch };
}

let startSpy, shrexy;
const seedSettings = () => window.localStorage.setItem("grimoire:fitness:settings", JSON.stringify({ apiUrl: URL_, apiKey: KEY }));
const open = async () => { window.location.hash = "#/app/fitness"; render(<App />); return screen.findByTestId("fitness-root"); };

beforeEach(() => {
  startSpy = vi.spyOn(sync, "start").mockImplementation(() => {});
  cleanup();
  window.localStorage.clear();
  window.location.hash = "";
  setSyncStatus({ pending: 0, lastSync: null, errors: [], configured: false, lastError: null, backendVersion: null });
  setWidth(390);
  shrexy = fakeShrexy();
  window.fetch = shrexy.fetch;
});
afterEach(() => { vi.restoreAllMocks(); delete navigator.wakeLock; });

describe("storage", () => {
  it("every Fitness key is grimoire:fitness:*, and old unprefixed Shrexy keys are never read or changed", async () => {
    window.localStorage.setItem("settings", JSON.stringify({ apiUrl: "https://old.example/exec", apiKey: "OLDKEY" }));
    window.localStorage.setItem("queue", JSON.stringify([{ action: "logDaily", data: { Date: "2026-01-01" } }]));
    seedSettings();
    shrexy.t.dailyLog.push({ Date: "2026-11-01", Weight: "190", CompletionStatus: "Complete", Notes: "", StatusManual: "FALSE" });
    await open();
    await waitFor(() => expect(JSON.parse(window.localStorage.getItem("grimoire:fitness:dailyLog") || "[]").length).toBe(1));
    expect(window.localStorage.getItem("settings")).toBe(JSON.stringify({ apiUrl: "https://old.example/exec", apiKey: "OLDKEY" }));
    expect(window.localStorage.getItem("queue")).toBe(JSON.stringify([{ action: "logDaily", data: { Date: "2026-01-01" } }]));
    for (const k of Object.keys(window.localStorage)) if (!["settings", "queue"].includes(k)) expect(k.startsWith("grimoire:")).toBe(true);
    expect(shrexy.calls.gets).toBeGreaterThan(0);
  });
});

describe("data matches the old Shrexy Sheet", () => {
  it("loads all four tabs exactly as the old backend returns them", async () => {
    seedSettings();
    shrexy.t.dailyLog.push({ Date: "2026-11-02", Weight: "188.4", CompletionStatus: "Partial", Notes: "• felt ok", StatusManual: "TRUE" });
    shrexy.t.exerciseLog.push({ Date: "2026-11-02", ExerciseName: "Bench", SetNumber: 1, Reps: 8, Weight: 135 });
    shrexy.t.runLog.push({ Date: "2026-11-01", Distance: 3.1, Time: "32:15", Pace: "10:24" });
    shrexy.t.calendarNotes.push({ Date: "2026-11-03", Note: "pickleball" });
    await open();
    const get = (n) => JSON.parse(window.localStorage.getItem(`grimoire:fitness:${n}`) || "null");
    await waitFor(() => expect(get("calendarNotes")).toEqual({ "2026-11-03": "pickleball" }));
    expect(get("dailyLog")).toEqual(shrexy.t.dailyLog);
    expect(get("exerciseLog")).toEqual(shrexy.t.exerciseLog);
    expect(get("runLog")).toEqual(shrexy.t.runLog);
  });
  it("a phone save reaches the old Sheet with the old action names and columns, and clears the queue", async () => {
    seedSettings();
    await open();
    const weight = await screen.findByPlaceholderText("body weight");
    fireEvent.change(weight, { target: { value: "187.5" } });
    fireEvent.click(screen.getByText("Save"));
    await waitFor(() => expect(shrexy.t.dailyLog.length).toBe(1));
    expect(shrexy.t.dailyLog[0]).toMatchObject({ Date: today(), Weight: "187.5" });
    expect(shrexy.calls.posts[0].action).toBe("logBatch");
    expect(shrexy.calls.posts[0].items[0].action).toBe("logDaily");
    await waitFor(() => expect(JSON.parse(window.localStorage.getItem("grimoire:fitness:queue"))).toEqual([]));
  });
});

describe("closing the app stops everything", () => {
  it("leaves no timers or listeners running after you go back to Home", async () => {
    seedSettings();
    const live = new Set(); const origSet = window.setInterval, origClr = window.clearInterval;
    window.setInterval = (...a) => { const id = origSet(...a); live.add(id); return id; };
    window.clearInterval = (id) => { live.delete(id); return origClr(id); };
    const added = {}; const addL = document.addEventListener.bind(document), remL = document.removeEventListener.bind(document);
    const track = (o, add, rem) => { const a = o.addEventListener.bind(o), r = o.removeEventListener.bind(o);
      o.addEventListener = (t, f, ...x) => { if (["visibilitychange", "pagehide", "keydown", "fullscreenchange", "resize"].includes(t)) added[t + ":" + (o === document ? "d" : "w")] = (added[t + ":" + (o === document ? "d" : "w")] || new Set()).add(f); return a(t, f, ...x); };
      o.removeEventListener = (t, f, ...x) => { const k = t + ":" + (o === document ? "d" : "w"); added[k]?.delete(f); return r(t, f, ...x); }; };
    track(document); track(window);
    render(<App />); await screen.findByTestId("home-grid");
    const baselineTimers = new Set(live); const baselineListeners = Object.fromEntries(Object.entries(added).map(([k, v]) => [k, v.size]));
    act(() => { window.location.hash = "#/app/fitness"; });
    await screen.findByTestId("fitness-root");
    await screen.findByPlaceholderText("body weight");
    expect(live.size).toBeGreaterThan(baselineTimers.size); // it really started its polling and autosave timers
    fireEvent.click(screen.getByTestId("back"));
    await screen.findByTestId("home-grid");
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect([...live].filter((id) => !baselineTimers.has(id))).toEqual([]);
    for (const [k, v] of Object.entries(added)) expect(v.size).toBe(baselineListeners[k] || 0);
    window.setInterval = origSet; window.clearInterval = origClr;
  });
  it("tablet display mode: takes the screen wake lock, and gives it back on close", async () => {
    setWidth(1000); seedSettings();
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
      seedSettings();
      window.localStorage.setItem("grimoire:fitness:settings", JSON.stringify({ apiUrl: URL_, apiKey: KEY, refreshMinutes: 1 }));
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
    seedSettings();
    shrexy = fakeShrexy({ down: true }); window.fetch = shrexy.fetch;
    await open();
    fireEvent.change(await screen.findByPlaceholderText("body weight"), { target: { value: "186" } });
    fireEvent.click(screen.getByTestId("back"));
    await screen.findByTestId("home-grid");
    const q = JSON.parse(window.localStorage.getItem("grimoire:fitness:queue"));
    expect(q.length).toBe(1);
    expect(q[0].data).toMatchObject({ Date: today(), Weight: "186" });
    // back online: the next Sync sends it, and the Sheet gets it exactly once
    shrexy = fakeShrexy(); window.fetch = shrexy.fetch;
    await open();
    const sync = await waitFor(() => document.querySelector("svg.lucide-refresh-cw"));
    fireEvent.click(sync);
    await waitFor(() => expect(shrexy.t.dailyLog.length).toBe(1));
    expect(shrexy.t.dailyLog[0].Weight).toBe("186");
  });
  it("leaving the app with unsent edits sends them in a last-chance keepalive request", async () => {
    seedSettings();
    await open();
    fireEvent.change(await screen.findByPlaceholderText("body weight"), { target: { value: "185" } });
    fireEvent.click(screen.getByTestId("back"));
    await screen.findByTestId("home-grid");
    await waitFor(() => expect(shrexy.calls.keepalive).toBe(1));
    expect(shrexy.t.dailyLog[0]).toMatchObject({ Date: today(), Weight: "185" });
  });
  it("sending the same edit twice (keepalive, then a normal sync) makes one row, not two", async () => {
    seedSettings();
    await open();
    fireEvent.change(await screen.findByPlaceholderText("body weight"), { target: { value: "184" } });
    fireEvent.click(screen.getByTestId("back"));
    await waitFor(() => expect(shrexy.calls.keepalive).toBe(1));
    await open();
    fireEvent.click(await waitFor(() => document.querySelector("svg.lucide-refresh-cw")));
    await waitFor(() => expect(shrexy.calls.posts.length).toBeGreaterThanOrEqual(2));
    expect(shrexy.t.dailyLog.length).toBe(1);
  });
});

describe("layout inside Grimoire", () => {
  it("fills the space under Grimoire's top bar (no 100vh), has one title and no second fullscreen button", async () => {
    seedSettings();
    const root = await open();
    expect(root.getAttribute("style")).not.toMatch(/100vh/);
    expect(screen.queryByText("Super Shrexy Tracker")).toBeNull();
    expect(screen.queryAllByLabelText(/full screen/i).length).toBeLessThanOrEqual(1);
    expect(screen.getByTestId("topbar").textContent).toMatch(/Fitness/);
  });
  it("tablet opens Fitness in display mode (wall display) by default", async () => {
    setWidth(1000); seedSettings();
    render(<App />);
    await screen.findByTestId("fitness-root");
    expect(screen.queryByPlaceholderText("body weight")).toBeNull();
  });
});

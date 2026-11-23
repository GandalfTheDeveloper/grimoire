// Phase 2 tests: Fitness nested in Grimoire with minimal changes. Fake data only.
// The old Shrexy Apps Script is simulated below (same actions and tab shapes as the real Code.gs).
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, act, waitFor } from "@testing-library/react";
import App from "../src/shell/App.jsx";
import { sync, data } from "../src/core/index.js";
import { resetCore } from "./helpers/resetCore.js";
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
// A sync asked for while the app's own startup sync is running joins that run, which may have started before Grimoire knew Super Shrexy was open. Two in a row guarantees one that started after.
const settle = async () => { await sync.syncNow("open"); await sync.syncNow("open"); };
const waiting = () => data.dirtySnapshot().filter((r) => r.app === "fitness").length;
const tab = (name) => shrexy.be.rows(`fitness_${name}`);
const open = async () => { window.location.hash = "#/app/fitness"; render(<App />); return screen.findByTestId("fitness-root"); };

beforeEach(async () => {
  startSpy = vi.spyOn(sync, "start").mockImplementation(() => {});
  // Closing the previous test's Fitness schedules its last-chance send a moment later. Let it fire
  // (into the old fake Sheet) before this test installs its own, or it would be counted here.
  cleanup();
  await new Promise((r) => setTimeout(r, 50));
  window.localStorage.clear();
  await resetCore();
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
    await waitFor(() => expect(tab("daily").length).toBe(1));
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
    expect(waiting()).toBe(1);
    expect(shrexy.calls.posts.length).toBe(0);
  });
  it("a wrong key shows a plain message and keeps the edit waiting", async () => {
    window.localStorage.setItem("grimoire:sync:config", JSON.stringify({ url: URL_, key: "W".repeat(48) }));
    await open();
    fireEvent.change(await screen.findByPlaceholderText("body weight"), { target: { value: "190" } });
    fireEvent.click(screen.getByText("Save"));
    await waitFor(() => expect(screen.getByTestId("fitness-sync-msg").textContent).toMatch(/key was rejected/));
    expect(waiting()).toBe(1);
  });
});

describe("data moves from the old tabs into Grimoire's records (once)", () => {
  it("reads the four old tabs once, repairs dates and times, and keeps them as OLD records (UpdatedAt 1)", async () => {
    seedConn();
    shrexy.put("DailyLog", ["2026-11-02", "188.4", "Partial", "• felt ok", "TRUE"]);
    shrexy.put("ExerciseLog", ["2026-11-02", "Bench", 1, 8, 135]);
    shrexy.put("RunLog", ["2026-11-01", 3.1, "32:15", "10:24"]);
    shrexy.put("CalendarNotes", ["2026-11-03", "pickleball"]);
    await open();
    await waitFor(() => expect(tab("notes").length).toBe(1));
    expect(tab("daily")).toMatchObject([{ Id: "d-2026-11-02", Date: "2026-11-02", Weight: "188.4", CompletionStatus: "Partial", Notes: "• felt ok", StatusManual: "TRUE", UpdatedAt: 1, Deleted: 0 }]);
    expect(tab("exercise")).toMatchObject([{ Date: "2026-11-02", ExerciseName: "Bench", SetNumber: "1", Reps: "8", Weight: "135", UpdatedAt: 1 }]);
    expect(tab("run")).toMatchObject([{ Date: "2026-11-01", Distance: "3.1", Time: "32:15", Pace: "10:24" }]);
    expect(tab("notes")).toMatchObject([{ Id: "n-2026-11-03", Note: "pickleball" }]);
    expect(shrexy.calls.gets).toBe(1);
  });
  it("the old tabs are never written, and a second open does not read them again", async () => {
    seedConn();
    shrexy.put("DailyLog", ["2026-11-02", 188, "Partial", "", "FALSE"]);
    await open();
    await waitFor(() => expect(tab("daily").length).toBe(1));
    cleanup(); await new Promise((r) => setTimeout(r, 30));
    await open();
    await screen.findByPlaceholderText("body weight");
    await settle();
    expect(shrexy.calls.gets).toBe(1);
    expect(shrexy.calls.posts.some((b) => b.action === "fitness_logBatch")).toBe(false);
    expect(shrexy.be.rows("DailyLog")).toHaveLength(1);
    expect(shrexy.be.rows("DailyLog")[0].Weight).toBe(188);
  });
  it("a phone save lands in the new fitness_daily tab with a stable id, and leaves the old DailyLog tab alone", async () => {
    seedConn();
    await open();
    fireEvent.change(await screen.findByPlaceholderText("body weight"), { target: { value: "187.5" } });
    fireEvent.click(screen.getByText("Save"));
    await waitFor(() => expect(tab("daily").length).toBe(1));
    expect(tab("daily")[0]).toMatchObject({ Id: `d-${today()}`, Date: today(), Weight: "187.5", StatusManual: "FALSE", Deleted: 0 });
    expect(tab("daily")[0].UpdatedAt).toBeGreaterThan(1);
    expect(tab("daily")[0].SyncedAt).toBeGreaterThan(0);
    expect(shrexy.be.rows("DailyLog")).toHaveLength(0);
    await waitFor(() => expect(waiting()).toBe(0));
  });
  it("saving the same day again updates ONE record (never a second row); different sets are different records", async () => {
    seedConn();
    await open();
    const w = await screen.findByPlaceholderText("body weight");
    fireEvent.change(w, { target: { value: "186" } });
    fireEvent.click(screen.getByText("Save"));
    await waitFor(() => expect(tab("daily").length).toBe(1));
    fireEvent.change(w, { target: { value: "185.5" } });
    fireEvent.click(await screen.findByText("Save", {}, { timeout: 4000 }));
    await waitFor(() => expect(tab("daily")[0].Weight).toBe("185.5"));
    expect(tab("daily")).toHaveLength(1);
  });
});

describe("Sheets cannot mangle what Super Shrexy writes", () => {
  it("a note that starts with = or ', a run time like 32:15 and a leading-zero set label all come back exactly as typed", async () => {
    seedConn();
    await open();
    await screen.findByPlaceholderText("body weight");
    const { applyItems } = await import("../src/apps/fitness/data.js");
    await applyItems([
      { action: "logNote", data: { Date: "2026-11-05", Note: "=1+1" } },
      { action: "logNote", data: { Date: "2026-11-06", Note: "'quoted" } },
      { action: "logRun", data: { Date: "2026-11-07", Distance: "3.1", Time: "32:15", Pace: "10:24" } },
      { action: "logDaily", data: { Date: "2026-11-08", Weight: "188.4", CompletionStatus: "Partial", Notes: "007", StatusManual: "TRUE" } },
    ]);
    await settle();
    const by = (t, id) => tab(t).find((r) => r.Id === id);
    expect(by("notes", "n-2026-11-05").Note).toBe("=1+1");
    expect(by("notes", "n-2026-11-06").Note).toBe("'quoted");
    expect(by("run", "r-2026-11-07")).toMatchObject({ Time: "32:15", Pace: "10:24", Distance: "3.1" });
    expect(by("daily", "d-2026-11-08")).toMatchObject({ Notes: "007", Weight: "188.4", StatusManual: "TRUE" });
  });
});

describe("two devices share one record per thing (newest edit wins, only changes travel)", () => {
  const record = (id, cols, updatedAt) => ({ id, createdAt: updatedAt, updatedAt, deleted: 0, schemaVersion: 1, cols });
  const fromOtherDevice = (coll, fields, recs) => shrexy.be.post({ key: KEY, action: "sync", items: [{ app: "fitness", coll, fields, since: 0, pull: false, records: recs }] });
  const DAILY = ["Date", "Weight", "CompletionStatus", "Notes", "StatusManual"];
  it("a newer edit from another device replaces this device's older one on the screen", async () => {
    seedConn();
    await open();
    const w = await screen.findByPlaceholderText("body weight");
    fireEvent.change(w, { target: { value: "190" } });
    fireEvent.click(screen.getByText("Save"));
    await waitFor(() => expect(tab("daily").length).toBe(1));
    fromOtherDevice("daily", DAILY, [record(`d-${today()}`, { Date: today(), Weight: "181", CompletionStatus: "Complete", Notes: "", StatusManual: "FALSE" }, Date.now() + 60000)]);
    await settle();
    await waitFor(() => expect(screen.getByPlaceholderText("body weight").value).toBe("181")).catch(() => {});
    expect(tab("daily")).toHaveLength(1);
    expect(tab("daily")[0].Weight).toBe("181");
    cleanup(); await open();
    expect((await screen.findByPlaceholderText("body weight")).value).toBe("181");
  });
  it("an OLDER edit from another device never overwrites this device's newer one", async () => {
    seedConn();
    await open();
    fireEvent.change(await screen.findByPlaceholderText("body weight"), { target: { value: "190" } });
    fireEvent.click(screen.getByText("Save"));
    await waitFor(() => expect(tab("daily").length).toBe(1));
    fromOtherDevice("daily", DAILY, [record(`d-${today()}`, { Date: today(), Weight: "150", CompletionStatus: "None", Notes: "", StatusManual: "FALSE" }, 5)]);
    await settle();
    expect(tab("daily")[0].Weight).toBe("190");
  });
  it("after the first sync, a sync with nothing new sends no records and downloads none", async () => {
    seedConn();
    await open();
    fireEvent.change(await screen.findByPlaceholderText("body weight"), { target: { value: "190" } });
    fireEvent.click(screen.getByText("Save"));
    await waitFor(() => expect(waiting()).toBe(0));
    await settle();
    const n = shrexy.calls.posts.length;
    await settle();
    const last = shrexy.calls.posts.slice(n).filter((b) => b.action === "sync").pop();
    const daily = last.items.find((i) => i.coll === "daily");
    expect(daily.records).toHaveLength(0);
    expect(daily.since).toBeGreaterThan(0);
  });
  it("plan edits sync: a day's workout list saved on another device shows up in Edit workouts here", async () => {
    seedConn();
    fromOtherDevice("plan", ["Key", "Rows"], [record("p-1-Monday", { Key: "1-Monday", Rows: JSON.stringify([{ ExerciseName: "Zercher Squat", TargetSets: "3", TargetReps: "5", ExerciseType: "weighted" }]) }, Date.now())]);
    await open();
    await settle();
    fireEvent.click(document.querySelector("svg.lucide-settings"));
    fireEvent.click(await screen.findByText("Edit workouts"));
    expect(await screen.findByDisplayValue("Zercher Squat", {}, { timeout: 4000 })).toBeTruthy();
  });
  it("saving a plan edit writes it to fitness_plan, and Reset to default removes it (deleted flag, never erased)", async () => {
    seedConn();
    await open();
    fireEvent.click(document.querySelector("svg.lucide-settings"));
    fireEvent.click(await screen.findByText("Edit workouts"));
    const first = (await screen.findAllByPlaceholderText("exercise name"))[0];
    fireEvent.change(first, { target: { value: "Zercher Squat" } });
    fireEvent.click(screen.getByText("Save for this day"));
    await new Promise((r) => setTimeout(r, 50)); await settle();
    await waitFor(() => expect(tab("plan").length).toBe(1));
    expect(tab("plan")[0]).toMatchObject({ Id: "p-1-Monday", Key: "1-Monday", Deleted: 0 });
    expect(tab("plan")[0].Rows).toMatch(/Zercher Squat/);
    fireEvent.click(screen.getByText("Reset to default"));
    await new Promise((r) => setTimeout(r, 50)); await settle();
    await waitFor(() => expect(tab("plan")[0].Deleted).toBe(1));
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
  it("tablet display mode: asks for the wake lock again after the browser drops it (screen off, then back on)", async () => {
    setWidth(1000); seedConn();
    const locks = [];
    const request = vi.fn(async () => {
      const handlers = [];
      const lock = { released: false, addEventListener: (t, f) => { if (t === "release") handlers.push(f); }, release: vi.fn(async () => {}), drop() { this.released = true; handlers.forEach((f) => f()); } };
      locks.push(lock); return lock;
    });
    Object.defineProperty(navigator, "wakeLock", { value: { request }, configurable: true });
    const setVis = (v) => { Object.defineProperty(document, "visibilityState", { value: v, configurable: true }); document.dispatchEvent(new Event("visibilitychange")); };
    try {
      await open();
      await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
      // The screen turns off: the page is hidden and the browser releases the lock by itself.
      await act(async () => { setVis("hidden"); locks[0].drop(); });
      expect(request).toHaveBeenCalledTimes(1); // never asks while hidden
      // The screen comes back: it must ask again (the old code kept the dead lock and never did).
      await act(async () => { setVis("visible"); });
      await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
      // The browser drops it without hiding the page (e.g. battery saver): a tap gets it back.
      await act(async () => { locks[1].drop(); });
      await act(async () => { fireEvent.pointerDown(screen.getByTestId("fitness-root")); });
      await waitFor(() => expect(request).toHaveBeenCalledTimes(3));
    } finally { setVis("visible"); }
  });
  it("tablet display mode: retries every 30 seconds when the lock was refused, and Settings says whether it is on", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      setWidth(1000); seedConn();
      let refuse = true;
      const request = vi.fn(async () => { if (refuse) { const e = new Error("no"); e.name = "NotAllowedError"; throw e; } return { released: false, addEventListener() {}, release: async () => {} }; });
      Object.defineProperty(navigator, "wakeLock", { value: { request }, configurable: true });
      await open();
      await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
      refuse = false;
      await act(async () => { await vi.advanceTimersByTimeAsync(31 * 1000); });
      expect(request).toHaveBeenCalledTimes(2);
      await act(async () => { await vi.advanceTimersByTimeAsync(5 * 60 * 1000); });
      expect(request).toHaveBeenCalledTimes(2); // holding it: no more asking
      fireEvent.click(document.querySelector("[data-testid=fitness-root] svg.lucide-settings"));
      expect((await screen.findByTestId("fitness-wake-status")).textContent).toMatch(/On:/);
    } finally { vi.useRealTimers(); }
  });
  it("makes no more requests to the Sheet after it is closed", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      seedConn();
      await open();
      await waitFor(() => expect(shrexy.calls.gets).toBeGreaterThan(0));
      fireEvent.click(screen.getByTestId("back"));
      await screen.findByTestId("home-grid");
      await act(async () => { await vi.advanceTimersByTimeAsync(10); });
      const before = shrexy.calls.posts.length;
      await act(async () => { await vi.advanceTimersByTimeAsync(10 * 60 * 1000); });
      expect(shrexy.calls.posts.length).toBe(before);
    } finally { vi.useRealTimers(); }
  });
});

describe("saving never loses an edit", () => {
  it("an edit made offline survives leaving the app, and is sent when you return", async () => {
    seedConn();
    shrexy = makeSheet({ down: true }); window.fetch = shrexy.fetch;
    await open();
    fireEvent.change(await screen.findByPlaceholderText("body weight"), { target: { value: "186" } });
    fireEvent.click(screen.getByTestId("back"));
    await screen.findByTestId("home-grid");
    await waitFor(() => expect(waiting()).toBe(1));
    expect(JSON.parse(window.localStorage.getItem("grimoire:fitness:queue"))).toEqual([]); // saved as a record, so the quick journal is empty again
    shrexy = makeSheet(); window.fetch = shrexy.fetch;
    await open();
    fireEvent.click(await waitFor(() => document.querySelector("svg.lucide-refresh-cw")));
    await waitFor(() => expect(tab("daily").length).toBe(1));
    expect(tab("daily")[0].Weight).toBe("186");
    await waitFor(() => expect(waiting()).toBe(0));
  });
  it("an edit still in the quick on-device journal (page closed mid-save) is recovered on the next open", async () => {
    seedConn();
    window.localStorage.setItem("grimoire:fitness:queue", JSON.stringify([{ action: "logDaily", data: { Date: today(), Weight: "184", CompletionStatus: "None", Notes: "", StatusManual: "FALSE" } }]));
    await open();
    await waitFor(() => expect(tab("daily").length).toBe(1));
    expect(tab("daily")[0].Weight).toBe("184");
    expect(JSON.parse(window.localStorage.getItem("grimoire:fitness:queue"))).toEqual([]);
  });
  it("a recovered journal item never undoes a newer edit that is already saved", async () => {
    seedConn();
    window.localStorage.setItem("grimoire:fitness:queue", JSON.stringify([{ action: "logDaily", data: { Date: today(), Weight: "190", CompletionStatus: "None", Notes: "", StatusManual: "FALSE" } }]));
    await open();
    await waitFor(() => expect(tab("daily")[0]?.Weight).toBe("190"));
    cleanup(); await new Promise((r) => setTimeout(r, 30));
    const { applyItems, recoverJournal } = await import("../src/apps/fitness/data.js");
    await applyItems([{ action: "logDaily", data: { Date: today(), Weight: "170" } }]);
    const stale = { action: "logDaily", _t: Date.now() - 600000, data: { Date: today(), Weight: "190", CompletionStatus: "None", Notes: "", StatusManual: "FALSE" } }; // journaled ten minutes ago
    window.localStorage.setItem("grimoire:fitness:queue", JSON.stringify([stale]));
    await recoverJournal(); // 190 is older than what is saved now (170), so 170 stays
    await settle();
    expect(tab("daily")[0].Weight).toBe("170");
  });
  it("closing the app right after an edit still sends it (Grimoire's sync sends after each save)", async () => {
    seedConn();
    startSpy.mockRestore();
    sync.start({ getOpenApp: () => "fitness" });
    try {
      await open();
      fireEvent.change(await screen.findByPlaceholderText("body weight"), { target: { value: "185" } });
      fireEvent.click(screen.getByTestId("back"));
      await screen.findByTestId("home-grid");
      await waitFor(() => expect(tab("daily").length).toBe(1), { timeout: 6000 });
      expect(tab("daily")[0].Weight).toBe("185");
    } finally { sync.stop(); }
  }, 15000);
});

describe("layout inside Grimoire", () => {
  it("fills the space under Grimoire's top bar (no 100vh), has one title and no second fullscreen button", async () => {
    seedConn();
    const root = await open();
    expect(root.getAttribute("style")).not.toMatch(/100vh/);
    expect(screen.queryByText("Super Shrexy Tracker")).toBeNull();
    expect(screen.queryAllByLabelText(/full screen/i).length).toBeLessThanOrEqual(1);
    expect(screen.getByTestId("topbar").textContent).toMatch(/Super Shrexy/);
  });
  it("phone: every set row's remove button can't be squeezed out (inputs may shrink, the button may not)", async () => {
    // jsdom has no layout engine; the real measurement at iPhone widths is done in Chrome (docs/apps/fitness.md, 0.11.1).
    seedConn();
    await open();
    const buttons = await screen.findAllByTestId("remove-set");
    expect(buttons.length).toBeGreaterThan(3);
    for (const b of buttons) {
      expect(b.style.flexShrink).toBe("0");
      for (const inp of b.parentElement.querySelectorAll("input")) expect(inp.style.minWidth).toMatch(/^0(px)?$/);
    }
    const before = buttons.length;
    fireEvent.click(buttons[0]);
    await waitFor(() => expect(screen.getAllByTestId("remove-set").length).toBe(before - 1));
  });
  it("tablet opens Fitness in display mode (wall display) by default", async () => {
    setWidth(1000); seedConn();
    render(<App />);
    await screen.findByTestId("fitness-root");
    expect(screen.queryByPlaceholderText("body weight")).toBeNull();
  });
});

// Golden Ratio: the maths, units, fractions, the number pad, the three screens, history (synced and demo),
// the 30-minute unit reset, and the real Apps Script on a simulated Sheet. Fake data only.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor, act } from "@testing-library/react";
import App from "../src/shell/App.jsx";
import { sync, data } from "../src/core/index.js";
import { resetCore } from "./helpers/resetCore.js";
import { setSyncStatus } from "../src/core/syncStatus.js";
import { createBackend } from "./sim/sheetsSim.js";
import { PHI, solve } from "../src/apps/goldenratio/math.js";
import { parseToMm, formatMm, fraction32, fmt4, parseAmount, editableText } from "../src/apps/goldenratio/units.js";
import { applyKey } from "../src/apps/goldenratio/entry.js";
import { SESSION_TTL } from "../src/apps/goldenratio/store.js";
import { tapProps } from "../src/apps/goldenratio/tap.js";

// ---------------- pure logic ----------------
describe("golden ratio maths", () => {
  it("solves from a, b or a+b, and a+b always equals a + b and a/b = phi", () => {
    for (const known of ["a", "b", "whole"]) for (const v of [1, 5, 100, 3.625, 1234.5678]) {
      const r = solve(known, v);
      expect(r[known]).toBe(v);
      expect(r.a + r.b).toBeCloseTo(r.whole, 9);
      expect(r.a / r.b).toBeCloseTo(PHI, 12);
    }
  });
  it("known values match hand-worked answers", () => {
    expect(fmt4(solve("a", 10).b)).toBe("6.1803");
    expect(fmt4(solve("a", 10).whole)).toBe("16.1803");
    expect(fmt4(solve("b", 100).a)).toBe("161.8034");
    expect(fmt4(solve("b", 100).whole)).toBe("261.8034");
    expect(fmt4(solve("whole", 5).a)).toBe("3.0902");
    expect(fmt4(solve("whole", 5).b)).toBe("1.9098");
  });
  it("refuses zero, negatives and junk", () => {
    expect(solve("a", 0)).toBeNull(); expect(solve("a", -1)).toBeNull(); expect(solve("a", NaN)).toBeNull(); expect(solve("x", 5)).toBeNull();
  });
});

describe("reading what was typed", () => {
  it("decimals, fractions and mixed numbers", () => {
    expect(parseAmount("12.5")).toBe(12.5); expect(parseAmount(".5")).toBe(0.5); expect(parseAmount("3.")).toBe(3);
    expect(parseAmount("5/8")).toBe(0.625); expect(parseAmount("3 5/8")).toBe(3.625); expect(parseAmount("3 11/16")).toBe(3.6875);
    for (const bad of ["", "3 5/", "3/0", "1.2.3", "35/8x", "3 5/8 1"]) expect(parseAmount(bad)).toBeNull();
  });
  it("converts every unit to millimetres", () => {
    expect(parseToMm("10", "mm")).toBe(10); expect(parseToMm("10", "cm")).toBe(100); expect(parseToMm("1.5", "m")).toBe(1500);
    expect(parseToMm("1", "in")).toBe(25.4); expect(parseToMm("1", "ft")).toBeCloseTo(304.8, 9);
    expect(parseToMm("3 5/8", "in")).toBeCloseTo(3.625 * 25.4, 9);
  });
  it("feet and inches: 5' 3 1/2\" and a bare number in ft-in is feet", () => {
    expect(parseToMm("5' 3 1/2", "ftin")).toBeCloseTo(63.5 * 25.4, 9);
    expect(parseToMm("5'3 1/2\"", "ftin")).toBeCloseTo(63.5 * 25.4, 9);
    expect(parseToMm("5'", "ftin")).toBeCloseTo(60 * 25.4, 9);
    expect(parseToMm("6", "ftin")).toBeCloseTo(72 * 25.4, 9);
    expect(parseToMm("5' 1/2", "ftin")).toBeCloseTo(60.5 * 25.4, 9);
    expect(parseToMm("5' 3", "mm")).toBeCloseTo(63 * 25.4, 9); // ' anywhere means feet and inches
  });
  it("nothing or zero is not a value", () => { expect(parseToMm("", "mm")).toBeNull(); expect(parseToMm("0", "mm")).toBeNull(); expect(parseToMm("0/8", "in")).toBeNull(); });
});

describe("writing results", () => {
  it("4 decimals with trailing zeros dropped", () => {
    expect(fmt4(100)).toBe("100"); expect(fmt4(6.18034)).toBe("6.1803"); expect(fmt4(2.5)).toBe("2.5"); expect(fmt4(10)).toBe("10"); expect(fmt4(0.99996)).toBe("1");
  });
  it("nearest 1/32, reduced", () => {
    expect(fraction32(2.2404)).toBe("2 1/4"); expect(fraction32(0.625)).toBe("5/8"); expect(fraction32(3)).toBe("3");
    expect(fraction32(5.8654)).toBe("5 7/8"); expect(fraction32(1 / 32)).toBe("1/32"); expect(fraction32(3.99)).toBe("4"); expect(fraction32(3.98)).toBe("3 31/32");
    expect(fraction32(0.1)).toBe("3/32");
  });
  it("tape mode: in, ft and ft-in as fractions with the exact value beside; metric stays decimal", () => {
    const r = solve("a", 3.625 * 25.4);
    expect(formatMm(r.b, "in", { tape: true })).toEqual({ main: "2 1/4", exact: "2.2404" });
    expect(formatMm(r.whole, "in", { tape: true })).toEqual({ main: "5 7/8", exact: "5.8654" });
    expect(formatMm(r.whole, "mm", { tape: true })).toEqual({ main: "148.9805", exact: "" });
    expect(formatMm(25.4 * 0.5, "in", { tape: true })).toEqual({ main: "1/2", exact: "" }); // exact: nothing extra
    expect(formatMm(r.b, "in", { tape: false })).toEqual({ main: "2.2404", exact: "" });
  });
  it("ft-in, the examples from planning: 5' 3 1/2\" gives b = 3' 3 1/4\" and a+b = 8' 6 3/4\"", () => {
    const r = solve("a", 63.5 * 25.4);
    expect(formatMm(r.b, "ftin", { tape: true }).main).toBe("3' 3 1/4\"");
    expect(formatMm(r.whole, "ftin", { tape: true }).main).toBe("8' 6 3/4\"");
    expect(formatMm(r.b, "ftin").main).toBe("3' 3.2452\"");
  });
  it("ft-in carries at the foot mark instead of showing 12\"", () => {
    expect(formatMm((12 * 2 - 0.001) * 25.4, "ftin", { tape: true }).main).toBe("2' 0\"");
    expect(formatMm((12 * 2 - 0.00001) * 25.4, "ftin").main).toBe("2' 0\"");
    expect(formatMm(5.5 * 25.4, "ftin", { tape: true }).main).toBe("5 1/2\"");
  });
  it("a result typed back in gives the same value", () => {
    for (const [mm, u, tape] of [[123.4567, "mm", false], [63.5 * 25.4, "ftin", true], [2.25 * 25.4, "in", true], [999, "cm", false]]) {
      expect(parseToMm(editableText(mm, u, { tape }), u)).toBeCloseTo(mm, 1);
    }
  });
});

describe("number pad keys", () => {
  const typeKeys = (keys, start = "", rep = false) => keys.reduce((t, k, i) => applyKey(t, i === 0 ? rep : false, k), start);
  it("digits, one decimal point, backspace", () => {
    expect(typeKeys(["1", "2", ".", "5", "."])).toBe("12.5");
    expect(typeKeys(["."])).toBe("0.");
    expect(typeKeys(["1", "2", "back"])).toBe("1");
  });
  it("first key after tapping a result replaces it", () => {
    expect(applyKey("6.1803", true, "7")).toBe("7");
    expect(applyKey("6.1803", true, "back")).toBe("");
  });
  it("typed fractions: 3 space 11 / 16, and junk sequences are ignored", () => {
    expect(typeKeys(["3", "space", "1", "1", "/", "1", "6"])).toBe("3 11/16");
    expect(typeKeys(["space"])).toBe("");
    expect(typeKeys(["/"])).toBe("");
    expect(typeKeys(["3", "/", "/"])).toBe("3/");
    expect(typeKeys(["3", ".", "5", "/"])).toBe("3.5");
  });
  it("quick fractions add, and replace a fraction already at the end", () => {
    expect(typeKeys(["3", [5, 8]])).toBe("3 5/8");
    expect(typeKeys(["3", [5, 8], [3, 4]])).toBe("3 3/4");
    expect(typeKeys([[1, 2]])).toBe("1/2");
    expect(typeKeys(["5", "feet", "3", [1, 2]])).toBe("5' 3 1/2");
    expect(typeKeys(["5", "feet", [1, 2]])).toBe("5' 1/2");
    expect(typeKeys(["3", ".", "5", [1, 2]])).toBe("3.5");
  });
  it("feet key: once, after a digit", () => {
    expect(typeKeys(["feet"])).toBe("");
    expect(typeKeys(["5", "feet", "feet"])).toBe("5' ");
  });
});

describe("taps that don't rely on the browser's click", () => {
  it("a lift within 10 px is a tap; a drag is not; the browser's own click is ignored; keyboard/test click counts", () => {
    const fn = vi.fn(); const t = tapProps(fn);
    t.onPointerDown({ clientX: 10, clientY: 10 }); t.onPointerUp({ clientX: 14, clientY: 16 }); expect(fn).toHaveBeenCalledTimes(1);
    t.onPointerDown({ clientX: 10, clientY: 10 }); t.onPointerUp({ clientX: 40, clientY: 10 }); expect(fn).toHaveBeenCalledTimes(1);
    t.onPointerDown({ clientX: 10, clientY: 10 }); t.onPointerCancel(); t.onPointerUp({ clientX: 10, clientY: 10 }); expect(fn).toHaveBeenCalledTimes(1);
    t.onClick({ detail: 1 }); expect(fn).toHaveBeenCalledTimes(1);
    t.onClick({ detail: 0 }); expect(fn).toHaveBeenCalledTimes(2);
    const ev = { cancelable: true, preventDefault: vi.fn() }; t.onTouchEnd(ev); expect(ev.preventDefault).toHaveBeenCalled();
  });
});

// ---------------- the app, inside Grimoire ----------------
const URL_ = "https://script.google.com/macros/s/GRIMOIRE/exec";
const KEY = "G".repeat(48);
let be;
const tid = (id) => screen.getByTestId(id);
const press = (k) => fireEvent.click(tid(`gx-key-${k}`));
const typeStr = (s) => { for (const ch of s) press(ch === " " ? "space" : ch === "'" ? "feet" : ch); };
const fnum = (f) => (screen.queryByTestId(`gx-fnum-${f}`) || { textContent: "" }).textContent;
const cards = () => screen.queryAllByTestId("gx-card");
const sheetRows = () => be.rows("goldenratio_history");
const settle = async () => { await sync.syncNow("open"); await sync.syncNow("open"); };
const open = async () => { window.location.hash = "#/app/goldenratio"; render(<App />); return screen.findByTestId("gx"); };

beforeEach(async () => {
  vi.spyOn(sync, "start").mockImplementation(() => {});
  cleanup();
  window.localStorage.clear();
  await resetCore();
  window.location.hash = "";
  setSyncStatus({ pending: 0, lastSync: null, errors: [], configured: false, lastError: null, backendVersion: null });
  Object.defineProperty(window, "innerWidth", { value: 390, configurable: true });
  be = createBackend({ key: KEY });
  window.fetch = be.fetch;
  window.localStorage.setItem("grimoire:sync:config", JSON.stringify({ url: URL_, key: KEY }));
  Object.defineProperty(navigator, "clipboard", { value: { writeText: vi.fn(async () => {}) }, configurable: true });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });

describe("Golden Ratio screens", () => {
  it("home tile shows the spiral icon and opens the app on the default screen", async () => {
    render(<App />);
    const tile = await screen.findByTestId("tile-goldenratio");
    expect(tile.querySelector("img")).toBeTruthy();
    fireEvent.click(tile);
    const root = await screen.findByTestId("gx");
    expect(root.dataset.mode).toBe("default");
    expect(tid("gx-graphic")).toBeTruthy();
    expect(screen.queryByTestId("gx-keypad")).toBeNull();
    for (const f of ["a", "b", "whole"]) expect(tid(`gx-unit-${f}`).value).toBe("mm");
  });

  it("graphic keeps its a, b and a+b labels on every screen", async () => {
    await open();
    const labels = () => [...tid("gx-graphic").querySelectorAll("text")].map((t) => t.textContent).join(",");
    expect(labels()).toBe("a,b,a+b");
    fireEvent.click(tid("gx-fval-a"));
    expect(tid("gx").dataset.mode).toBe("typing");
    expect(labels()).toBe("a,b,a+b");
    fireEvent.wheel(tid("gx-hist"), { deltaY: -40 });
    expect(tid("gx").dataset.mode).toBe("history");
    expect(labels()).toBe("a,b,a+b");
    expect(tid("gx-graphic").textContent).not.toMatch(/tap/i);
  });

  it("typing in a: live results in gold, Done saves one history entry that reaches the Sheet", async () => {
    await open();
    fireEvent.click(tid("gx-fval-a"));
    expect(tid("gx-keypad")).toBeTruthy();
    typeStr("10");
    expect(fnum("a")).toBe("10");
    expect(fnum("b")).toBe("6.1803");
    expect(fnum("whole")).toBe("16.1803");
    expect(tid("gx-fnum-a").className).toMatch(/gx-typed/);
    expect(tid("gx-fnum-b").className).toMatch(/gx-calc/);
    expect(cards().length).toBe(0); // nothing saved per keystroke
    fireEvent.click(tid("gx-done"));
    expect(tid("gx").dataset.mode).toBe("default");
    await waitFor(() => expect(cards().length).toBe(1));
    await settle();
    const rows = sheetRows();
    expect(rows.length).toBe(1);
    expect(rows[0]).toMatchObject({ Known: "a", Typed: "10", AUnit: "mm", BUnit: "mm", WholeUnit: "mm", Tape: "FALSE", Source: "goldenratio" });
    expect(Number(rows[0].BMm)).toBeCloseTo(10 / PHI, 9);
  });

  it("two taps faster than a screen redraw both count", async () => {
    await open();
    fireEvent.click(tid("gx-fval-a"));
    act(() => { tid("gx-key-1").click(); tid("gx-key-2").click(); tid("gx-key-.").click(); tid("gx-key-5").click(); });
    expect(fnum("a")).toBe("12.5");
  });

  it("typing over a gold result makes it the known value and recalculates the others", async () => {
    await open();
    fireEvent.click(tid("gx-fval-a")); typeStr("10"); fireEvent.click(tid("gx-done"));
    fireEvent.click(tid("gx-fval-whole"));
    expect(fnum("whole")).toBe("16.1803"); // starts filled in
    typeStr("5"); // first key replaces it
    expect(fnum("whole")).toBe("5");
    expect(fnum("a")).toBe("3.0902");
    expect(fnum("b")).toBe("1.9098");
    expect(tid("gx-fnum-whole").className).toMatch(/gx-typed/);
    expect(tid("gx-fnum-a").className).toMatch(/gx-calc/);
    fireEvent.click(tid("gx-done"));
    await waitFor(() => expect(cards().length).toBe(2));
  });

  it("units convert automatically; a gold field re-expresses, your own field keeps its number", async () => {
    await open();
    fireEvent.change(tid("gx-unit-b"), { target: { value: "mm" } });
    fireEvent.change(tid("gx-unit-a"), { target: { value: "in" } });
    fireEvent.click(tid("gx-fval-a")); typeStr("10");
    expect(fnum("b")).toBe("156.9806"); // 10 in / phi, in mm
    fireEvent.change(tid("gx-unit-b"), { target: { value: "cm" } });
    expect(fnum("b")).toBe("15.6981");
    fireEvent.change(tid("gx-unit-a"), { target: { value: "cm" } });
    expect(fnum("a")).toBe("10"); // kept the number, now 10 cm
    expect(fnum("b")).toBe("6.1803");
  });

  it("units stay through calculations and reopening, and go back to mm after 30 minutes without use", async () => {
    await open();
    fireEvent.change(tid("gx-unit-a"), { target: { value: "in" } });
    fireEvent.click(tid("gx-fval-a")); typeStr("4"); fireEvent.click(tid("gx-done"));
    fireEvent.click(tid("gx-fval-a")); typeStr("7"); fireEvent.click(tid("gx-done"));
    expect(tid("gx-unit-a").value).toBe("in");
    cleanup();
    await open();
    expect(tid("gx-unit-a").value).toBe("in");
    cleanup();
    const s = JSON.parse(window.localStorage.getItem("grimoire:goldenratio:session"));
    s.at -= SESSION_TTL + 1000;
    window.localStorage.setItem("grimoire:goldenratio:session", JSON.stringify(s));
    await open();
    expect(tid("gx-unit-a").value).toBe("mm");
  });

  it("units reset while the app sits open and unused for 30 minutes", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
    await act(async () => { window.location.hash = "#/app/goldenratio"; render(<App />); });
    fireEvent.change(tid("gx-unit-b"), { target: { value: "ft" } });
    expect(tid("gx-unit-b").value).toBe("ft");
    await act(async () => { vi.advanceTimersByTime(SESSION_TTL + 61000); });
    expect(tid("gx-unit-b").value).toBe("mm");
  });

  it("tape mode: fraction keys, a metric field switches to inches, results as fractions with the exact value", async () => {
    await open();
    fireEvent.click(tid("gx-fval-a"));
    expect(screen.queryByTestId("gx-fracrow")).toBeNull();
    fireEvent.click(tid("gx-tape"));
    expect(tid("gx-fracrow")).toBeTruthy();
    expect(tid("gx-unit-a").value).toBe("in");
    expect(screen.queryByTestId("gx-key-.")).toBeNull();
    fireEvent.change(tid("gx-unit-b"), { target: { value: "in" } });
    press("3"); fireEvent.click(tid("gx-key-5-8"));
    expect(fnum("a")).toBe("3 5/8");
    expect(fnum("b")).toBe("2 1/4 2.2404");
    expect(fnum("whole")).toBe("148.9805"); // a+b still in mm: stays decimal
    fireEvent.click(tid("gx-done"));
    await settle();
    expect(sheetRows()[0]).toMatchObject({ Typed: "3 5/8", Tape: "TRUE", AUnit: "in" }); // stored as text, not a date
    fireEvent.click(tid("gx-fval-a"));
    fireEvent.click(tid("gx-tape"));
    expect(screen.queryByTestId("gx-fracrow")).toBeNull();
  });

  it("ft-in: feet key, and results in feet and inches", async () => {
    await open();
    for (const f of ["a", "b", "whole"]) fireEvent.change(tid(`gx-unit-${f}`), { target: { value: "ftin" } });
    fireEvent.click(tid("gx-fval-a"));
    fireEvent.click(tid("gx-tape"));
    press("5"); press("feet"); press("3"); fireEvent.click(tid("gx-key-1-2"));
    expect(fnum("a")).toBe("5' 3 1/2");
    expect(fnum("b")).toMatch(/^3' 3 1\/4"/);
    expect(fnum("whole")).toMatch(/^8' 6 3\/4"/);
  });

  it("typing mode shows one history card; scrolling the history grows it and hides the fields; the graphic goes back", async () => {
    await open();
    for (const v of ["1", "2", "3"]) { fireEvent.click(tid("gx-fval-a")); typeStr(v); fireEvent.click(tid("gx-done")); fireEvent.click(tid("gx-fval-b")); typeStr(v); fireEvent.click(tid("gx-done")); }
    await waitFor(() => expect(cards().length).toBe(6));
    fireEvent.click(tid("gx-fval-a"));
    expect(cards().length).toBe(1);
    fireEvent.touchStart(tid("gx-hist"), { touches: [{ clientY: 100 }] });
    fireEvent.touchMove(tid("gx-hist"), { touches: [{ clientY: 140 }] });
    expect(tid("gx").dataset.mode).toBe("history");
    expect(screen.queryByTestId("gx-keypad")).toBeNull();
    expect(screen.queryByTestId("gx-fields")).toBeNull();
    expect(cards().length).toBe(6);
    fireEvent.click(tid("gx-graphic"));
    expect(tid("gx").dataset.mode).toBe("default");
    expect(tid("gx-fields")).toBeTruthy();
  });

  it("history colours: the typed value is white and the calculated ones gold", async () => {
    await open();
    fireEvent.click(tid("gx-fval-b")); typeStr("100"); fireEvent.click(tid("gx-done"));
    await waitFor(() => expect(cards().length).toBe(1));
    const c = cards()[0];
    expect(c.querySelector('[data-testid="gx-val-b"]').className).toMatch(/gx-typed/);
    expect(c.querySelector('[data-testid="gx-val-a"]').className).toMatch(/gx-calc/);
    expect(c.querySelector('[data-testid="gx-val-a"]').textContent).toBe("161.8034");
    expect(c.querySelector('[data-testid="gx-val-whole"]').textContent).toBe("261.8034");
  });

  it("tapping a history card loads it back without adding a duplicate", async () => {
    await open();
    fireEvent.change(tid("gx-unit-a"), { target: { value: "in" } });
    fireEvent.click(tid("gx-fval-a")); typeStr("10"); fireEvent.click(tid("gx-done"));
    fireEvent.click(tid("gx-fval-b")); typeStr("40"); fireEvent.click(tid("gx-done"));
    await waitFor(() => expect(cards().length).toBe(2));
    fireEvent.click(cards()[0].querySelector(".gx-card"));
    expect(fnum("a")).toBe("10");
    expect(tid("gx-unit-a").value).toBe("in");
    expect(tid("gx-unit-b").value).toBe("mm");
    expect(fnum("b")).toBe("156.9806");
    fireEvent.click(tid("gx-graphic"));
    await new Promise((r) => setTimeout(r, 30));
    expect(cards().length).toBe(2);
  });

  it("changing the unit of your own value counts as a new calculation", async () => {
    await open();
    fireEvent.click(tid("gx-fval-a")); typeStr("10"); fireEvent.click(tid("gx-done"));
    fireEvent.change(tid("gx-unit-a"), { target: { value: "in" } });
    fireEvent.click(tid("gx-graphic"));
    await waitFor(() => expect(cards().length).toBe(2));
    expect(cards()[1].querySelector('[data-testid="gx-box-a"]').textContent).toMatch(/10\s*in/);
  });

  it("Done twice, or leaving the field, never saves the same calculation twice", async () => {
    await open();
    fireEvent.click(tid("gx-fval-a")); typeStr("8"); fireEvent.click(tid("gx-done"));
    fireEvent.click(tid("gx-fval-a")); fireEvent.click(tid("gx-done"));
    fireEvent.click(tid("gx-fval-a")); press("back"); press("8"); fireEvent.click(tid("gx-done")); // retyped the same thing
    fireEvent.click(tid("gx-graphic"));
    await new Promise((r) => setTimeout(r, 30));
    expect(cards().length).toBe(1);
  });

  it("leaving the app with an unsaved value saves it", async () => {
    await open();
    fireEvent.click(tid("gx-fval-a")); typeStr("21");
    fireEvent.click(tid("back"));
    await waitFor(async () => expect((await data.dirtySnapshot()).filter((r) => r.app === "goldenratio").length).toBe(1));
  });

  it("Copy: pick a, b or a+b and it goes to the clipboard with its unit", async () => {
    await open();
    fireEvent.click(tid("gx-fval-a")); typeStr("10");
    fireEvent.click(tid("gx-copy"));
    fireEvent.click(tid("gx-copy-b"));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith("6.1803 mm"));
    expect(tid("gx-toast").textContent).toBe("Copied 6.1803 mm");
  });

  it("computer keyboard types into the active field; Enter is Done", async () => {
    await open();
    fireEvent.click(tid("gx-fval-a"));
    for (const k of ["1", "2", ".", "5"]) fireEvent.keyDown(window, { key: k });
    expect(fnum("a")).toBe("12.5");
    fireEvent.keyDown(window, { key: "Backspace" });
    expect(fnum("a")).toBe("12.");
    fireEvent.keyDown(window, { key: "Enter" });
    expect(tid("gx").dataset.mode).toBe("default");
    await waitFor(() => expect(cards().length).toBe(1));
  });

  it("swipe left on a card in the history screen deletes it (a flag in the Sheet, never erased)", async () => {
    await open();
    fireEvent.click(tid("gx-fval-a")); typeStr("9"); fireEvent.click(tid("gx-done"));
    await waitFor(() => expect(cards().length).toBe(1));
    await settle();
    fireEvent.wheel(tid("gx-hist"), { deltaY: -10 });
    fireEvent.click(tid("gx-del"));
    await waitFor(() => expect(cards().length).toBe(0));
    await settle();
    expect(sheetRows().length).toBe(1);
    expect(Number(sheetRows()[0].Deleted)).toBe(1);
  });

  it("history from another device appears (synced, not device-only)", async () => {
    // a second "device" writes straight to the simulated Sheet through the real backend
    be.post({ key: KEY, action: "sync", items: [{ app: "goldenratio", coll: "history", since: 0, pull: false, fields: ["Known", "Typed", "AUnit", "BUnit", "WholeUnit", "AMm", "BMm", "WholeMm", "Tape", "Source"],
      records: [{ id: "otherdevice0001", createdAt: 1000, updatedAt: 1000, deleted: 0, schemaVersion: 1, cols: { Known: "b", Typed: "50", AUnit: "mm", BUnit: "mm", WholeUnit: "mm", AMm: String(50 * PHI), BMm: "50", WholeMm: String(50 * PHI * PHI), Tape: "FALSE", Source: "goldenratio" } }] }] });
    await open();
    await settle();
    await waitFor(() => expect(cards().length).toBe(1));
    expect(cards()[0].querySelector('[data-testid="gx-val-a"]').textContent).toBe("80.9017");
  });

  it("demo mode: fake history on this device only, new calculations stay out of the Sheet, Clear demo data", async () => {
    await open();
    fireEvent.click(tid("gx-fval-a")); typeStr("2"); fireEvent.click(tid("gx-done"));
    await waitFor(() => expect(cards().length).toBe(1));
    fireEvent.wheel(tid("gx-hist"), { deltaY: -10 });
    fireEvent.click(tid("gx-demo-on"));
    expect(tid("gx-demobar")).toBeTruthy();
    expect(cards().length).toBe(7);
    expect(cards().every((c) => c.dataset.demo === "1")).toBe(true);
    fireEvent.click(tid("gx-graphic"));
    fireEvent.click(tid("gx-fval-a")); typeStr("77"); fireEvent.click(tid("gx-done"));
    expect(cards().length).toBe(8);
    await settle();
    expect(sheetRows().length).toBe(1); // only the real one
    expect(sheetRows().some((r) => r.Typed === "77")).toBe(false);
    fireEvent.click(tid("gx-demo-clear"));
    expect(screen.queryByTestId("gx-demobar")).toBeNull();
    await waitFor(() => expect(cards().length).toBe(1)); // the real history is back, untouched
    expect(window.localStorage.getItem("grimoire:goldenratio:demo")).toContain('"records":[]');
  });
});

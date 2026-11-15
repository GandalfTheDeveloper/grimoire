import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, act, waitFor } from "@testing-library/react";
import App from "../src/shell/App.jsx";
import { setSyncStatus, getSyncStatus } from "../src/core/syncStatus.js";
import { sync, data, selftestCol } from "../src/core/index.js";
import { createBackend } from "./sim/sheetsSim.js";
import { APPS } from "../src/apps/registry.js";

const setWidth = (w) => { Object.defineProperty(window, "innerWidth", { value: w, configurable: true }); };

let startSpy;
beforeEach(() => {
  // Sync has its own tests (tests/sync.test.js). Here the shell just must not run it in the background.
  startSpy = vi.spyOn(sync, "start").mockImplementation(() => {});
  cleanup();
  window.localStorage.clear();
  window.location.hash = "";
  setSyncStatus({ pending: 0, lastSync: null, errors: [], configured: false, lastError: null, backendVersion: null });
  setWidth(390);
});
afterEach(() => { vi.restoreAllMocks(); });

describe("home screen", () => {
  it("shows a tile for every app on a phone, plus a visible build number", () => {
    render(<App />);
    for (const a of APPS) expect(screen.getByTestId(`tile-${a.id}`)).toBeTruthy();
    expect(screen.getByTestId("build-number").textContent).toMatch(/^Build \d+\.\d+\.\d+ · \d{4}-\d{2}-\d{2}/);
  });
  it("opens an app, then goes back home", async () => {
    render(<App />);
    fireEvent.click(screen.getByTestId("tile-fitness"));
    await waitFor(() => expect(screen.getByTestId("placeholder-fitness")).toBeTruthy());
    expect(window.location.hash).toBe("#/app/fitness");
    fireEvent.click(screen.getByTestId("back"));
    await waitFor(() => expect(screen.getByTestId("home-grid")).toBeTruthy());
    expect(screen.queryByTestId("placeholder-fitness")).toBeNull();
  });
  it("unknown app id shows a friendly message", () => {
    window.location.hash = "#/app/nope";
    render(<App />);
    expect(screen.getByText(/doesn't exist/)).toBeTruthy();
  });
  it("marks Vault apps with a lock", () => {
    render(<App />);
    expect(screen.getByTestId("tile-journal").querySelector("svg[aria-label='In the Vault']")).toBeTruthy();
    expect(screen.getByTestId("tile-fitness").querySelector("svg[aria-label='In the Vault']")).toBeNull();
  });
});

describe("status dot", () => {
  it("is green at zero pending and amber with a count otherwise", () => {
    render(<App />);
    expect(screen.getByTestId("status-dot").className).not.toMatch(/amber/);
    act(() => setSyncStatus({ pending: 3 }));
    expect(screen.getByTestId("status-dot").className).toMatch(/amber/);
    expect(screen.getByTestId("status-dot").textContent).toBe("3");
    act(() => setSyncStatus({ pending: 0 }));
    expect(screen.getByTestId("status-dot").className).not.toMatch(/amber/);
  });
});

describe("settings", () => {
  it("hides an app turned off, and remembers it under a grimoire: key", async () => {
    render(<App />);
    fireEvent.click(screen.getByTestId("open-settings"));
    fireEvent.click(await screen.findByTestId("toggle-cookbook"));
    fireEvent.click(screen.getByTestId("back"));
    await screen.findByTestId("home-grid");
    expect(screen.queryByTestId("tile-cookbook")).toBeNull();
    expect(screen.getByTestId("tile-fitness")).toBeTruthy();
    expect(JSON.parse(window.localStorage.getItem("grimoire:shell:appsOnDevice"))).not.toContain("cookbook");
    cleanup(); window.location.hash = "";
    render(<App />);
    expect(screen.queryByTestId("tile-cookbook")).toBeNull();
  });
  it("never writes an unprefixed storage key", async () => {
    render(<App />);
    fireEvent.click(screen.getByTestId("open-settings"));
    fireEvent.click(await screen.findByTestId("toggle-budget"));
    fireEvent.change(screen.getByTestId("open-on-launch"), { target: { value: "fitness" } });
    const keys = Object.keys(window.localStorage);
    expect(keys.length).toBeGreaterThan(0);
    for (const k of keys) expect(k.startsWith("grimoire:")).toBe(true);
  });
  it("diagnostics shows build, pending count, and no personal content", async () => {
    render(<App />);
    act(() => setSyncStatus({ pending: 2 }));
    fireEvent.click(screen.getByTestId("open-settings"));
    fireEvent.click(await screen.findByTestId("open-diagnostics"));
    const t = (await screen.findByTestId("diagnostics")).textContent;
    expect(t).toMatch(/Build/); expect(t).toMatch(/Items pending2/); expect(t).toMatch(/Last sync/);
  });
});

describe("open on launch", () => {
  it("phone default opens the home screen", () => {
    render(<App />);
    expect(window.location.hash).toBe("");
    expect(screen.getByTestId("home-grid")).toBeTruthy();
  });
  it("tablet default opens Fitness", async () => {
    setWidth(1000);
    render(<App />);
    await waitFor(() => expect(screen.getByTestId("placeholder-fitness")).toBeTruthy());
  });
  it("tablet can reach the other apps from home via back", async () => {
    setWidth(1000);
    render(<App />);
    await waitFor(() => expect(screen.getByTestId("placeholder-fitness")).toBeTruthy());
    fireEvent.click(screen.getByTestId("back"));
    await waitFor(() => expect(screen.getByTestId("tile-journal")).toBeTruthy());
  });
  it("honours a saved choice, and falls back to home if that app is turned off", async () => {
    window.localStorage.setItem("grimoire:shell:openOnLaunch", JSON.stringify("lists"));
    render(<App />);
    await waitFor(() => expect(screen.getByTestId("placeholder-lists")).toBeTruthy());
    cleanup(); window.location.hash = "";
    window.localStorage.setItem("grimoire:shell:appsOnDevice", JSON.stringify(["fitness"]));
    render(<App />);
    expect(screen.getByTestId("home-grid")).toBeTruthy();
  });
  it("does not override an explicit route", async () => {
    setWidth(1000);
    window.location.hash = "#/settings";
    render(<App />);
    expect(await screen.findByTestId("settings")).toBeTruthy();
  });
});

describe("updates", () => {
  it("shows the update banner only when a new version is waiting", async () => {
    render(<App />);
    expect(screen.queryByTestId("update-banner")).toBeNull();
  });
});

describe("sync wiring", () => {
  it("starts the sync engine when the shell mounts and stops it when it closes", async () => {
    const stop = vi.spyOn(sync, "stop");
    const { unmount } = render(<App />);
    await waitFor(() => expect(startSpy).toHaveBeenCalledTimes(1));
    unmount();
    expect(stop).toHaveBeenCalled();
  });
  it("tells the engine which app is open", async () => {
    const setOpen = vi.spyOn(sync, "setOpenApp");
    window.location.hash = "#/app/fitness";
    render(<App />);
    await waitFor(() => expect(setOpen).toHaveBeenCalledWith("fitness"));
    fireEvent.click(await screen.findByTestId("back"));
    await waitFor(() => expect(setOpen).toHaveBeenLastCalledWith(null));
  });
});

describe("connection settings", () => {
  const URL_ = "https://script.google.com/macros/s/TESTID/exec";
  const open = async () => { render(<App />); fireEvent.click(screen.getByTestId("open-settings")); await screen.findByTestId("connection"); };
  it("saves the address and key on this device under grimoire:sync:*, and hides the key by default", async () => {
    await open();
    expect(screen.getByTestId("conn-key").getAttribute("type")).toBe("password");
    fireEvent.change(screen.getByTestId("conn-url"), { target: { value: URL_ } });
    fireEvent.change(screen.getByTestId("conn-key"), { target: { value: "K".repeat(48) } });
    fireEvent.click(screen.getByTestId("conn-save"));
    expect(screen.getByTestId("conn-msg").textContent).toMatch(/Saved/);
    expect(JSON.parse(window.localStorage.getItem("grimoire:sync:config"))).toEqual({ url: URL_, key: "K".repeat(48) });
    expect(getSyncStatus().configured).toBe(true);
    fireEvent.click(screen.getByTestId("conn-show"));
    expect(screen.getByTestId("conn-key").getAttribute("type")).toBe("text");
  });
  it("refuses an address that isn't a script address, and a short key", async () => {
    await open();
    fireEvent.change(screen.getByTestId("conn-url"), { target: { value: "https://example.com" } });
    fireEvent.click(screen.getByTestId("conn-save"));
    expect(screen.getByTestId("conn-msg").textContent).toMatch(/script address/);
    expect(window.localStorage.getItem("grimoire:sync:config")).toBeNull();
    fireEvent.change(screen.getByTestId("conn-url"), { target: { value: URL_ } });
    fireEvent.change(screen.getByTestId("conn-key"), { target: { value: "short" } });
    fireEvent.click(screen.getByTestId("conn-save"));
    expect(screen.getByTestId("conn-msg").textContent).toMatch(/at least 32/);
  });
  it("Generate key fills in 48 random characters without saving them", async () => {
    await open();
    fireEvent.click(screen.getByTestId("conn-generate"));
    const k = screen.getByTestId("conn-key").value;
    expect(k).toMatch(/^[A-Za-z0-9]{48}$/);
    expect(window.localStorage.getItem("grimoire:sync:config")).toBeNull();
    fireEvent.click(screen.getByTestId("conn-generate"));
    expect(screen.getByTestId("conn-key").value).not.toBe(k);
  });
  it("Save and test reports a connected backend, or a plain reason when it can't connect", async () => {
    const b = createBackend({ key: "K".repeat(48) });
    vi.stubGlobal("fetch", b.fetch);
    await open();
    fireEvent.change(screen.getByTestId("conn-url"), { target: { value: URL_ } });
    fireEvent.change(screen.getByTestId("conn-key"), { target: { value: "K".repeat(48) } });
    fireEvent.click(screen.getByTestId("conn-test"));
    await waitFor(() => expect(screen.getByTestId("conn-msg").textContent).toMatch(/Connected. Backend version 0\.2\.0/));
    fireEvent.change(screen.getByTestId("conn-key"), { target: { value: "W".repeat(48) } });
    fireEvent.click(screen.getByTestId("conn-test"));
    await waitFor(() => expect(screen.getByTestId("conn-msg").textContent).toMatch(/Not connected: The key was rejected/));
    b.offline = true;
    fireEvent.change(screen.getByTestId("conn-key"), { target: { value: "K".repeat(48) } });
    fireEvent.click(screen.getByTestId("conn-test"));
    await waitFor(() => expect(screen.getByTestId("conn-msg").textContent).toMatch(/No connection to the Sheet/));
    vi.unstubAllGlobals();
  });
});

describe("diagnostics tools", () => {
  const goDiag = async () => { render(<App />); fireEvent.click(screen.getByTestId("open-settings")); fireEvent.click(await screen.findByTestId("open-diagnostics")); await screen.findByTestId("diagnostics"); };
  it("explains plainly when there is no connection yet instead of running a test", async () => {
    await goDiag();
    fireEvent.click(screen.getByTestId("diag-test"));
    await waitFor(() => expect(screen.getByTestId("diag-result").textContent).toMatch(/Not connected yet/));
  });
  it("runs the sync test against a Sheet, shows pass, and clears the test rows", async () => {
    const b = createBackend({ key: "K".repeat(48) });
    vi.stubGlobal("fetch", b.fetch);
    window.localStorage.setItem("grimoire:sync:config", JSON.stringify({ url: "https://script.google.com/macros/s/TESTID/exec", key: "K".repeat(48) }));
    await goDiag();
    setSyncStatus({ configured: true });
    fireEvent.click(screen.getByTestId("diag-test"));
    await waitFor(() => expect(screen.getByTestId("diag-result").textContent).toMatch(/Sync test passed \(21 values/), { timeout: 4000 });
    expect(b.rows("selftest_items")).toHaveLength(3);
    fireEvent.click(screen.getByTestId("diag-clear"));
    await waitFor(() => expect(screen.getByTestId("diag-result").textContent).toMatch(/Cleared 3 test records/), { timeout: 4000 });
    expect(await selftestCol.list()).toHaveLength(0);
    expect(data.pendingCount()).toBe(0);
    vi.unstubAllGlobals();
  });
});

describe("iPhone safe area", () => {
  it("the update banner and the top bar both clear the status bar, without doubling up", async () => {
    const css = (await import("node:fs")).readFileSync("src/shell/shell.css", "utf8");
    expect(css).toMatch(/\.gr-banner \{[^}]*padding: calc\(env\(safe-area-inset-top\) \+ 10px\)/);
    expect(css).toMatch(/\.gr-banner \+ \.gr-top \{ padding-top: 10px; \}/);
    expect(css).toMatch(/\.gr-top \{[^}]*env\(safe-area-inset-top\)/);
  });
});

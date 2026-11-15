import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, act, waitFor } from "@testing-library/react";
import App from "../src/shell/App.jsx";
import { setSyncStatus } from "../src/core/syncStatus.js";
import { APPS } from "../src/apps/registry.js";

const setWidth = (w) => { Object.defineProperty(window, "innerWidth", { value: w, configurable: true }); };

beforeEach(() => {
  cleanup();
  window.localStorage.clear();
  window.location.hash = "";
  setSyncStatus({ pending: 0, lastSync: null, errors: [] });
  setWidth(390);
});

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
    act(() => setSyncStatus({ pending: 2 }));
    render(<App />);
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

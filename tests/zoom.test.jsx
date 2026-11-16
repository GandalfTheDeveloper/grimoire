// Chart zoom (x axis only) and drag to scroll. Fake data only.
import { describe, it, expect, afterEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { SvgChart } from "../src/apps/fitness/chart.jsx";
import { ProgressSlide } from "../src/apps/fitness/slides.jsx";
import { MIN_SPAN_DAYS, effectiveView, fitView, panView, pinchView } from "../src/apps/fitness/zoom.js";

afterEach(cleanup);

const FULL = { a: 20000, b: 20120 }; // 120 days of data

describe("zoom maths", () => {
  it("never goes wider than the data, or past either end", () => {
    expect(fitView(19000, 21000, FULL)).toBeNull(); // wider than everything = the full range
    expect(fitView(20000, 20120, FULL)).toBeNull();
    expect(fitView(19990, 20030, FULL)).toEqual({ a: 20000, b: 20040 }); // pushed back inside, same width
    expect(fitView(20100, 20150, FULL)).toEqual({ a: 20070, b: 20120 });
  });
  it("can't zoom in closer than a week, and can't zoom at all with less data than that", () => {
    const v = fitView(20050, 20051, FULL);
    expect(v.b - v.a).toBeCloseTo(MIN_SPAN_DAYS);
    expect(fitView(20000, 20003, { a: 20000, b: 20005 })).toBeNull();
  });
  it("pinch keeps the day under your fingers in place", () => {
    const v = pinchView(null, FULL, 2, 20060, 0.5); // fingers apart 2x, middle of the plot over day 20060
    expect(v).toEqual({ a: 20030, b: 20090 });
    const w = pinchView(null, FULL, 4, 20030, 0.25); // that day is a quarter of the way across
    expect(w.a + 0.25 * (w.b - w.a)).toBeCloseTo(20030);
    expect(w.b - w.a).toBeCloseTo(30);
  });
  it("pinching out past the full range gives the full range, not more", () => {
    expect(pinchView({ a: 20030, b: 20090 }, FULL, 0.1, 20060, 0.5)).toBeNull();
    expect(effectiveView(null, FULL)).toEqual(FULL);
  });
  it("dragging moves the window and stops at the ends", () => {
    const z = { a: 20030, b: 20090 };
    expect(panView(z, FULL, 10)).toEqual({ a: 20040, b: 20100 });
    expect(panView(z, FULL, 500)).toEqual({ a: 20060, b: 20120 });
    expect(panView(z, FULL, -500)).toEqual({ a: 20000, b: 20060 });
    expect(panView(null, FULL, 10)).toBeNull(); // nothing to scroll when the whole range is showing
  });
});

// ---- the chart on screen ----
const series = () => [{ points: Array.from({ length: 41 }, (_, i) => ({ t: 20000 + i * 3, v: 150 + i + (i % 7) })), color: "#2FD9C0", dots: true, name: "Weight" }];
// Width 640, one value axis on the left: the plot runs from x = 64 to x = 624.
const touches = (...xs) => xs.map((x) => ({ clientX: x, clientY: 100 }));
const view = () => { const [a, b] = screen.getByTestId("chart-plot").getAttribute("data-view").split(":").map(Number); return { a, b }; };
const axisLabels = () => [...document.querySelectorAll("svg text")].filter((t) => t.getAttribute("text-anchor") === "end").map((t) => t.textContent);
const svgEl = () => screen.getByTestId("chart-svg");

function Host({ onStart, onEnd, k = "a" }) {
  return (
    <div onTouchStart={onStart} onTouchEnd={onEnd} style={{ width: 640, height: 300 }}>
      <SvgChart key={k} series={series()} left={{ label: "Weight" }} xLabel="Date" />
    </div>
  );
}
const pinchOut = () => { // two fingers 100 px apart, spread to 300 px apart, around the middle
  fireEvent.touchStart(svgEl(), { touches: touches(294, 394) });
  fireEvent.touchMove(svgEl(), { touches: touches(194, 494) });
  fireEvent.touchEnd(svgEl(), { touches: [] });
};

describe("pinch and drag on a chart", () => {
  it("starts on the whole date range", () => {
    render(<Host />);
    expect(view()).toEqual({ a: 20000, b: 20120 });
  });
  it("pinching apart narrows the date range around your fingers and leaves the y axis alone", () => {
    render(<Host />);
    const before = axisLabels();
    expect(before.length).toBeGreaterThan(2);
    pinchOut();
    const v = view();
    expect(v.b - v.a).toBeCloseTo(40, 0); // 100 px -> 300 px = 3x
    expect(v.a).toBeGreaterThan(20000);
    expect(v.b).toBeLessThan(20120);
    expect(axisLabels()).toEqual(before); // value axis untouched
  });
  it("pinching back together can't go wider than the data", () => {
    render(<Host />);
    pinchOut();
    fireEvent.touchStart(svgEl(), { touches: touches(194, 494) });
    fireEvent.touchMove(svgEl(), { touches: touches(300, 340) }); // far smaller than the start
    fireEvent.touchEnd(svgEl(), { touches: [] });
    expect(view()).toEqual({ a: 20000, b: 20120 });
  });
  it("can't zoom in past a week", () => {
    render(<Host />);
    fireEvent.touchStart(svgEl(), { touches: touches(340, 350) });
    fireEvent.touchMove(svgEl(), { touches: touches(100, 600) }); // 50x
    fireEvent.touchEnd(svgEl(), { touches: [] });
    const v = view();
    expect(v.b - v.a).toBeCloseTo(MIN_SPAN_DAYS);
  });
  it("when zoomed, one finger drags the range left and right, and it stops at both ends", () => {
    render(<Host />);
    pinchOut();
    const w = view().b - view().a;
    const a0 = view().a;
    fireEvent.touchStart(svgEl(), { touches: touches(300) });
    fireEvent.touchMove(svgEl(), { touches: touches(200) }); // finger left 100 px = later dates
    expect(view().a).toBeGreaterThan(a0);
    expect(view().b - view().a).toBeCloseTo(w); // same width, just moved
    fireEvent.touchMove(svgEl(), { touches: touches(-4000) });
    expect(view().b).toBe(20120); // can't pass the newest day
    fireEvent.touchEnd(svgEl(), { touches: [] });
    fireEvent.touchStart(svgEl(), { touches: touches(100) });
    fireEvent.touchMove(svgEl(), { touches: touches(9000) });
    expect(view().a).toBe(20000); // or the oldest
    fireEvent.touchEnd(svgEl(), { touches: [] });
  });
  it("one finger does nothing to the range while it is not zoomed", () => {
    render(<Host />);
    fireEvent.touchStart(svgEl(), { touches: touches(300) });
    fireEvent.touchMove(svgEl(), { touches: touches(100) });
    fireEvent.touchEnd(svgEl(), { touches: [] });
    expect(view()).toEqual({ a: 20000, b: 20120 });
  });
  it("only points inside the window are drawn in view: the plot is clipped while zoomed, not when whole", () => {
    render(<Host />);
    expect(screen.getByTestId("chart-plot").getAttribute("clip-path")).toBeNull();
    pinchOut();
    expect(screen.getByTestId("chart-plot").getAttribute("clip-path")).toMatch(/^url\(#/);
  });
  it("a pinch or a drag on a zoomed chart never counts as a slide swipe, but a plain swipe still does", () => {
    let starts = 0, ends = 0;
    render(<Host onStart={() => { starts++; }} onEnd={() => { ends++; }} />);
    // not zoomed: one-finger swipe reaches the slide
    fireEvent.touchStart(svgEl(), { touches: touches(500) });
    fireEvent.touchEnd(svgEl(), { touches: [], changedTouches: touches(100) });
    expect([starts, ends]).toEqual([1, 1]);
    // a pinch is swallowed (a second finger on the screen)
    pinchOut();
    expect(ends).toBe(1);
    // zoomed: dragging is swallowed too
    const s = starts;
    fireEvent.touchStart(svgEl(), { touches: touches(500) });
    fireEvent.touchMove(svgEl(), { touches: touches(100) });
    fireEvent.touchEnd(svgEl(), { touches: [], changedTouches: touches(100) });
    expect([starts, ends]).toEqual([s, 1]);
  });
  it("a pinch or drag doesn't also tap a point, and a readout closes when you start to zoom", () => {
    render(<Host />);
    const dot = document.querySelector('circle[r="4"]');
    const tap = () => fireEvent.click(svgEl(), { clientX: Number(dot.getAttribute("cx")), clientY: Number(dot.getAttribute("cy")) });
    tap();
    expect(screen.queryByTestId("chart-tip")).not.toBeNull();
    pinchOut();
    expect(screen.queryByTestId("chart-tip")).toBeNull(); // closed by the pinch
    tap(); // the click that follows a pinch is ignored
    expect(screen.queryByTestId("chart-tip")).toBeNull();
  });
  it("a new chart (another tab, A/B, lift or slide) starts on the full range again", () => {
    const { rerender } = render(<Host k="a" />);
    pinchOut();
    expect(view().b - view().a).toBeLessThan(120);
    rerender(<Host k="b" />);
    expect(view()).toEqual({ a: 20000, b: 20120 });
  });
});

// ---- on the Progress slide: switching graphs resets the zoom ----
const iso = (idx) => new Date(idx * 86400000).toISOString().slice(0, 10);
describe("Progress slide", () => {
  it("switching to another graph and back shows the full range again", () => {
    const today = Math.floor(Date.now() / 86400000);
    const daily = Array.from({ length: 80 }, (_, i) => ({ Date: iso(today - 79 + i), Weight: 200 - i * 0.1, CompletionStatus: "Complete", Notes: "", StatusManual: "FALSE" }));
    const runs = Array.from({ length: 12 }, (_, i) => ({ Date: iso(today - 70 + i * 6), Distance: "3", Time: "30:00", Pace: "10:00" }));
    render(<ProgressSlide dailyLog={daily} exerciseLog={[]} runLog={runs} anchorDate="2026-09-21" planOverrides={{}} abSeconds={9999} />);
    fireEvent.click(screen.getByText("Body weight"));
    const full = view();
    fireEvent.touchStart(svgEl(), { touches: touches(294, 394) });
    fireEvent.touchMove(svgEl(), { touches: touches(194, 494) });
    fireEvent.touchEnd(svgEl(), { touches: [] });
    expect(view().b - view().a).toBeLessThan(full.b - full.a);
    fireEvent.click(screen.getByText("Run pace"));
    fireEvent.click(screen.getByText("Body weight"));
    expect(view()).toEqual(full);
  });
});

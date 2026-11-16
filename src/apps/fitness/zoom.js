// Chart zoom, x axis only. All maths is on the date range (day numbers), never on values, so the y axis never moves.
// "full" is { a, b }: the first and last day the chart has data for. A "view" is { a, b } inside it, or null for the whole range.
// The view can never reach outside the full range, so you can't zoom out past the data or scroll past either end.

export const MIN_SPAN_DAYS = 7; // closest you can zoom in (a chart with less data than this can't zoom at all)

const minSpanOf = (full, minSpan) => Math.min(minSpan, full.b - full.a);

// Fits a window into the full range: never wider than it, never past either end. null when it covers everything.
export function fitView(a, b, full, minSpan = MIN_SPAN_DAYS) {
  const fullSpan = full.b - full.a;
  const lo = minSpanOf(full, minSpan);
  if (!(fullSpan > 0) || fullSpan <= lo + 1e-9) return null;
  let span = Math.min(fullSpan, Math.max(lo, b - a));
  if (span >= fullSpan - 1e-6) return null;
  let na = Math.min(Math.max(a, full.a), full.b - span);
  return { a: na, b: na + span };
}

// The view as it should be drawn right now (a stored view is re-fitted, in case the data changed since).
export const effectiveView = (view, full, minSpan = MIN_SPAN_DAYS) => (view ? fitView(view.a, view.b, full, minSpan) : null) || { a: full.a, b: full.b };

// Pinch: `start` is the view when the two fingers went down, `scale` > 1 means fingers moved apart (zoom in).
// `anchorT` is the day that was under the middle of the fingers at the start, `frac` where the middle is now (0 = left edge of the plot, 1 = right edge),
// so that day stays under your fingers (and moving both fingers sideways pans).
export function pinchView(start, full, scale, anchorT, frac, minSpan = MIN_SPAN_DAYS) {
  const s = effectiveView(start, full, minSpan);
  const span = (s.b - s.a) / Math.max(scale, 1e-6);
  const f = Math.min(1, Math.max(0, frac));
  return fitView(anchorT - f * span, anchorT - f * span + span, full, minSpan);
}

// One-finger drag while zoomed: `dt` days to move the window (positive = later).
export function panView(start, full, dt, minSpan = MIN_SPAN_DAYS) {
  const s = effectiveView(start, full, minSpan);
  return fitView(s.a + dt, s.b + dt, full, minSpan);
}

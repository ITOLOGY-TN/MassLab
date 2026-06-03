// Pure SVG chart geometry (Phase 5, research D-9) — no charting dependency. All
// functions are deterministic functions of their inputs (Constitution V), so the
// chart math is unit-tested while the components stay thin.

function round2(n) {
  return Math.round(n * 100) / 100;
}

/** A linear scale: maps a value in [domainMin, domainMax] to [rangeMin, rangeMax]. */
export function linearScale({ domainMin, domainMax, rangeMin, rangeMax }) {
  const span = domainMax - domainMin || 1;
  return (v) => rangeMin + ((v - domainMin) / span) * (rangeMax - rangeMin);
}

/** An SVG path `d` string through screen-space points `[{ x, y }]`. */
export function linePath(points = []) {
  if (!points.length) return '';
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${round2(p.x)},${round2(p.y)}`).join(' ');
}

/**
 * A closed SVG path `d` string for a filled band between an `upper` and a `lower`
 * array of screen-space points (same scale convention as `linePath`). The path runs
 * along `upper` left→right, down to the last `lower` point, back along `lower`
 * right→left, then closes. Returns '' when either edge is empty.
 */
export function bandPath({ upper = [], lower = [] } = {}) {
  if (!upper.length || !lower.length) return '';
  const top = upper.map((p, i) => `${i === 0 ? 'M' : 'L'}${round2(p.x)},${round2(p.y)}`).join(' ');
  const bottom = [...lower]
    .reverse()
    .map((p) => `L${round2(p.x)},${round2(p.y)}`)
    .join(' ');
  return `${top} ${bottom} Z`;
}

/**
 * Bar rectangles for a series of values along a band, baseline at `y0`.
 * @returns {Array<{ x, y, width, height }>}
 */
export function barRects({ values = [], scaleY, x0 = 0, y0, barWidth, gap = 0 }) {
  return values.map((v, i) => {
    const y = scaleY(v);
    return {
      x: round2(x0 + i * (barWidth + gap)),
      y: round2(Math.min(y, y0)),
      width: round2(barWidth),
      height: round2(Math.abs(y0 - y)),
    };
  });
}

/**
 * Radar polygon vertices for `values`, one axis each, starting at 12 o'clock and
 * going clockwise; radius scaled by `maxValue`.
 * @returns {Array<{ x, y }>}
 */
export function radarPolygon({ values = [], cx, cy, radius, maxValue }) {
  const n = values.length;
  return values.map((v, i) => {
    const angle = -Math.PI / 2 + (i / n) * 2 * Math.PI;
    const r = maxValue > 0 ? (Number(v) / maxValue) * radius : 0;
    return { x: round2(cx + r * Math.cos(angle)), y: round2(cy + r * Math.sin(angle)) };
  });
}

/** Axis endpoints for an `count`-spoke radar (same angle convention as the polygon). */
export function radarAxes({ count, cx, cy, radius }) {
  return Array.from({ length: count }, (_, i) => {
    const angle = -Math.PI / 2 + (i / count) * 2 * Math.PI;
    return { x: round2(cx + radius * Math.cos(angle)), y: round2(cy + radius * Math.sin(angle)) };
  });
}

/**
 * Geometry for a circular SVG progress ring (Phase 7, D-8). The ring is drawn as
 * a single `<circle>` whose `stroke-dasharray`/`stroke-dashoffset` reveal a slice
 * of the circumference. `fraction` is clamped to [0, 1] for the *visual* fill so
 * an over-goal value still paints a full ring; `over` reports whether the raw
 * value exceeded `max` so the caller can switch to a danger tone.
 * @returns {{ circumference, dashArray, dashOffset, fraction, over }}
 */
export function gaugeArc({ value, max, radius, strokeWidth = 0 }) {
  const r = Math.max(0, radius - strokeWidth / 2);
  const circumference = 2 * Math.PI * r;
  const safeMax = max > 0 ? max : 0;
  const ratio = safeMax > 0 ? Number(value) / safeMax : 0;
  const fraction = Math.min(1, Math.max(0, ratio));
  const dashOffset = round2(circumference * (1 - fraction));
  return {
    circumference: round2(circumference),
    dashArray: round2(circumference),
    dashOffset,
    fraction: round2(fraction),
    over: Number(value) > safeMax,
  };
}

/**
 * Donut segments (Phase 7, D-8): one slice per value, proportional to its share
 * of the total, starting at 12 o'clock and running clockwise. Each segment is a
 * closed SVG path (outer arc → inner arc → close) drawable with a single `fill`.
 * Zero-total (or empty) input is safe — returns zeroed segments (no NaN).
 * @returns {Array<{ path, fraction, startAngle, endAngle, index }>}
 */
export function donutSegments({ values = [], radius, innerRadius, cx, cy }) {
  const total = values.reduce((sum, v) => sum + Math.max(0, Number(v) || 0), 0);
  let cursor = -Math.PI / 2;
  return values.map((v, index) => {
    const fraction = total > 0 ? Math.max(0, Number(v) || 0) / total : 0;
    const startAngle = cursor;
    const endAngle = startAngle + fraction * 2 * Math.PI;
    cursor = endAngle;
    return {
      path: fraction > 0 ? donutArcPath({ startAngle, endAngle, radius, innerRadius, cx, cy }) : '',
      fraction: round2(fraction),
      startAngle: round2(startAngle),
      endAngle: round2(endAngle),
      index,
    };
  });
}

// A single donut wedge as a closed path: outer arc (start→end, clockwise), line
// in to the inner radius, inner arc back (end→start), close. The `large-arc-flag`
// flips past a half turn.
function donutArcPath({ startAngle, endAngle, radius, innerRadius, cx, cy }) {
  const large = endAngle - startAngle > Math.PI ? 1 : 0;
  const o0 = polar(cx, cy, radius, startAngle);
  const o1 = polar(cx, cy, radius, endAngle);
  const i1 = polar(cx, cy, innerRadius, endAngle);
  const i0 = polar(cx, cy, innerRadius, startAngle);
  return [
    `M${o0.x},${o0.y}`,
    `A${round2(radius)},${round2(radius)} 0 ${large} 1 ${o1.x},${o1.y}`,
    `L${i1.x},${i1.y}`,
    `A${round2(innerRadius)},${round2(innerRadius)} 0 ${large} 0 ${i0.x},${i0.y}`,
    'Z',
  ].join(' ');
}

function polar(cx, cy, r, angle) {
  return { x: round2(cx + r * Math.cos(angle)), y: round2(cy + r * Math.sin(angle)) };
}

/**
 * Lay a calendar month into a 7-column grid (Phase 9, data-model §8) for the
 * recovery energy heatmap. `month` is 1-based (1 = January). `weekStartsOn`
 * picks the leftmost weekday: 1 = Monday (default), 0 = Sunday. Returns one
 * entry per grid cell, including leading/trailing pad cells (`inMonth: false`)
 * so the grid is rectangular. `x`/`y` are derived from `col`/`row` with a unit
 * cell + gap, so the caller can scale them.
 * @returns {Array<{ date: string, row: number, col: number, x: number, y: number, inMonth: boolean }>}
 */
export function calendarMonth({ year, month, weekStartsOn = 1, cellSize = 1, gap = 0 } = {}) {
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  // Weekday (0 = Sun … 6 = Sat) of the first of the month, then shifted so the
  // configured start day maps to column 0.
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const lead = (firstWeekday - weekStartsOn + 7) % 7;

  const totalCells = Math.ceil((lead + daysInMonth) / 7) * 7;
  const step = cellSize + gap;
  const cells = [];
  for (let cell = 0; cell < totalCells; cell += 1) {
    const row = Math.floor(cell / 7);
    const col = cell % 7;
    const dayNum = cell - lead + 1;
    const inMonth = dayNum >= 1 && dayNum <= daysInMonth;
    cells.push({
      date: inMonth ? isoDate(year, month, dayNum) : null,
      row,
      col,
      x: round2(col * step),
      y: round2(row * step),
      inMonth,
    });
  }
  return cells;
}

// `YYYY-MM-DD` for a 1-based month/day (no timezone — pure string math).
function isoDate(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Pixel positions for a scatter plot (Phase 9, data-model §8). Each input
 * datum carries `x`/`y` domain values; `xScale`/`yScale` (reuse `linearScale`)
 * map them to screen space. The original datum is returned under `datum` so the
 * component can wire tooltips/labels without re-joining.
 * @returns {Array<{ cx: number, cy: number, datum: object }>}
 */
export function scatterPoints({ points = [], xScale, yScale }) {
  return points.map((datum) => ({
    cx: round2(xScale(datum.x)),
    cy: round2(yScale(datum.y)),
    datum,
  }));
}

/** A short array of "nice" tick values spanning [min, max]. */
export function niceTicks(min, max, count = 4) {
  if (max <= min) return [min];
  const rawStep = (max - min) / count;
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const norm = rawStep / mag;
  const niceStep = (norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1) * mag;
  const start = Math.ceil(min / niceStep) * niceStep;
  const ticks = [];
  for (let v = start; v <= max + 1e-9; v += niceStep) ticks.push(round2(v));
  return ticks;
}

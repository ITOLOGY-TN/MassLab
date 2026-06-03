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

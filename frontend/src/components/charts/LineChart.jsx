// Phase 5 — bespoke SVG line chart (D-9). Primary line = estimated 1RM (the line
// the projection extends, I1); secondary = working load; dotted = projection;
// dashed horizontal = all-time record. Geometry from the pure chartGeometry lib.
import { linearScale, linePath } from '../../lib/chartGeometry.js';

const W = 320;
const H = 160;
const PAD = 10;

export default function LineChart({ loadSeries = [], projection = null, recordKg = null }) {
  if (!loadSeries.length) return null;
  const e1 = loadSeries.map((p) => p.estimate_1rm_kg);
  const wl = loadSeries.map((p) => p.working_load_kg);
  const projVals = projection?.points?.map((p) => p.estimate_1rm_kg) ?? [];
  const all = [...e1, ...wl, ...projVals, ...(recordKg != null ? [recordKg] : [])].filter(
    (v) => v != null,
  );
  const min = Math.min(...all);
  const max = Math.max(...all);
  const n = loadSeries.length + projVals.length;
  const sx = linearScale({
    domainMin: 0,
    domainMax: Math.max(1, n - 1),
    rangeMin: PAD,
    rangeMax: W - PAD,
  });
  const sy = linearScale({ domainMin: min, domainMax: max, rangeMin: H - PAD, rangeMax: PAD });

  const e1Pts = e1.map((v, i) => ({ x: sx(i), y: sy(v) }));
  const wlPts = wl.map((v, i) => ({ x: sx(i), y: sy(v) }));
  const projLine = projVals.length
    ? [
        { x: sx(loadSeries.length - 1), y: sy(e1[e1.length - 1]) },
        ...projVals.map((v, i) => ({ x: sx(loadSeries.length + i), y: sy(v) })),
      ]
    : [];

  return (
    <svg data-testid="line-chart" viewBox={`0 0 ${W} ${H}`} className="w-full h-40" role="img">
      {recordKg != null && (
        <line
          x1={PAD}
          x2={W - PAD}
          y1={sy(recordKg)}
          y2={sy(recordKg)}
          stroke="rgb(var(--color-warn))"
          strokeDasharray="2 3"
          opacity="0.8"
        />
      )}
      <path
        d={linePath(wlPts)}
        fill="none"
        stroke="rgb(var(--color-muted))"
        strokeWidth="1.5"
        opacity="0.55"
      />
      <path d={linePath(e1Pts)} fill="none" stroke="rgb(var(--color-accent))" strokeWidth="2" />
      {projLine.length > 0 && (
        <path
          d={linePath(projLine)}
          fill="none"
          stroke="rgb(var(--color-accent))"
          strokeWidth="2"
          strokeDasharray="3 3"
          opacity="0.7"
        />
      )}
    </svg>
  );
}

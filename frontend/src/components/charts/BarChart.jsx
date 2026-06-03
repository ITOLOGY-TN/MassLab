// Phase 5 — bespoke SVG bar chart for volume-per-session (D-9). Geometry from the
// pure chartGeometry lib.
import { linearScale, barRects } from '../../lib/chartGeometry.js';

const W = 320;
const H = 120;
const PAD = 8;

export default function BarChart({ values = [] }) {
  if (!values.length) return null;
  const max = Math.max(...values, 1);
  const scaleY = linearScale({ domainMin: 0, domainMax: max, rangeMin: H - PAD, rangeMax: PAD });
  const barWidth = Math.max(2, (W - 2 * PAD) / values.length - 2);
  const rects = barRects({ values, scaleY, x0: PAD, y0: H - PAD, barWidth, gap: 2 });

  return (
    <svg data-testid="bar-chart" viewBox={`0 0 ${W} ${H}`} className="w-full h-32" role="img">
      {rects.map((r, i) => (
        <rect
          key={i}
          x={r.x}
          y={r.y}
          width={r.width}
          height={r.height}
          rx="1"
          fill="rgb(var(--color-accent))"
          opacity="0.7"
        />
      ))}
    </svg>
  );
}

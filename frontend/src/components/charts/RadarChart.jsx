// Phase 5 — bespoke SVG radar comparing average working load per muscle group
// across phases (D-9). Geometry from the pure chartGeometry lib.
import { radarPolygon, radarAxes, linePath } from '../../lib/chartGeometry.js';

const SZ = 260;
const C = SZ / 2;
const R = C - 34;

export default function RadarChart({ axes = [], phases = [] }) {
  if (!axes.length || !phases.length) return null;
  const maxValue = Math.max(
    1,
    ...phases.flatMap((p) => p.values.map((v) => v.avg_working_load_kg)),
  );
  const axisPts = radarAxes({ count: axes.length, cx: C, cy: C, radius: R });

  return (
    <svg
      data-testid="radar-chart"
      viewBox={`0 0 ${SZ} ${SZ}`}
      className="w-full max-w-sm mx-auto"
      role="img"
    >
      {axisPts.map((p, i) => (
        <line
          key={`ax-${i}`}
          x1={C}
          y1={C}
          x2={p.x}
          y2={p.y}
          stroke="rgb(var(--color-muted))"
          opacity="0.3"
        />
      ))}
      {phases.map((ph, pi) => {
        const pts = radarPolygon({
          values: ph.values.map((v) => v.avg_working_load_kg),
          cx: C,
          cy: C,
          radius: R,
          maxValue,
        });
        const color = `hsl(${(pi * 97) % 360} 70% 55%)`;
        return (
          <path
            key={ph.slug}
            d={linePath([...pts, pts[0]])}
            fill={color}
            fillOpacity="0.12"
            stroke={color}
            strokeWidth="2"
          />
        );
      })}
      {axes.map((a, i) => (
        <text
          key={a.name}
          x={axisPts[i].x}
          y={axisPts[i].y}
          fontSize="9"
          fill="rgb(var(--color-muted))"
          textAnchor="middle"
        >
          {a.name}
        </text>
      ))}
    </svg>
  );
}

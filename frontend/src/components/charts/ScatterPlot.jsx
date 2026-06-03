// Phase 9 — bespoke SVG scatter plot (data-model §8) for sleep-vs-performance:
// x = sleep hours, y = training volume (kg). Geometry from the pure chartGeometry
// lib (scatterPoints + linearScale + niceTicks), matching the other charts/*.
import { linearScale, niceTicks, scatterPoints } from '../../lib/chartGeometry.js';

const W = 320;
const H = 200;
// Extra left/bottom padding leaves room for the axis tick labels.
const PAD_L = 34;
const PAD_R = 10;
const PAD_T = 10;
const PAD_B = 24;

export default function ScatterPlot({ points = [], xLabel = '', yLabel = '' }) {
  if (!points.length) return null;

  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const xMin = Math.min(...xs, 0);
  const xMax = Math.max(...xs, 1);
  const yMin = Math.min(...ys, 0);
  const yMax = Math.max(...ys, 1);

  const xScale = linearScale({ domainMin: xMin, domainMax: xMax, rangeMin: PAD_L, rangeMax: W - PAD_R });
  const yScale = linearScale({ domainMin: yMin, domainMax: yMax, rangeMin: H - PAD_B, rangeMax: PAD_T });

  const dots = scatterPoints({ points, xScale, yScale });
  const xTicks = niceTicks(xMin, xMax, 4);
  const yTicks = niceTicks(yMin, yMax, 4);

  return (
    <svg data-testid="scatter-plot" viewBox={`0 0 ${W} ${H}`} className="w-full h-52" role="img">
      {/* y axis grid + ticks */}
      {yTicks.map((t) => (
        <g key={`y-${t}`}>
          <line
            x1={PAD_L}
            x2={W - PAD_R}
            y1={yScale(t)}
            y2={yScale(t)}
            stroke="rgb(var(--color-muted))"
            strokeWidth="0.5"
            opacity="0.25"
          />
          <text
            x={PAD_L - 4}
            y={yScale(t)}
            textAnchor="end"
            dominantBaseline="middle"
            fontSize="7"
            fill="rgb(var(--color-muted))"
          >
            {t}
          </text>
        </g>
      ))}

      {/* x axis ticks */}
      {xTicks.map((t) => (
        <text
          key={`x-${t}`}
          x={xScale(t)}
          y={H - PAD_B + 10}
          textAnchor="middle"
          fontSize="7"
          fill="rgb(var(--color-muted))"
        >
          {t}
        </text>
      ))}

      {/* axes */}
      <line
        x1={PAD_L}
        x2={PAD_L}
        y1={PAD_T}
        y2={H - PAD_B}
        stroke="rgb(var(--color-muted))"
        strokeWidth="1"
        opacity="0.5"
      />
      <line
        x1={PAD_L}
        x2={W - PAD_R}
        y1={H - PAD_B}
        y2={H - PAD_B}
        stroke="rgb(var(--color-muted))"
        strokeWidth="1"
        opacity="0.5"
      />

      {/* points */}
      {dots.map((d, i) => (
        <circle
          key={d.datum.date ?? i}
          cx={d.cx}
          cy={d.cy}
          r="3"
          fill="rgb(var(--color-accent))"
          opacity="0.75"
        >
          <title>{`${d.datum.date ?? ''} · ${d.datum.x} / ${d.datum.y}`}</title>
        </circle>
      ))}

      {/* axis labels */}
      {xLabel && (
        <text
          x={(PAD_L + (W - PAD_R)) / 2}
          y={H - 2}
          textAnchor="middle"
          fontSize="8"
          fill="rgb(var(--color-muted))"
        >
          {xLabel}
        </text>
      )}
      {yLabel && (
        <text
          x={8}
          y={(PAD_T + (H - PAD_B)) / 2}
          textAnchor="middle"
          fontSize="8"
          fill="rgb(var(--color-muted))"
          transform={`rotate(-90 8 ${(PAD_T + (H - PAD_B)) / 2})`}
        >
          {yLabel}
        </text>
      )}
    </svg>
  );
}

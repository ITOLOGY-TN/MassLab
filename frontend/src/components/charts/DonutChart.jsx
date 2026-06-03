// Phase 7 (D-8) — bespoke SVG donut for the macro breakdown (protein / carbs /
// fat share of calories). One wedge per value; zero-total renders an empty track
// (no NaN). Geometry comes from the pure chartGeometry lib. `segments` pairs each
// value with a label/tone for the legend; falls back to `values`.
import { donutSegments } from '../../lib/chartGeometry.js';

const SIZE = 140;
const CENTER = SIZE / 2;
const RADIUS = CENTER - 6;
const INNER_RADIUS = RADIUS - 22;

const DEFAULT_TONES = [
  'rgb(var(--color-success))',
  'rgb(var(--color-warn))',
  'rgb(var(--color-accent))',
  'rgb(var(--color-muted))',
];

export default function DonutChart({ segments = null, values = null }) {
  // Normalise to a list of { value, label, tone } regardless of which prop the
  // caller passes.
  const items = segments
    ? segments.map((s, i) => ({
        value: Number(s.value) || 0,
        label: s.label ?? null,
        tone: s.tone ?? DEFAULT_TONES[i % DEFAULT_TONES.length],
      }))
    : (values ?? []).map((v, i) => ({
        value: Number(v) || 0,
        label: null,
        tone: DEFAULT_TONES[i % DEFAULT_TONES.length],
      }));

  const total = items.reduce((sum, it) => sum + Math.max(0, it.value), 0);
  const slices = donutSegments({
    values: items.map((it) => it.value),
    radius: RADIUS,
    innerRadius: INNER_RADIUS,
    cx: CENTER,
    cy: CENTER,
  });

  return (
    <div data-testid="donut-chart" className="flex items-center gap-lg">
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="h-36 w-36 shrink-0"
        role="img"
        aria-label="Répartition des macronutriments"
      >
        {/* Track ring when there is nothing to show. */}
        {total <= 0 && (
          <circle
            cx={CENTER}
            cy={CENTER}
            r={(RADIUS + INNER_RADIUS) / 2}
            fill="none"
            stroke="rgb(var(--color-muted))"
            strokeWidth={RADIUS - INNER_RADIUS}
            opacity="0.15"
          />
        )}
        {slices.map((s, i) =>
          s.path ? <path key={i} d={s.path} fill={items[i].tone} opacity="0.85" /> : null,
        )}
      </svg>

      {items.some((it) => it.label) && (
        <ul className="flex flex-col gap-xs text-sm">
          {items.map((it, i) => (
            <li key={i} className="flex items-center gap-sm">
              <span
                aria-hidden="true"
                className="inline-block h-3 w-3 rounded-sm"
                style={{ backgroundColor: it.tone }}
              />
              <span className="text-text">{it.label}</span>
              <span className="text-muted">{Math.round((slices[i]?.fraction ?? 0) * 100)} %</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

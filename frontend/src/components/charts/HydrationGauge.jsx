// Phase 7 (D-8) — bespoke SVG circular gauge for daily hydration. The ring fills
// toward the goal; once the goal is met the ring switches to a success tone, and
// an over-goal day keeps the ring full (the visual fraction is clamped in
// gaugeArc). Geometry comes from the pure chartGeometry lib.
import { gaugeArc } from '../../lib/chartGeometry.js';

const SIZE = 120;
const STROKE = 12;
const CENTER = SIZE / 2;
const RADIUS = CENTER - STROKE / 2;

function round(value) {
  if (value == null) return 0;
  return Math.round(Number(value));
}

export default function HydrationGauge({ total_ml = 0, goal_ml = 0 }) {
  const arc = gaugeArc({ value: total_ml, max: goal_ml, radius: RADIUS, strokeWidth: STROKE });
  const reached = goal_ml > 0 && total_ml >= goal_ml;
  const tone = reached ? 'rgb(var(--color-success))' : 'rgb(var(--color-accent))';
  const pct = Math.round(arc.fraction * 100);
  const litres = (round(total_ml) / 1000).toFixed(2);
  const goalLitres = (round(goal_ml) / 1000).toFixed(1);

  return (
    <svg
      data-testid="hydration-gauge"
      data-reached={reached ? 'true' : 'false'}
      data-over={arc.over ? 'true' : 'false'}
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      className="h-32 w-32"
      role="img"
      aria-label={`Hydratation : ${round(total_ml)} ml sur ${round(goal_ml)} ml (${pct} %)`}
    >
      {/* Track */}
      <circle
        cx={CENTER}
        cy={CENTER}
        r={RADIUS}
        fill="none"
        stroke="rgb(var(--color-muted))"
        strokeWidth={STROKE}
        opacity="0.15"
      />
      {/* Progress arc — rotated -90° so it starts at 12 o'clock and runs clockwise. */}
      <circle
        cx={CENTER}
        cy={CENTER}
        r={RADIUS}
        fill="none"
        stroke={tone}
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeDasharray={arc.dashArray}
        strokeDashoffset={arc.dashOffset}
        transform={`rotate(-90 ${CENTER} ${CENTER})`}
        className="transition-all"
      />
      <text
        x={CENTER}
        y={CENTER - 2}
        textAnchor="middle"
        className="fill-text text-base font-semibold"
        style={{ fontSize: '18px' }}
      >
        {litres} L
      </text>
      <text
        x={CENTER}
        y={CENTER + 16}
        textAnchor="middle"
        className="fill-muted"
        style={{ fontSize: '10px' }}
      >
        / {goalLitres} L
      </text>
    </svg>
  );
}

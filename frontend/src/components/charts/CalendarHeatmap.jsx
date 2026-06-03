// Phase 9 (US3) — bespoke SVG monthly energy heatmap. Lays the month into a
// 7-column Monday-start grid via the pure `calendarMonth` geometry, then colors
// each in-month day by its energy (0–10) bucket using Tailwind color tokens.
// Days without a check-in (energy = null) and pad cells stay uncolored, matching
// the existing charts/* conventions (LineChart/DonutChart).
import { calendarMonth } from '../../lib/chartGeometry.js';

const CELL = 14;
const GAP = 3;
const PAD = 4;

// Energy 0–10 → tone bucket (low → high). `null` energy renders uncolored.
const BUCKETS = [
  { max: 2, tone: 'rgb(var(--color-danger))', opacity: 0.85 }, // 0–2
  { max: 4, tone: 'rgb(var(--color-warn))', opacity: 0.8 }, // 3–4
  { max: 6, tone: 'rgb(var(--color-warn))', opacity: 0.45 }, // 5–6
  { max: 8, tone: 'rgb(var(--color-success))', opacity: 0.55 }, // 7–8
  { max: 10, tone: 'rgb(var(--color-success))', opacity: 0.9 }, // 9–10
];

const EMPTY_TONE = 'rgb(var(--color-muted))';

function bucketFor(energy) {
  if (energy == null || Number.isNaN(Number(energy))) return null;
  const e = Number(energy);
  return BUCKETS.find((b) => e <= b.max) ?? BUCKETS[BUCKETS.length - 1];
}

export default function CalendarHeatmap({ year, month, cells = [] }) {
  const grid = calendarMonth({ year, month, weekStartsOn: 1, cellSize: CELL, gap: GAP });
  // Index supplied cells by ISO date so each grid square reads its energy.
  const energyByDate = new Map((cells ?? []).map((c) => [c.date, c.energy]));

  const cols = 7;
  const rows = grid.length ? Math.max(...grid.map((g) => g.row)) + 1 : 0;
  const width = PAD * 2 + cols * CELL + (cols - 1) * GAP;
  const height = PAD * 2 + rows * CELL + (rows - 1) * GAP;

  return (
    <svg
      data-testid="calendar-heatmap"
      viewBox={`0 0 ${width} ${height}`}
      className="w-full max-w-xs"
      role="img"
      aria-label="Carte mensuelle de l'énergie"
    >
      {grid.map((cell) => {
        const energy = cell.inMonth ? energyByDate.get(cell.date) : undefined;
        const bucket = cell.inMonth ? bucketFor(energy) : null;
        return (
          <rect
            key={`${cell.row}-${cell.col}`}
            x={PAD + cell.x}
            y={PAD + cell.y}
            width={CELL}
            height={CELL}
            rx="2"
            fill={bucket ? bucket.tone : EMPTY_TONE}
            opacity={bucket ? bucket.opacity : cell.inMonth ? 0.15 : 0}
          >
            {cell.inMonth && (
              <title>
                {energy == null
                  ? `${cell.date} — pas de suivi`
                  : `${cell.date} — énergie ${energy}/10`}
              </title>
            )}
          </rect>
        );
      })}
    </svg>
  );
}

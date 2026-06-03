import { Fragment } from 'react';

// Phase 9 (012-phase9-recovery-wellbeing) T013 — hand-rolled clickable SVG human
// body for tagging sore muscle zones. Tap a region to toggle it in/out of the
// selected set. The renderable zone list comes from the API's
// `options.sore_zones` (no hardcoded catalogue) — we only draw regions whose key
// the server allows. Large hit targets (Constitution VI), Tailwind tokens only,
// no charting/SVG library. A front + back silhouette covers all 13 muscle groups.

// French labels for every known zone key (a11y + tooltip). Keys that the API does
// not return are simply not rendered, so adding/removing a server zone is safe.
const ZONE_LABELS = {
  neck: 'Cou',
  shoulders: 'Épaules',
  chest: 'Pectoraux',
  upper_back: 'Haut du dos',
  lower_back: 'Bas du dos',
  biceps: 'Biceps',
  triceps: 'Triceps',
  forearms: 'Avant-bras',
  abs: 'Abdominaux',
  glutes: 'Fessiers',
  quads: 'Quadriceps',
  hamstrings: 'Ischio-jambiers',
  calves: 'Mollets',
};

// Anatomical hit regions per silhouette. Each entry is a list of rounded-rect
// shapes (front and back share a coordinate system, 120 wide × 260 tall) so a
// muscle that spans left+right limbs registers a single zone toggle. A transparent
// padded hit-rect (HIT_PAD units) sits behind each visible shape to enlarge the
// tap/focus target toward the 44px guidance without distorting the silhouette
// (Constitution VI — one-handed selection).
const HIT_PAD = 7;

const FRONT_REGIONS = {
  neck: [{ x: 52, y: 24, w: 16, h: 12, rx: 6 }],
  shoulders: [
    { x: 30, y: 38, w: 18, h: 14, rx: 7 },
    { x: 72, y: 38, w: 18, h: 14, rx: 7 },
  ],
  chest: [{ x: 40, y: 52, w: 40, h: 22, rx: 8 }],
  biceps: [
    { x: 26, y: 56, w: 14, h: 26, rx: 7 },
    { x: 80, y: 56, w: 14, h: 26, rx: 7 },
  ],
  abs: [{ x: 44, y: 76, w: 32, h: 34, rx: 8 }],
  forearms: [
    { x: 22, y: 84, w: 13, h: 30, rx: 6 },
    { x: 85, y: 84, w: 13, h: 30, rx: 6 },
  ],
  quads: [
    { x: 40, y: 124, w: 18, h: 48, rx: 9 },
    { x: 62, y: 124, w: 18, h: 48, rx: 9 },
  ],
  calves: [
    { x: 41, y: 186, w: 16, h: 50, rx: 8 },
    { x: 63, y: 186, w: 16, h: 50, rx: 8 },
  ],
};

const BACK_REGIONS = {
  upper_back: [{ x: 40, y: 50, w: 40, h: 30, rx: 8 }],
  triceps: [
    { x: 26, y: 56, w: 14, h: 28, rx: 7 },
    { x: 80, y: 56, w: 14, h: 28, rx: 7 },
  ],
  lower_back: [{ x: 44, y: 82, w: 32, h: 24, rx: 8 }],
  glutes: [{ x: 42, y: 108, w: 36, h: 22, rx: 9 }],
  hamstrings: [
    { x: 40, y: 132, w: 18, h: 48, rx: 9 },
    { x: 62, y: 132, w: 18, h: 48, rx: 9 },
  ],
};

// A faint silhouette so the muscle hit-regions read as a body, not floating boxes.
const SILHOUETTE =
  'M60 16 c8 0 13 6 13 13 c0 5 -2 8 -5 11 c10 2 17 7 19 16 l6 26 c1 5 -1 9 -5 10 ' +
  'c-3 1 -6 -1 -7 -5 l-3 -12 l-2 44 c4 1 6 4 6 9 l3 56 c0 5 -3 8 -7 8 c-4 0 -7 -3 -7 -8 ' +
  'l-4 -50 l-4 50 c0 5 -3 8 -7 8 c-4 0 -7 -3 -7 -8 l3 -56 c0 -5 2 -8 6 -9 l-2 -44 l-3 12 ' +
  'c-1 4 -4 6 -7 5 c-4 -1 -6 -5 -5 -10 l6 -26 c2 -9 9 -14 19 -16 c-3 -3 -5 -6 -5 -11 ' +
  'c0 -7 5 -13 13 -13 z';

function isSelected(selected, zone) {
  if (!selected) return false;
  if (typeof selected.has === 'function') return selected.has(zone);
  return Array.from(selected).includes(zone);
}

function BodySide({ label, regions, allowed, selected, onToggle, disabled }) {
  return (
    <div className="flex flex-col items-center gap-xs">
      <svg
        viewBox="0 0 120 260"
        className="h-72 w-auto select-none"
        role="group"
        aria-label={`Silhouette ${label}`}
      >
        <path
          d={SILHOUETTE}
          fill="rgb(var(--color-muted))"
          opacity="0.12"
          stroke="rgb(var(--color-muted))"
          strokeOpacity="0.25"
          strokeWidth="1"
        />
        {Object.entries(regions)
          .filter(([zone]) => allowed.has(zone))
          .map(([zone, shapes]) => {
            const active = isSelected(selected, zone);
            return (
              <g
                key={zone}
                role="button"
                tabIndex={disabled ? -1 : 0}
                data-zone={zone}
                data-selected={active ? 'true' : 'false'}
                aria-pressed={active}
                aria-label={ZONE_LABELS[zone] ?? zone}
                aria-disabled={disabled ? 'true' : undefined}
                onClick={disabled ? undefined : () => onToggle(zone)}
                onKeyDown={
                  disabled
                    ? undefined
                    : (event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          onToggle(zone);
                        }
                      }
                }
                className={`outline-none transition-colors ${
                  disabled
                    ? 'cursor-not-allowed'
                    : 'cursor-pointer focus-visible:[&>rect]:stroke-accent'
                }`}
              >
                <title>{ZONE_LABELS[zone] ?? zone}</title>
                {shapes.map((s, i) => (
                  <Fragment key={i}>
                    {/* Transparent padded hit area — enlarges the tap/focus target
                        without changing the visible silhouette (Constitution VI). */}
                    <rect
                      x={s.x - HIT_PAD}
                      y={s.y - HIT_PAD}
                      width={s.w + HIT_PAD * 2}
                      height={s.h + HIT_PAD * 2}
                      rx={s.rx + HIT_PAD}
                      fill="transparent"
                    />
                    <rect
                      x={s.x}
                      y={s.y}
                      width={s.w}
                      height={s.h}
                      rx={s.rx}
                      className="transition-all"
                      fill={
                        active
                          ? 'rgb(var(--color-accent))'
                          : 'rgb(var(--color-surface))'
                      }
                      fillOpacity={active ? 0.9 : disabled ? 0.4 : 0.75}
                      stroke={
                        active
                          ? 'rgb(var(--color-accent))'
                          : 'rgb(var(--color-muted))'
                      }
                      strokeOpacity={active ? 1 : 0.5}
                      strokeWidth={active ? 2 : 1}
                    />
                  </Fragment>
                ))}
              </g>
            );
          })}
      </svg>
      <span className="text-xs font-medium uppercase tracking-wide text-muted">
        {label}
      </span>
    </div>
  );
}

export default function BodyDiagram({
  zones = [],
  selected,
  onToggle,
  disabled = false,
}) {
  const allowed = new Set(zones);

  return (
    <div
      data-testid="body-diagram"
      data-disabled={disabled ? 'true' : 'false'}
      className="rounded-lg border border-surface bg-surface/30 p-md"
    >
      <div className="flex flex-wrap items-start justify-center gap-lg">
        <BodySide
          label="Avant"
          regions={FRONT_REGIONS}
          allowed={allowed}
          selected={selected}
          onToggle={onToggle}
          disabled={disabled}
        />
        <BodySide
          label="Arrière"
          regions={BACK_REGIONS}
          allowed={allowed}
          selected={selected}
          onToggle={onToggle}
          disabled={disabled}
        />
      </div>
      <p className="mt-sm text-center text-xs text-muted">
        Touchez une zone musculaire pour signaler une courbature
      </p>
    </div>
  );
}

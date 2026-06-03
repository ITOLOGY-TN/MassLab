// Phase 10 (013-phase10-dashboard) T024 — a single quick-metric tile, reused ×4 on the
// dashboard home for weight, calories, the session streak, and the current training phase.
// Pure presentation: the parent (DashboardHome) maps each `metrics.*` sub-object from
// GET /api/v1/dashboard into these props. When the source sub-object is `null` (cold-start,
// FR-018) the parent passes `empty` and the tile renders its designed empty state without
// error.
//
// Design tokens only (shared `--color-*` / `--space-*` / `--radius-*` seam, like ResultCard
// and RecoveryAlerts) — no hardcoded palette. The optional delta / over-under indicator is
// tone-coded: `up` → success, `down` → danger, `neutral`/over-under context → muted. The
// caller decides which direction is "good" (e.g. a calorie surplus vs. a weight gain), so
// `tone` is an explicit prop rather than inferred from the sign.

// Delta tone → Tailwind classes on the shared tokens. `over`/`under` reuse the same tones
// (a budget overage reads like a positive/danger signal depending on caller intent).
const TONE_CLASS = {
  up: 'text-success',
  down: 'text-danger',
  over: 'text-danger',
  under: 'text-success',
  neutral: 'text-muted',
};

const TONE_ARROW = {
  up: '▲',
  down: '▼',
  over: '▲',
  under: '▼',
  neutral: '•',
};

export default function MetricCard({
  label,
  value,
  unit,
  delta,
  deltaTone = 'neutral',
  hint,
  empty = false,
  emptyText = 'Pas encore de données',
  testId,
}) {
  return (
    <article
      data-testid={testId ?? 'metric-card'}
      data-empty={empty ? 'true' : 'false'}
      className="bg-surface rounded-lg p-lg shadow-md flex flex-col gap-xs"
    >
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</h3>

      {empty ? (
        <p className="mt-xs text-sm text-muted">{emptyText}</p>
      ) : (
        <>
          <div className="flex items-baseline gap-xs">
            <span className="text-2xl font-semibold text-text tabular-nums">{value}</span>
            {unit ? <span className="text-sm text-muted">{unit}</span> : null}
          </div>

          {delta != null && delta !== '' ? (
            <p
              data-testid="metric-delta"
              data-tone={deltaTone}
              className={`flex items-center gap-xs text-sm font-medium ${
                TONE_CLASS[deltaTone] ?? TONE_CLASS.neutral
              }`}
            >
              <span aria-hidden="true" className="text-[10px] leading-none">
                {TONE_ARROW[deltaTone] ?? TONE_ARROW.neutral}
              </span>
              <span>{delta}</span>
            </p>
          ) : null}

          {hint ? <p className="text-xs text-muted">{hint}</p> : null}
        </>
      )}
    </article>
  );
}

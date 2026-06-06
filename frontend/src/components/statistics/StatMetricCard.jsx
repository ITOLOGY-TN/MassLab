// Phase 11 (014-phase11-statistics) US1 — a single headline metric tile, reused on the
// statistics header region for the four lifetime metrics (total weight gained, total
// volume, session-completion rate, avg weekly calories). Pure presentation: the parent
// (StatisticsHome) maps each `metrics.*` value into these props and passes `empty` when
// the value is null (cold-start, data-model §4) so the tile renders its designed empty
// state without error.
//
// Design tokens only (shared `bg-surface` / `text-muted` / `text-accent` / spacing seam,
// like MetricCard and StatisticsHome) — no hardcoded palette.

export default function StatMetricCard({ label, value, unit, empty = false }) {
  const isEmpty = empty || value == null;
  return (
    <article
      data-testid="stat-metric-card"
      data-empty={isEmpty ? 'true' : 'false'}
      className="flex flex-col gap-xs rounded-lg border border-muted/20 bg-surface p-lg shadow-sm"
    >
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</h3>

      {isEmpty ? (
        <p
          className="mt-xs text-2xl font-semibold text-muted tabular-nums"
          aria-label="Pas encore de données"
        >
          —
        </p>
      ) : (
        <div className="flex items-baseline gap-xs">
          <span className="text-2xl font-semibold text-accent tabular-nums">{value}</span>
          {unit ? <span className="text-sm text-muted">{unit}</span> : null}
        </div>
      )}
    </article>
  );
}

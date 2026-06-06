// Phase 11 (US3) — Nutrition tab. Renders per-ISO-week calorie totals as a line chart
// with the weekly target as the dashed reference line. Reuses the shared SVG LineChart
// (whose series shape uses estimate_1rm_kg / working_load_kg keys, repurposed here for
// the weekly kcal value) — no new chart geometry.
import LineChart from '../../../components/charts/LineChart.jsx';

// A titled card section — mirrors RecoveryTrends' Panel so every tab reads as a
// stack of bordered chart panels with a consistent header + optional subtitle.
function Panel({ title, subtitle, children }) {
  return (
    <section className="rounded-lg border border-surface bg-surface/40 p-lg shadow-sm">
      <h2 className="text-base font-semibold text-text">{title}</h2>
      {subtitle ? (
        <p className="mb-md mt-xs text-xs text-muted">{subtitle}</p>
      ) : (
        <div className="mb-md" />
      )}
      {children}
    </section>
  );
}

export default function NutritionTab({ nutrition }) {
  const { weekly = [], weekly_target_kcal = null } = nutrition ?? {};

  if (!weekly.length) {
    return (
      <div data-testid="nutrition-tab">
        <Panel title="Calories hebdomadaires" subtitle="Total des calories logées par semaine.">
          <p className="rounded-lg border border-dashed border-muted/25 bg-surface/30 p-md text-sm text-muted">
            Aucune calorie enregistrée pour l’instant.
          </p>
        </Panel>
      </div>
    );
  }

  const loadSeries = weekly.map((w) => ({
    estimate_1rm_kg: w.kcal,
    working_load_kg: w.kcal,
  }));

  return (
    <div data-testid="nutrition-tab">
      <Panel
        title="Calories hebdomadaires"
        subtitle="Total des calories logées par semaine (vs objectif)."
      >
        {weekly_target_kcal != null ? (
          <div className="mb-xs flex items-center gap-xs text-xs text-muted">
            <span aria-hidden="true" className="inline-block h-px w-4 bg-warn" />
            Objectif {Math.round(weekly_target_kcal).toLocaleString('fr-FR')} kcal / sem.
          </div>
        ) : null}
        <LineChart loadSeries={loadSeries} recordKg={weekly_target_kcal} />
      </Panel>
    </div>
  );
}

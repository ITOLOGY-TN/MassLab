// Phase 11 (US2) — Body tab. Renders the body-weight curve (with the goal as the dashed
// reference line) plus one line chart per circumference measurement that has data. Reuses
// the shared SVG LineChart (whose series shape uses estimate_1rm_kg / working_load_kg keys,
// repurposed here for the body-weight / measurement value) — no new chart geometry.
import LineChart from '../../../components/charts/LineChart.jsx';

function toLoadSeries(points, valueKey) {
  return points.map((p) => ({
    estimate_1rm_kg: p[valueKey],
    working_load_kg: p[valueKey],
  }));
}

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

function EmptyNote({ children }) {
  return (
    <p className="rounded-lg border border-dashed border-muted/25 bg-surface/30 p-md text-sm text-muted">
      {children}
    </p>
  );
}

export default function BodyTab({ body }) {
  const { weight = { points: [], goal_kg: null, has_data: false }, measurements = [] } = body ?? {};

  return (
    <div data-testid="body-tab" className="flex flex-col gap-lg">
      <Panel
        title="Poids corporel"
        subtitle={weight.has_data ? 'Évolution du poids (vs objectif).' : undefined}
      >
        {weight.has_data ? (
          <LineChart
            loadSeries={toLoadSeries(weight.points, 'weight_kg')}
            recordKg={weight.goal_kg}
          />
        ) : (
          <EmptyNote>Aucun poids enregistré pour l’instant.</EmptyNote>
        )}
      </Panel>

      <Panel title="Mensurations" subtitle="Tour de chaque zone au fil du temps.">
        {measurements.length ? (
          <div className="flex flex-col gap-lg">
            {measurements.map((m) => (
              <div key={m.key} className="flex flex-col gap-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                  {m.label} ({m.unit})
                </p>
                <LineChart loadSeries={toLoadSeries(m.points, 'value')} />
              </div>
            ))}
          </div>
        ) : (
          <EmptyNote>Aucune mensuration enregistrée pour l’instant.</EmptyNote>
        )}
      </Panel>
    </div>
  );
}

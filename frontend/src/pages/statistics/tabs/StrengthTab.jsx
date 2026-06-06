// Phase 11 (US2) — Strength tab. Renders the top working-weight progressions (one line
// chart each), weekly training volume (bar chart), and the per-muscle-group progress radar.
// Reuses the shared Phase 5 SVG charts — no new chart geometry. The LineChart series shape
// (estimate_1rm_kg / working_load_kg) is repurposed for the working-weight value.
import LineChart from '../../../components/charts/LineChart.jsx';
import BarChart from '../../../components/charts/BarChart.jsx';
import RadarChart from '../../../components/charts/RadarChart.jsx';

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

export default function StrengthTab({ strength }) {
  const {
    top_progressions = [],
    weekly_volume = [],
    muscle_radar = { axes: [], values: [] },
  } = strength ?? {};

  const radarAxes = muscle_radar.axes.map((a) => ({ name: a.muscle_group }));
  const radarPhases = muscle_radar.axes.length
    ? [
        {
          slug: 'progress',
          values: muscle_radar.axes.map((a, i) => ({
            muscle_group: a.muscle_group,
            avg_working_load_kg: muscle_radar.values[i],
          })),
        },
      ]
    : [];

  return (
    <div data-testid="strength-tab" className="flex flex-col gap-lg">
      <Panel title="Meilleures progressions" subtitle="Charge de travail au fil des séances.">
        {top_progressions.length ? (
          <div className="flex flex-col gap-lg">
            {top_progressions.map((p) => (
              <div key={p.exercise_id} className="flex flex-col gap-sm">
                <p className="flex items-baseline justify-between gap-md text-sm">
                  <span className="font-medium text-text">{p.name}</span>
                  <span className="text-xs font-semibold text-accent tabular-nums">
                    +{p.gain_kg} kg
                  </span>
                </p>
                <LineChart
                  loadSeries={p.series.map((s) => ({
                    estimate_1rm_kg: s.working_weight_kg,
                    working_load_kg: s.working_weight_kg,
                  }))}
                />
              </div>
            ))}
          </div>
        ) : (
          <EmptyNote>Pas encore assez de données de charge.</EmptyNote>
        )}
      </Panel>

      <Panel title="Volume hebdomadaire" subtitle="Tonnage total soulevé par semaine.">
        {weekly_volume.length ? (
          <BarChart values={weekly_volume.map((w) => w.volume_kg)} />
        ) : (
          <EmptyNote>Aucun volume enregistré pour l’instant.</EmptyNote>
        )}
      </Panel>

      <Panel
        title="Progression par groupe musculaire"
        subtitle="Charge moyenne par groupe — plus l’aire est large, plus le groupe progresse."
      >
        {radarAxes.length ? (
          <RadarChart axes={radarAxes} phases={radarPhases} />
        ) : (
          <EmptyNote>Aucun groupe musculaire à afficher.</EmptyNote>
        )}
      </Panel>
    </div>
  );
}

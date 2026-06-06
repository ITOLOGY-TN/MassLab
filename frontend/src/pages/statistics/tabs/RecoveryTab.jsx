// Phase 11 (US3) — Recovery tab. Renders the sleep-hours trend (shared LineChart) and the
// stress-vs-weight correlation scatter (shared ScatterPlot). The scatter only draws when
// enough paired points exist (`sufficient`); otherwise an insufficient-data note shows.
import LineChart from '../../../components/charts/LineChart.jsx';
import ScatterPlot from '../../../components/charts/ScatterPlot.jsx';

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

export default function RecoveryTab({ recovery }) {
  const {
    sleep = { points: [], average_hours: null },
    stress_weight = { points: [], sufficient: false },
  } = recovery ?? {};

  if (!sleep.points.length) {
    return (
      <div data-testid="recovery-tab">
        <Panel title="Récupération" subtitle="Sommeil et stress au fil du temps.">
          <p className="rounded-lg border border-dashed border-muted/25 bg-surface/30 p-md text-sm text-muted">
            Aucune donnée de récupération pour l’instant.
          </p>
        </Panel>
      </div>
    );
  }

  const sleepSeries = sleep.points.map((p) => ({
    estimate_1rm_kg: p.hours,
    working_load_kg: p.hours,
  }));

  const scatterPoints = stress_weight.points.map((p) => ({
    x: p.weight_kg,
    y: p.stress,
    date: p.date,
  }));

  return (
    <div data-testid="recovery-tab" className="flex flex-col gap-lg">
      <Panel
        title="Sommeil"
        subtitle={
          sleep.average_hours != null
            ? `Heures de sommeil — moyenne ${sleep.average_hours} h.`
            : 'Heures de sommeil au fil du temps.'
        }
      >
        <LineChart loadSeries={sleepSeries} />
      </Panel>

      <Panel title="Stress vs poids" subtitle="Chaque point = un jour avec poids et stress notés.">
        {stress_weight.sufficient ? (
          <ScatterPlot points={scatterPoints} xLabel="Poids (kg)" yLabel="Stress" />
        ) : (
          <p
            data-testid="stress-weight-insufficient"
            className="rounded-lg border border-dashed border-muted/25 bg-surface/30 p-md text-sm text-muted"
          >
            Pas assez de données appariées pour la corrélation.
          </p>
        )}
      </Panel>
    </div>
  );
}

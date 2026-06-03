// Phase 8 (011-phase8-supplements) T037 — the self-assessment trend. Each of the
// four dimensions (energy, recovery, sleep quality, strength) is plotted over the
// recorded weeks, reusing the Phase 5 bespoke SVG LineChart (no charting library).
// Degrades gracefully to a French low/no-data state (FR-016).
import { useCallback, useEffect, useState } from 'react';
import { getAssessments } from '../../lib/supplementsApi.js';
import StateBlock from '../../components/StateBlock.jsx';
import LineChart from '../../components/charts/LineChart.jsx';

const DIMENSIONS = [
  { key: 'energy', label: 'Énergie' },
  { key: 'recovery', label: 'Récupération' },
  { key: 'sleep_quality', label: 'Sommeil' },
  { key: 'strength', label: 'Force' },
];

function Panel({ title, children }) {
  return (
    <section
      data-testid="trend-panel"
      className="rounded-lg border border-surface bg-surface/40 p-lg shadow-sm"
    >
      <h2 className="mb-md text-base font-semibold text-text">{title}</h2>
      {children}
    </section>
  );
}

// Map a dimension's weekly ratings onto the LineChart's series shape. The working-
// load (secondary) line tracks the same value so it stays quietly behind the primary.
function DimensionPanel({ label, trend, dimKey }) {
  const series = trend.map((w) => ({
    estimate_1rm_kg: w[dimKey],
    working_load_kg: w[dimKey],
  }));
  return (
    <Panel title={label}>
      <LineChart loadSeries={series} />
      <div className="mt-sm flex items-center justify-between text-xs text-muted">
        <span>sem. du {trend[0]?.week_start}</span>
        <span>
          Actuel <span className="font-medium text-accent">{trend[trend.length - 1]?.[dimKey]}/5</span>
        </span>
        <span>{trend[trend.length - 1]?.week_start}</span>
      </div>
    </Panel>
  );
}

export default function SupplementsTrends() {
  const [state, setState] = useState({ status: 'loading', data: null });

  const load = useCallback(async () => {
    setState({ status: 'loading', data: null });
    try {
      const data = await getAssessments();
      setState({ status: 'ready', data });
    } catch {
      setState({ status: 'error', data: null });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const trend = state.data?.trend ?? [];
  const hasData = trend.length > 0;

  return (
    <main className="mx-auto max-w-2xl px-lg py-lg">
      <header className="mb-lg">
        <p className="mb-xs text-sm text-muted">MassLab · Suppléments</p>
        <h1 className="text-2xl font-semibold text-text">Tendances</h1>
        <p className="mt-xs text-muted">Énergie, récupération, sommeil et force au fil des semaines.</p>
      </header>

      {state.status === 'loading' && <StateBlock kind="loading" />}
      {state.status === 'error' && (
        <StateBlock kind="error" title="Erreur" message="Impossible de charger les tendances." />
      )}

      {state.status === 'ready' &&
        (hasData ? (
          <div className="flex flex-col gap-lg">
            {DIMENSIONS.map((d) => (
              <DimensionPanel key={d.key} label={d.label} dimKey={d.key} trend={trend} />
            ))}
          </div>
        ) : (
          <StateBlock
            kind="empty"
            title="Pas encore de données"
            message="Enregistre une auto-évaluation hebdomadaire pour voir tes tendances."
          />
        ))}
    </main>
  );
}

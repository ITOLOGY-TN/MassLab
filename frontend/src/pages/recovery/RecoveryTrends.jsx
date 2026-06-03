// Phase 9 (012-phase9-recovery-wellbeing) T038/T031 — the monthly recovery trends:
//   • an energy heatmap (CalendarHeatmap) over the selected month,
//   • a sleep-vs-performance scatter (ScatterPlot, x = sleep hours, y = volume kg),
//   • a 30-day energy/stress/sleep overlay — energy + stress share the bespoke 0–10
//     axis (left), sleep hours are plotted against a secondary right-hand axis so its
//     scale stays honest (data-model §8).
// Loads via recoveryApi.getTrends; each chart degrades to a French empty/low-data
// state driven by the per-chart `has_data` flags (FR-013/FR-014/FR-016, SC-009).
// Mirrors pages/supplements/SupplementsTrends.jsx.
import { useCallback, useEffect, useState } from 'react';
import { getTrends } from '../../lib/recoveryApi.js';
import StateBlock from '../../components/StateBlock.jsx';
import CalendarHeatmap from '../../components/charts/CalendarHeatmap.jsx';
import ScatterPlot from '../../components/charts/ScatterPlot.jsx';
import LineChart from '../../components/charts/LineChart.jsx';

function Panel({ title, subtitle, children }) {
  return (
    <section
      data-testid="trend-panel"
      className="rounded-lg border border-surface bg-surface/40 p-lg shadow-sm"
    >
      <h2 className="text-base font-semibold text-text">{title}</h2>
      {subtitle && <p className="mb-md mt-xs text-xs text-muted">{subtitle}</p>}
      {!subtitle && <div className="mb-md" />}
      {children}
    </section>
  );
}

// Energy heatmap — one colored square per calendar day; un-logged days stay uncolored.
function HeatmapPanel({ heatmap }) {
  return (
    <Panel
      title="Énergie du mois"
      subtitle="Une case par jour · plus la couleur est vive, plus l'énergie est haute."
    >
      {heatmap.has_data ? (
        <CalendarHeatmap year={heatmap.year} month={heatmap.month} cells={heatmap.cells} />
      ) : (
        <StateBlock
          kind="empty"
          title="Aucun suivi ce mois-ci"
          message="Remplis ton check-in quotidien pour colorer la carte d'énergie."
        />
      )}
    </Panel>
  );
}

// Sleep-vs-performance scatter — ScatterPlot wants { x, y } points; map sleep→x, volume→y.
function ScatterPanel({ scatter }) {
  const points = (scatter.points ?? []).map((p) => ({
    x: p.sleep_hours,
    y: p.volume_kg,
    date: p.date,
  }));
  return (
    <Panel
      title="Sommeil & performance"
      subtitle="Chaque point = un jour avec sommeil noté et séance terminée."
    >
      {scatter.has_data && points.length ? (
        <ScatterPlot points={points} xLabel="Sommeil (h)" yLabel="Volume (kg)" />
      ) : (
        <StateBlock
          kind="empty"
          title="Pas encore assez de données"
          message="Note ton sommeil et termine des séances pour comparer sommeil et performance."
        />
      )}
    </Panel>
  );
}

// Map an aligned numeric overlay array onto the LineChart series shape. Gaps are null
// and are passed through so the bespoke line skips them (never drawn as 0).
function toSeries(primary, secondary) {
  return primary.map((v, i) => ({
    estimate_1rm_kg: v,
    working_load_kg: secondary?.[i] ?? null,
  }));
}

// 30-day overlay — energy (primary) + stress (secondary) share the 0–10 axis via the
// bespoke LineChart; sleep hours ride a separate right-hand axis (its own LineChart so
// the hours scale stays honest, data-model §8).
function OverlayPanel({ overlap }) {
  return (
    <Panel
      title="30 derniers jours"
      subtitle="Énergie et stress sur l'axe 0–10 ; sommeil (heures) sur l'axe de droite."
    >
      {overlap.has_data ? (
        <div className="flex flex-col gap-md">
          <div>
            <div className="mb-xs flex items-center gap-md text-xs text-muted">
              <span className="text-accent">● Énergie</span>
              <span>● Stress</span>
            </div>
            <LineChart loadSeries={toSeries(overlap.energy, overlap.stress)} />
          </div>
          <div>
            <div className="mb-xs flex items-center gap-md text-xs text-muted">
              <span>Sommeil (h) — axe de droite</span>
            </div>
            <LineChart loadSeries={toSeries(overlap.sleep, overlap.sleep)} />
          </div>
        </div>
      ) : (
        <StateBlock
          kind="empty"
          title="Pas encore de tendance"
          message="Quelques jours de check-in suffisent à tracer énergie, stress et sommeil."
        />
      )}
    </Panel>
  );
}

export default function RecoveryTrends() {
  const [state, setState] = useState({ status: 'loading', data: null });

  const load = useCallback(async () => {
    setState({ status: 'loading', data: null });
    try {
      const data = await getTrends();
      setState({ status: 'ready', data });
    } catch {
      setState({ status: 'error', data: null });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const heatmap = state.data?.heatmap ?? { has_data: false, cells: [] };
  const scatter = state.data?.scatter ?? { has_data: false, points: [] };
  const overlap = state.data?.overlap ?? {
    has_data: false,
    days: [],
    energy: [],
    stress: [],
    sleep: [],
  };

  return (
    <main className="mx-auto max-w-2xl px-lg py-lg">
      <header className="mb-lg">
        <p className="mb-xs text-sm text-muted">MassLab · Récupération</p>
        <h1 className="text-2xl font-semibold text-text">Tendances</h1>
        <p className="mt-xs text-muted">
          Énergie, sommeil et stress au fil du mois — et leur lien avec tes séances.
        </p>
      </header>

      {state.status === 'loading' && <StateBlock kind="loading" />}
      {state.status === 'error' && (
        <StateBlock kind="error" title="Erreur" message="Impossible de charger les tendances." />
      )}

      {state.status === 'ready' && (
        <div className="flex flex-col gap-lg">
          <HeatmapPanel heatmap={heatmap} />
          <ScatterPanel scatter={scatter} />
          <OverlayPanel overlap={overlap} />
        </div>
      )}
    </main>
  );
}

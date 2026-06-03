// Phase 5 (008-load-tracking) US3 — phase-comparison radar: average working load
// per muscle group, one series per training phase. FR-017..FR-020.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchPhaseComparison } from '../../lib/loadTrackingApi.js';
import RadarChart from '../../components/charts/RadarChart.jsx';
import StateBlock from '../../components/StateBlock.jsx';

export default function PhaseComparison() {
  const [state, setState] = useState({ status: 'loading', data: null });

  useEffect(() => {
    let active = true;
    fetchPhaseComparison()
      .then((data) => active && setState({ status: 'ready', data }))
      .catch(() => active && setState({ status: 'error', data: null }));
    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="mx-auto max-w-2xl px-lg py-xl">
      <Link to="/load-tracking" className="text-sm text-accent hover:underline">
        ← Charges
      </Link>
      <h1 className="my-md text-xl font-bold text-text">Comparaison des phases</h1>

      {state.status === 'loading' && <StateBlock kind="loading" />}
      {state.status === 'error' && (
        <StateBlock kind="error" title="Erreur" message="Réessayez plus tard." />
      )}

      {state.status === 'ready' && state.data.empty && (
        <StateBlock
          kind="empty"
          title="Pas assez de phases"
          message="Au moins deux phases avec des séances sont nécessaires pour comparer."
        />
      )}

      {state.status === 'ready' && !state.data.empty && (
        <>
          <RadarChart axes={state.data.muscle_groups} phases={state.data.phases} />
          <ul data-testid="phase-legend" className="mt-md flex flex-wrap gap-md text-sm">
            {state.data.phases.map((ph, i) => (
              <li key={ph.slug} className="flex items-center gap-xs">
                <span
                  aria-hidden="true"
                  className="inline-block h-3 w-3 rounded-sm"
                  style={{ backgroundColor: `hsl(${(i * 97) % 360} 70% 55%)` }}
                />
                {ph.name}
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}

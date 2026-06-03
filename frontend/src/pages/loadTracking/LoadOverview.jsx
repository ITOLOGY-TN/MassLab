// Phase 5 (008-load-tracking) US1 — progression overview. One row per exercise:
// current load, all-time record, last-session volume, trend, and a four-state
// status badge; plus muscle-group deload notices. FR-001..FR-010.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchOverview } from '../../lib/loadTrackingApi.js';
import StateBlock from '../../components/StateBlock.jsx';

const STATUS_LABEL = {
  ready_to_increase: 'Ajouter',
  maintain: 'Maintenir',
  stagnation: 'Stagnation',
  regressing: 'Régression',
};
const STATUS_CLASS = {
  ready_to_increase: 'bg-success/15 text-success',
  maintain: 'bg-muted/15 text-muted',
  stagnation: 'bg-warn/15 text-warn',
  regressing: 'bg-danger/15 text-danger',
};

function StatusBadge({ status, increment }) {
  return (
    <span
      data-testid="status-badge"
      data-status={status}
      className={`rounded px-sm py-px text-xs font-semibold ${STATUS_CLASS[status] ?? 'bg-muted/15 text-muted'}`}
    >
      {STATUS_LABEL[status] ?? status}
      {status === 'ready_to_increase' && increment != null ? ` +${increment} kg` : ''}
    </span>
  );
}

function trendGlyph(trend) {
  if (!trend) return '—';
  if (trend.direction === 'up') return `↑ ${trend.change_pct}%`;
  if (trend.direction === 'down') return `↓ ${trend.change_pct}%`;
  return '→';
}

export default function LoadOverview() {
  const [state, setState] = useState({ status: 'loading', data: null });

  useEffect(() => {
    let active = true;
    fetchOverview()
      .then((data) => active && setState({ status: 'ready', data }))
      .catch(() => active && setState({ status: 'error', data: null }));
    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="mx-auto max-w-3xl px-lg py-xl">
      <h1 className="mb-lg text-xl font-bold text-text">Charges &amp; progression</h1>

      {state.status === 'loading' && <StateBlock kind="loading" />}
      {state.status === 'error' && (
        <StateBlock kind="error" title="Erreur" message="Impossible de charger les charges." />
      )}

      {state.status === 'ready' && state.data.empty && (
        <StateBlock
          kind="empty"
          title="Pas encore de données"
          message="Terminez quelques séances pour voir vos charges et votre progression."
        />
      )}

      {state.status === 'ready' && !state.data.empty && (
        <>
          {state.data.deload_notices.length > 0 && (
            <div
              data-testid="deload-notices"
              className="mb-md rounded-lg border border-warn/40 bg-warn/5 px-lg py-md text-sm"
            >
              <span className="font-semibold text-warn">Deload suggéré :</span>{' '}
              {state.data.deload_notices.map((d) => d.name).join(', ')}
            </div>
          )}

          <div className="overflow-x-auto rounded-lg border border-muted/20">
            <table className="w-full text-sm">
              <thead className="bg-surface text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-md py-sm">Exercice</th>
                  <th className="px-md py-sm">Charge</th>
                  <th className="px-md py-sm">Record</th>
                  <th className="px-md py-sm">Volume</th>
                  <th className="px-md py-sm">Tendance</th>
                  <th className="px-md py-sm">Statut</th>
                </tr>
              </thead>
              <tbody>
                {state.data.exercises.map((ex) => (
                  <tr key={ex.exercise_id} className="border-t border-muted/10 hover:bg-surface/60">
                    <td className="px-md py-sm">
                      <Link
                        to={`/load-tracking/exercises/${ex.exercise_id}`}
                        className="text-accent hover:underline"
                      >
                        {ex.name}
                      </Link>
                      {!ex.is_active && <span className="ml-sm text-xs text-muted">archivé</span>}
                    </td>
                    <td className="px-md py-sm">
                      {ex.current_load_kg != null ? `${ex.current_load_kg} kg` : '—'}
                    </td>
                    <td className="px-md py-sm">
                      {ex.all_time_record_kg != null ? `${ex.all_time_record_kg} kg` : '—'}
                    </td>
                    <td className="px-md py-sm">
                      {ex.last_session_volume_kg != null ? `${ex.last_session_volume_kg} kg` : '—'}
                    </td>
                    <td className="px-md py-sm text-muted">{trendGlyph(ex.trend)}</td>
                    <td className="px-md py-sm">
                      <StatusBadge status={ex.status} increment={ex.status_increment_kg} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Link
            to="/load-tracking/phases"
            className="mt-lg inline-block text-sm text-accent hover:underline"
          >
            Comparer les phases →
          </Link>
        </>
      )}
    </main>
  );
}

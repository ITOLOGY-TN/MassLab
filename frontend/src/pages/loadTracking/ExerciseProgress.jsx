// Phase 5 (008-load-tracking) US2 — per-exercise progression detail: estimated-1RM
// line (record annotation + dotted projection), volume-per-session bars, last-10
// table, current 1RM. FR-011..FR-016.
import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { fetchExerciseProgress } from '../../lib/loadTrackingApi.js';
import LineChart from '../../components/charts/LineChart.jsx';
import BarChart from '../../components/charts/BarChart.jsx';
import StateBlock from '../../components/StateBlock.jsx';

function Section({ title, children }) {
  return (
    <section className="mb-lg">
      <h2 className="mb-sm text-sm font-semibold uppercase tracking-wide text-muted">{title}</h2>
      {children}
    </section>
  );
}

export default function ExerciseProgress() {
  const { id } = useParams();
  const [state, setState] = useState({ status: 'loading', data: null });

  useEffect(() => {
    let active = true;
    setState({ status: 'loading', data: null });
    fetchExerciseProgress(id)
      .then((data) => active && setState({ status: 'ready', data }))
      .catch(
        (err) =>
          active && setState({ status: err?.status === 404 ? 'notfound' : 'error', data: null }),
      );
    return () => {
      active = false;
    };
  }, [id]);

  const d = state.data;
  const hasHistory = d && d.load_series.length > 0;

  return (
    <main className="mx-auto max-w-2xl px-lg py-xl">
      <Link to="/load-tracking" className="text-sm text-accent hover:underline">
        ← Charges
      </Link>

      {state.status === 'loading' && <StateBlock kind="loading" />}
      {state.status === 'error' && (
        <StateBlock kind="error" title="Erreur" message="Réessayez plus tard." />
      )}
      {state.status === 'notfound' && (
        <StateBlock kind="error" title="Introuvable" message="Cet exercice n'existe pas." />
      )}

      {state.status === 'ready' && (
        <>
          <header className="my-md flex items-baseline justify-between">
            <h1 className="text-xl font-bold text-text">{d.name}</h1>
            <div className="text-right text-sm">
              <div className="text-accent">
                1RM {d.current_estimate_1rm_kg != null ? `${d.current_estimate_1rm_kg} kg` : '—'}
              </div>
              <div className="text-muted">
                Record {d.all_time_record_kg != null ? `${d.all_time_record_kg} kg` : '—'}
              </div>
            </div>
          </header>

          {!hasHistory ? (
            <StateBlock
              kind="empty"
              title="Pas encore de données"
              message="Terminez des séances avec cet exercice pour voir sa progression."
            />
          ) : (
            <>
              <Section title="1RM estimé &amp; charge">
                <LineChart
                  loadSeries={d.load_series}
                  projection={d.projection}
                  recordKg={d.all_time_record_kg}
                />
                {!d.projection && (
                  <p className="mt-xs text-xs text-muted">
                    Projection disponible à partir de 3 séances.
                  </p>
                )}
              </Section>

              <Section title="Volume par séance">
                <BarChart values={d.volume_series.map((p) => p.total_volume_kg)} />
              </Section>

              <Section title="10 dernières séances">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase tracking-wide text-muted">
                    <tr>
                      <th className="py-xs">Date</th>
                      <th className="py-xs">Charge</th>
                      <th className="py-xs">Reps</th>
                      <th className="py-xs">Volume</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.recent_sessions.map((s) => (
                      <tr key={s.session_id} className="border-t border-muted/10">
                        <td className="py-xs">{s.date}</td>
                        <td className="py-xs">{s.top_weight_kg} kg</td>
                        <td className="py-xs">{s.top_reps}</td>
                        <td className="py-xs">{s.total_volume_kg} kg</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Section>
            </>
          )}
        </>
      )}
    </main>
  );
}

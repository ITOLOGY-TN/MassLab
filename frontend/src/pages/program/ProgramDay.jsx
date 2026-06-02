// US2 — Day detail. Ordered exercises with target sets/reps, last weight used,
// and a progression indicator. Rows open the exercise detail. FR-007..FR-012.
import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { fetchProgramDay, fetchProgramWeek } from '../../lib/programApi.js';
import ProgressionBadge from '../../components/ProgressionBadge.jsx';
import StateBlock from '../../components/StateBlock.jsx';

const DAY_LABELS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

function ExerciseRow({ ex }) {
  return (
    <Link
      to={`/program/exercises/${ex.exercise_id}`}
      data-testid="exercise-row"
      className="flex items-center justify-between gap-md rounded-lg border border-muted/20 bg-surface px-lg py-md transition hover:border-accent/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      <div className="flex flex-col gap-xs">
        <span className="text-base font-semibold text-text">
          {ex.name}
          {!ex.is_active && (
            <span className="ml-sm rounded bg-muted/15 px-xs py-px text-xs text-muted">
              archivé
            </span>
          )}
        </span>
        <span className="text-xs text-muted">
          {ex.target_sets} × {ex.target_reps_low}–{ex.target_reps_high} reps
        </span>
      </div>
      <div className="flex items-center gap-md">
        <span className="text-sm text-muted">
          {ex.last_weight_kg != null ? `${ex.last_weight_kg} kg` : '—'}
        </span>
        <ProgressionBadge state={ex.progression} />
      </div>
    </Link>
  );
}

export default function ProgramDay() {
  const { dayOfWeek } = useParams();
  const [state, setState] = useState({ status: 'loading', day: null });

  useEffect(() => {
    let active = true;
    setState({ status: 'loading', day: null });
    fetchProgramDay(dayOfWeek)
      .then((day) => active && setState({ status: 'ready', day }))
      .catch(async (err) => {
        if (!active) return;
        // A 404 only means "rest day" if the week view agrees it's a rest day.
        // Otherwise it's a real failure (e.g. a stale/unreachable API) and must
        // not masquerade as a rest day.
        if (err?.status === 404) {
          try {
            const week = await fetchProgramWeek();
            const d = week.days?.find((x) => x.day_of_week === Number(dayOfWeek));
            if (active) setState({ status: d && d.kind === 'rest' ? 'rest' : 'error', day: null });
            return;
          } catch {
            /* fall through to error */
          }
        }
        if (active) setState({ status: 'error', day: null });
      });
    return () => {
      active = false;
    };
  }, [dayOfWeek]);

  const label = DAY_LABELS[Number(dayOfWeek) - 1] ?? `Jour ${dayOfWeek}`;

  return (
    <main className="mx-auto max-w-2xl px-lg py-xl">
      <Link to="/program" className="text-sm text-accent hover:underline">
        ← Programme
      </Link>

      {state.status === 'loading' && <StateBlock kind="loading" />}

      {state.status === 'rest' && (
        <StateBlock
          kind="empty"
          title={`${label} est un jour de repos`}
          message="Aucun entraînement prévu."
        />
      )}

      {state.status === 'error' && (
        <StateBlock
          kind="error"
          title="Impossible de charger la journée"
          message="Réessayez plus tard."
        />
      )}

      {state.status === 'ready' && (
        <>
          <header className="mb-lg mt-md flex items-center gap-md">
            <span
              aria-hidden="true"
              className="h-8 w-2 rounded-md"
              style={{ backgroundColor: state.day.muscle_group?.color ?? '#6b7280' }}
            />
            <div>
              <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
              <h1 className="text-xl font-bold text-text">{state.day.muscle_group?.name}</h1>
            </div>
          </header>

          {state.day.empty_exercises ? (
            <StateBlock
              kind="empty"
              title="Aucun exercice"
              message="Ajoutez des exercices dans les paramètres."
            />
          ) : (
            <ol className="flex flex-col gap-sm">
              {state.day.exercises.map((ex) => (
                <li key={ex.exercise_id}>
                  <ExerciseRow ex={ex} />
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </main>
  );
}

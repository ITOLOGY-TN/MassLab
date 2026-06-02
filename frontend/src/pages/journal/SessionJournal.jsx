// Phase 4 (007-session-journal) — the Session Journal: the most-used screen,
// fast and one-handed during a workout. Auto-detects today's session, logs sets,
// paces with timers, auto-saves, and finishes with a summary. FR-001..FR-026.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useSessionJournal } from '../../lib/useSessionJournal.js';
import { isoDayOfWeek } from '../../lib/sessionTime.js';
import SessionTimer from '../../components/SessionTimer.jsx';
import RestTimer from '../../components/RestTimer.jsx';
import SetEntryRow from '../../components/SetEntryRow.jsx';
import SessionSummary from '../../components/SessionSummary.jsx';
import StateBlock from '../../components/StateBlock.jsx';

const DAY_LABELS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

function ExerciseCard({ exercise, onUpdate, onAdd, onRemove, onComplete }) {
  return (
    <section className="flex flex-col gap-sm rounded-lg border border-muted/20 bg-bg/40 p-md">
      <header className="flex items-center justify-between gap-md">
        <div className="flex flex-col">
          <span className="text-base font-semibold text-text">
            {exercise.name}
            {!exercise.is_active && (
              <span className="ml-sm rounded bg-muted/15 px-xs py-px text-xs text-muted">
                archivé
              </span>
            )}
          </span>
          {exercise.target_sets != null && (
            <span className="text-xs text-muted">
              Objectif {exercise.target_sets} × {exercise.target_reps_low}–
              {exercise.target_reps_high}
            </span>
          )}
        </div>
        <div className="text-right text-xs text-muted">
          <div>
            Préc. {exercise.previous_weight_kg != null ? `${exercise.previous_weight_kg} kg` : '—'}
          </div>
          <div className="text-accent">
            Cible{' '}
            {exercise.suggested_target_kg != null ? `${exercise.suggested_target_kg} kg` : '—'}
          </div>
        </div>
      </header>

      <div className="flex flex-col gap-xs">
        {exercise.sets.map((s, i) => (
          <SetEntryRow
            key={s.set_number}
            set={s}
            index={i}
            onChange={(patch) => onUpdate(exercise.exercise_id, s.set_number, patch)}
            onComplete={() => onComplete(exercise.exercise_id, s.set_number)}
            onRemove={() => onRemove(exercise.exercise_id, s.set_number)}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={() => onAdd(exercise.exercise_id)}
        className="min-h-[44px] self-start rounded-md border border-muted/30 px-md text-sm text-muted hover:border-accent hover:text-accent"
      >
        + Ajouter une série
      </button>
    </section>
  );
}

export default function SessionJournal() {
  const journal = useSessionJournal();
  // `token` changes on every completion so RestTimer remounts and restarts even
  // when the rest interval (seconds) is unchanged between sets.
  const [rest, setRest] = useState(null); // { seconds, token } when a rest is running
  const [finishing, setFinishing] = useState(false);
  const [note, setNote] = useState('');
  const [energy, setEnergy] = useState(null);
  const [actionError, setActionError] = useState(null);

  const today = isoDayOfWeek(new Date());

  const handleComplete = async (exerciseId, setNumber) => {
    await journal.completeSet(exerciseId, setNumber);
    const seconds = journal.session?.rest_seconds ?? 90;
    setRest((prev) => ({ seconds, token: (prev?.token ?? 0) + 1 }));
  };

  const submitFinish = async () => {
    setActionError(null);
    try {
      await journal.finish(note, energy);
      setFinishing(false);
      setNote('');
      setEnergy(null);
    } catch {
      setActionError('La sauvegarde a échoué — réessayez avant de terminer.');
    }
  };

  const handleDiscard = async () => {
    setActionError(null);
    try {
      await journal.discard();
    } catch {
      setActionError("Échec de l'abandon — réessayez.");
    }
  };

  return (
    <main className="mx-auto max-w-2xl px-lg py-xl">
      <div className="mb-md flex items-center justify-between">
        <Link to="/program" className="text-sm text-accent hover:underline">
          ← Programme
        </Link>
        {journal.status === 'active' && <SessionTimer startedAt={journal.session?.started_at} />}
      </div>

      {journal.status === 'loading' && <StateBlock kind="loading" />}

      {journal.status === 'error' && (
        <StateBlock kind="error" title="Erreur" message="Impossible de charger la séance." />
      )}

      {journal.status === 'idle' && (
        <div className="flex flex-col gap-md">
          <StateBlock
            kind="empty"
            title="Aucune séance en cours"
            message={`Aujourd'hui : ${DAY_LABELS[today - 1]}.`}
            action={
              <button
                type="button"
                onClick={() => journal.start()}
                className="mt-sm min-h-[44px] rounded-md bg-accent px-lg font-semibold text-white hover:bg-accent/90"
              >
                Démarrer la séance
              </button>
            }
          />
          <div className="flex flex-wrap gap-xs">
            <span className="w-full text-xs text-muted">Ou choisir un autre jour :</span>
            {DAY_LABELS.map((label, i) => (
              <button
                key={label}
                type="button"
                onClick={() => journal.start(i + 1)}
                className="min-h-[44px] rounded-md border border-muted/30 px-md text-sm hover:border-accent"
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {journal.status === 'prompt' && (
        <div
          data-testid="resume-prompt"
          className="flex flex-col gap-md rounded-lg border border-warn/40 bg-surface p-lg"
        >
          <p className="font-semibold text-text">Séance inachevée d'un jour précédent</p>
          <p className="text-sm text-muted">
            Vous avez une séance en cours commencée un autre jour. Reprendre ou abandonner ?
          </p>
          <div className="flex gap-sm">
            <button
              type="button"
              onClick={journal.resume}
              className="min-h-[44px] rounded-md bg-accent px-lg font-semibold text-white hover:bg-accent/90"
            >
              Reprendre
            </button>
            <button
              type="button"
              onClick={handleDiscard}
              className="min-h-[44px] rounded-md border border-danger/50 px-lg text-danger hover:bg-danger/10"
            >
              Abandonner
            </button>
          </div>
          {actionError && <p className="text-sm text-danger">{actionError}</p>}
        </div>
      )}

      {journal.status === 'active' && journal.session && (
        <div className="flex flex-col gap-lg">
          {journal.session.muscle_group && (
            <h1 className="text-xl font-bold text-text">{journal.session.muscle_group.name}</h1>
          )}

          {rest && (
            <RestTimer key={rest.token} seconds={rest.seconds} onDone={() => setRest(null)} />
          )}

          {journal.session.exercises.length === 0 ? (
            <StateBlock kind="empty" title="Aucun exercice" message="Jour de repos ou plan vide." />
          ) : (
            journal.session.exercises.map((ex) => (
              <ExerciseCard
                key={ex.exercise_id}
                exercise={ex}
                onUpdate={journal.updateSet}
                onAdd={journal.addSet}
                onRemove={journal.removeSet}
                onComplete={handleComplete}
              />
            ))
          )}

          {!finishing ? (
            <button
              type="button"
              onClick={() => setFinishing(true)}
              className="min-h-[44px] rounded-md bg-success px-lg font-semibold text-white hover:bg-success/90"
            >
              Terminer la séance
            </button>
          ) : (
            <section className="flex flex-col gap-md rounded-lg border border-muted/20 bg-surface p-lg">
              <label className="flex flex-col gap-xs">
                <span className="text-sm text-muted">Note (optionnel)</span>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="min-h-[80px] rounded-md border border-muted/30 bg-bg px-md py-sm text-text focus:outline-none focus:border-accent"
                />
              </label>
              <div className="flex flex-col gap-xs">
                <span className="text-sm text-muted">Énergie (1–5)</span>
                <div className="flex gap-xs">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setEnergy(n)}
                      className={`min-h-[44px] min-w-[44px] rounded-md border ${
                        energy === n ? 'border-accent bg-accent/10 text-accent' : 'border-muted/30'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-sm">
                <button
                  type="button"
                  onClick={submitFinish}
                  className="min-h-[44px] rounded-md bg-success px-lg font-semibold text-white hover:bg-success/90"
                >
                  Confirmer
                </button>
                <button
                  type="button"
                  onClick={() => setFinishing(false)}
                  className="min-h-[44px] rounded-md border border-muted/30 px-lg hover:border-muted"
                >
                  Annuler
                </button>
              </div>
              {actionError && <p className="text-sm text-danger">{actionError}</p>}
            </section>
          )}
        </div>
      )}

      {journal.status === 'summary' && (
        <SessionSummary summary={journal.summary} onDone={journal.reset} />
      )}
    </main>
  );
}

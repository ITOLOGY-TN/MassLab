// US3 — Exercise detail. Static content always renders; media, alternatives,
// and history degrade to empty states when absent. FR-013..FR-019.
import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { fetchProgramExercise } from '../../lib/programApi.js';
import StateBlock from '../../components/StateBlock.jsx';

function Section({ title, children }) {
  return (
    <section className="mt-lg">
      <h2 className="mb-sm text-sm font-semibold uppercase tracking-wide text-muted">{title}</h2>
      {children}
    </section>
  );
}

function Video({ video, name }) {
  if (video?.kind === 'youtube') {
    return (
      <iframe
        data-testid="video-youtube"
        title={`${name} — vidéo`}
        src={video.url}
        allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        className="aspect-video w-full rounded-lg border border-muted/20"
      />
    );
  }
  if (video?.kind === 'upload') {
    return (
      <video data-testid="video-upload" src={video.url} controls className="w-full rounded-lg" />
    );
  }
  return null;
}

export default function ExerciseDetail() {
  const { id } = useParams();
  const [state, setState] = useState({ status: 'loading', ex: null });

  useEffect(() => {
    let active = true;
    setState({ status: 'loading', ex: null });
    fetchProgramExercise(id)
      .then((ex) => active && setState({ status: 'ready', ex }))
      .catch(
        (err) =>
          active && setState({ status: err?.status === 404 ? 'notfound' : 'error', ex: null }),
      );
    return () => {
      active = false;
    };
  }, [id]);

  if (state.status === 'loading') {
    return (
      <main className="mx-auto max-w-2xl px-lg py-xl">
        <StateBlock kind="loading" />
      </main>
    );
  }
  if (state.status !== 'ready') {
    return (
      <main className="mx-auto max-w-2xl px-lg py-xl">
        <Link to="/program" className="text-sm text-accent hover:underline">
          ← Programme
        </Link>
        <StateBlock
          kind={state.status === 'notfound' ? 'empty' : 'error'}
          title={state.status === 'notfound' ? 'Exercice introuvable' : 'Erreur de chargement'}
        />
      </main>
    );
  }

  const ex = state.ex;
  const h = ex.history;

  return (
    <main className="mx-auto max-w-2xl px-lg py-xl">
      <Link to="/program" className="text-sm text-accent hover:underline">
        ← Programme
      </Link>

      <header className="mt-md">
        <h1 className="text-xl font-bold text-text">
          {ex.name}
          {!ex.is_active && (
            <span className="ml-sm rounded bg-muted/15 px-xs py-px text-xs text-muted">
              archivé
            </span>
          )}
        </h1>
        {ex.targeted_muscles?.length > 0 && (
          <p className="mt-xs text-sm text-muted">{ex.targeted_muscles.join(' · ')}</p>
        )}
      </header>

      {ex.media?.image_url && (
        <img
          data-testid="exercise-image"
          src={ex.media.image_url}
          alt={ex.name}
          className="mt-lg w-full rounded-lg border border-muted/20"
        />
      )}
      {ex.media?.video?.kind && (
        <div className="mt-lg">
          <Video video={ex.media.video} name={ex.name} />
        </div>
      )}

      <Section title="Instructions">
        <p className="whitespace-pre-line text-sm text-text">{ex.instructions || '—'}</p>
      </Section>

      {ex.technique_points?.length > 0 && (
        <Section title="Points techniques">
          <ul className="list-disc pl-lg text-sm text-text">
            {ex.technique_points.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Charge & 1RM">
        {h?.has_history ? (
          <div className="flex gap-lg text-sm">
            <div>
              <span className="block text-xs text-muted">1RM estimé</span>
              <span className="text-base font-semibold text-text">{h.estimated_1rm_kg} kg</span>
            </div>
            <div>
              <span className="block text-xs text-muted">Charge recommandée</span>
              <span className="text-base font-semibold text-text">{h.recommended_load_kg} kg</span>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted">
            Aucun historique — enregistrez une séance d&apos;abord.
          </p>
        )}
      </Section>

      <Section title="5 dernières séances">
        {h?.recent_sessions?.length > 0 ? (
          <ul className="flex flex-col gap-sm">
            {h.recent_sessions.map((s) => (
              <li
                key={s.session_id}
                className="rounded-md border border-muted/20 bg-surface px-md py-sm text-sm"
              >
                <span className="text-muted">{s.date}</span>
                <span className="ml-md text-text">
                  {s.sets.map((set) => `${set.weight_kg}×${set.reps}`).join(' · ')}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">Aucune séance enregistrée.</p>
        )}
      </Section>

      {ex.alternatives?.length > 0 && (
        <Section title="Exercices alternatifs">
          <ul className="flex flex-col gap-xs">
            {ex.alternatives.map((alt) => (
              <li key={alt.exercise_id}>
                <Link
                  to={`/program/exercises/${alt.exercise_id}`}
                  data-testid="alternative-link"
                  className="text-sm text-accent hover:underline"
                >
                  {alt.name}
                  {!alt.is_active && <span className="ml-sm text-xs text-muted">(archivé)</span>}
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </main>
  );
}

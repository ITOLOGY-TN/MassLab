// Phase 10 (013-phase10-dashboard) T014 — today's session card.
// Renders the dashboard `data.today` slot: the muscle group of today's planned
// session, its first three exercises, and a single state-aware call to action.
// The card mirrors DayCard's token-driven framing and the RecoveryAlerts copy
// seam (French strings keyed by a stable enum, never hardcoded English).
//
// `today` shape (contracts/openapi.yaml TodayCard):
//   { is_rest, muscle_group, exercises: [{ id, name }], state, cta, day_of_week }
//   state ∈ not_started | in_progress | finished | rest
//   cta   ∈ start | resume | review | null   (null on a rest day)
//
// CTA routing (data-model §3a): start/resume open the live journal, review
// re-opens today's finished summary there too. A rest day shows no CTA at all.
import { Link } from 'react-router-dom';

const DAY_LABELS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

// French copy keyed by the backend's stable `cta` enum (the locale seam). Each
// entry carries the button label and an in-app target.
const CTA_COPY = {
  start: { label: 'Commencer la séance', to: '/journal' },
  resume: { label: 'Reprendre la séance', to: '/journal' },
  review: { label: 'Revoir la séance', to: '/journal' },
};

// A short status line per state, shown under the muscle group.
const STATE_TAGLINE = {
  not_started: 'Prête à démarrer',
  in_progress: 'Séance en cours',
  finished: 'Séance terminée',
  rest: 'Jour de repos',
};

export default function TodaySessionCard({ today }) {
  if (!today) return null;

  const {
    is_rest: isRest,
    muscle_group: muscleGroup,
    exercises = [],
    state,
    cta,
    day_of_week: dayOfWeek,
  } = today;

  const dayLabel = dayOfWeek ? DAY_LABELS[dayOfWeek - 1] : null;
  const firstThree = exercises.slice(0, 3);

  // ── Rest day: a calm, distinct empty state — no exercises, no CTA. ──
  if (isRest || state === 'rest') {
    return (
      <article
        data-testid="today-session-card"
        data-state="rest"
        data-is-rest="true"
        className="flex flex-col items-center gap-sm rounded-lg border border-muted/20 bg-surface px-lg py-xl text-center shadow-sm"
      >
        <span aria-hidden="true" className="text-3xl">
          🌙
        </span>
        <div>
          {dayLabel ? (
            <p className="text-xs uppercase tracking-wide text-muted">{dayLabel}</p>
          ) : null}
          <h3 className="text-lg font-semibold text-text">Jour de repos</h3>
        </div>
        <p className="max-w-xs text-sm text-muted">
          Pas de séance prévue aujourd’hui. Récupère bien — c’est là que les progrès se
          construisent.
        </p>
      </article>
    );
  }

  const ctaCopy = cta ? CTA_COPY[cta] : null;
  // Finished sessions get a softer success accent; active/upcoming use the accent.
  const isFinished = state === 'finished';

  return (
    <article
      data-testid="today-session-card"
      data-state={state}
      data-is-rest="false"
      className="flex flex-col gap-md rounded-lg border border-muted/20 bg-surface p-lg shadow-sm"
    >
      {/* Header: muscle group + a state tagline, with the accent rail of DayCard. */}
      <div className="flex items-start gap-md">
        <span
          aria-hidden="true"
          className={`mt-px h-12 w-2 rounded-md ${isFinished ? 'bg-success' : 'bg-accent'}`}
        />
        <div className="flex flex-col">
          <span className="text-xs uppercase tracking-wide text-muted">
            {dayLabel ? `${dayLabel} · ` : ''}
            {STATE_TAGLINE[state] ?? 'Séance du jour'}
          </span>
          <h3 className="text-xl font-semibold leading-tight text-text">
            {muscleGroup ?? 'Séance du jour'}
          </h3>
        </div>
      </div>

      {/* The first three planned exercises. */}
      {firstThree.length > 0 ? (
        <ul className="flex flex-col gap-xs">
          {firstThree.map((ex, i) => (
            <li
              key={ex.id ?? i}
              data-testid="today-exercise"
              className="flex items-center gap-sm text-sm text-text"
            >
              <span
                aria-hidden="true"
                className="flex h-5 w-5 flex-none items-center justify-center rounded-full bg-accent/10 text-[11px] font-semibold text-accent"
              >
                {i + 1}
              </span>
              <span className="truncate">{ex.name}</span>
            </li>
          ))}
          {exercises.length > 3 ? (
            <li className="pl-7 text-xs text-muted">
              +{exercises.length - 3} autre{exercises.length - 3 > 1 ? 's' : ''}
            </li>
          ) : null}
        </ul>
      ) : (
        <p className="text-sm text-muted">Aucun exercice planifié.</p>
      )}

      {/* State-aware CTA — a large, full-width tap target (FR: athlete-first UX). */}
      {ctaCopy ? (
        <Link
          to={ctaCopy.to}
          data-testid="today-cta"
          data-cta={cta}
          className={`mt-xs flex items-center justify-center gap-sm rounded-md px-lg py-md text-base font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-surface ${
            isFinished
              ? 'border border-success/40 bg-success/10 text-text hover:bg-success/20 focus-visible:ring-success'
              : 'bg-accent text-bg hover:opacity-90 focus-visible:ring-accent'
          }`}
        >
          <span>{ctaCopy.label}</span>
          <span aria-hidden="true">{isFinished ? '↻' : '→'}</span>
        </Link>
      ) : null}
    </article>
  );
}

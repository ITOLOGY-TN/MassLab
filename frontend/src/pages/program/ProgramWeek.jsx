// US1 — Weekly planning view. Training days render as cards; rest days as
// compact separators; an unconfigured week points the athlete to Settings.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchProgramWeek } from '../../lib/programApi.js';
import DayCard from '../../components/DayCard.jsx';
import RestSeparator from '../../components/RestSeparator.jsx';
import StateBlock from '../../components/StateBlock.jsx';

export default function ProgramWeek() {
  const [state, setState] = useState({ status: 'loading', week: null });

  useEffect(() => {
    let active = true;
    fetchProgramWeek()
      .then((week) => active && setState({ status: 'ready', week }))
      .catch(() => active && setState({ status: 'error', week: null }));
    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="mx-auto max-w-2xl px-lg py-xl">
      <header className="mb-lg">
        <h1 className="text-xl font-bold text-text">Programme de la semaine</h1>
        <p className="text-sm text-muted">Vos journées d&apos;entraînement et de repos.</p>
      </header>

      {state.status === 'loading' && <StateBlock kind="loading" />}

      {state.status === 'error' && (
        <StateBlock
          kind="error"
          title="Impossible de charger le programme"
          message="Réessayez plus tard."
        />
      )}

      {state.status === 'ready' && state.week.empty && (
        <StateBlock
          kind="empty"
          title="Aucune journée d'entraînement"
          message="Configurez votre semaine dans les paramètres."
          action={
            <Link
              to="/settings/schedule"
              className="rounded-md bg-accent px-md py-sm text-sm font-medium text-bg hover:opacity-90"
            >
              Configurer le planning
            </Link>
          }
        />
      )}

      {state.status === 'ready' && !state.week.empty && (
        <ol className="flex flex-col gap-sm">
          {state.week.days.map((day) => (
            <li key={day.day_of_week}>
              {day.kind === 'training' ? (
                <DayCard day={day} />
              ) : (
                <RestSeparator dayOfWeek={day.day_of_week} />
              )}
            </li>
          ))}
        </ol>
      )}
    </main>
  );
}

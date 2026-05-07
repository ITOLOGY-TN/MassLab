import { useEffect, useState } from 'react';
import { apiGet } from '../lib/api.js';

export default function ScaffoldHome() {
  const [athlete, setAthlete] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    apiGet('/api/v1/athlete/me')
      .then((res) => setAthlete(res.data))
      .catch((err) => setError(err.message));
  }, []);

  return (
    <main className="min-h-full flex items-center justify-center p-lg">
      <section className="bg-surface rounded-lg p-xl max-w-md w-full shadow-xl">
        <p className="text-muted text-sm mb-sm">MassLab · Phase 0 scaffold</p>
        <h1 className="text-3xl font-semibold mb-md">
          {athlete ? `Bienvenue, ${athlete.display_name ?? athlete.email}` : 'Chargement…'}
        </h1>
        {error ? (
          <p className="text-danger text-sm" role="alert">
            {error}
          </p>
        ) : null}
        {athlete ? (
          <dl className="grid grid-cols-2 gap-sm text-sm text-muted">
            <dt>Goal</dt>
            <dd className="text-text">{athlete.goal}</dd>
            <dt>Morphotype</dt>
            <dd className="text-text">{athlete.morphotype}</dd>
            <dt>Sessions / week</dt>
            <dd className="text-text">{athlete.weekly_session_count}</dd>
          </dl>
        ) : null}
      </section>
    </main>
  );
}

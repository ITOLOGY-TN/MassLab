import { useEffect, useState } from 'react';
import { apiGet } from '../lib/api.js';
import ResultCard from '../components/ResultCard.jsx';

export default function NutritionHome() {
  const [targets, setTargets] = useState(null);
  const [program, setProgram] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([
      apiGet('/api/v1/me/nutrition-targets'),
      apiGet('/api/v1/nutrition/targets').catch(() => null),
    ])
      .then(([resolved, fallback]) => {
        setTargets(resolved.data);
        setProgram(fallback?.data ?? null);
      })
      .catch((err) => setError(err.message));
  }, []);

  const hasOverride = targets
    ? Object.values(targets.source ?? {}).some((s) => s !== 'engine')
    : false;

  return (
    <main className="min-h-full p-lg max-w-3xl mx-auto">
      <header className="mb-lg">
        <p className="text-muted text-sm mb-xs">MassLab</p>
        <h1 className="text-3xl font-semibold">
          Nutrition{' '}
          {hasOverride ? <span className="text-sm text-accent align-middle">(custom)</span> : null}
        </h1>
      </header>

      {error ? (
        <ResultCard title="Erreur">
          <p className="text-danger">{error}</p>
        </ResultCard>
      ) : !targets ? (
        <ResultCard title="Chargement…">
          <p className="text-muted">Récupération des objectifs depuis l'API…</p>
        </ResultCard>
      ) : (
        <ResultCard
          title="Objectifs quotidiens"
          footnote={
            hasOverride
              ? 'Au moins un objectif est personnalisé dans Paramètres → Préférences. Effacez les surcharges pour revenir aux valeurs du moteur.'
              : 'Calculés à partir de votre profil. Ouvrez Paramètres → Préférences pour personnaliser.'
          }
        >
          <dl className="grid grid-cols-2 gap-md">
            <dt className="text-muted">Calories</dt>
            <dd className="text-2xl font-semibold">
              {targets.daily_kcal} kcal <SourceBadge source={targets.source.daily_kcal} />
            </dd>
            {program?.tdee_kcal ? (
              <>
                <dt className="text-muted">TDEE</dt>
                <dd className="text-text">{program.tdee_kcal} kcal</dd>
              </>
            ) : null}
            <dt className="text-muted">Protéines</dt>
            <dd className="text-text">
              {targets.daily_protein_g} g <SourceBadge source={targets.source.daily_protein_g} />
            </dd>
            <dt className="text-muted">Glucides</dt>
            <dd className="text-text">
              {targets.daily_carbs_g} g <SourceBadge source={targets.source.daily_carbs_g} />
            </dd>
            <dt className="text-muted">Lipides</dt>
            <dd className="text-text">
              {targets.daily_fat_g} g <SourceBadge source={targets.source.daily_fat_g} />
            </dd>
          </dl>
        </ResultCard>
      )}
    </main>
  );
}

function SourceBadge({ source }) {
  if (!source || source === 'engine') return null;
  const label = source === 'override' ? 'custom' : 'auto';
  return <span className="text-xs text-accent">({label})</span>;
}

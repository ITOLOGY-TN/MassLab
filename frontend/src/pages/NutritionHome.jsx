import { useEffect, useState } from 'react';
import { apiGet } from '../lib/api.js';
import ResultCard from '../components/ResultCard.jsx';

export default function NutritionHome() {
  const [targets, setTargets] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    apiGet('/api/v1/nutrition/targets')
      .then((res) => setTargets(res.data))
      .catch((err) => setError(err.message));
  }, []);

  return (
    <main className="min-h-full p-lg max-w-3xl mx-auto">
      <header className="mb-lg">
        <p className="text-muted text-sm mb-xs">MassLab · Phase 1</p>
        <h1 className="text-3xl font-semibold">Nutrition</h1>
      </header>

      {error ? (
        <ResultCard title="Erreur">
          <p className="text-danger">{error}</p>
        </ResultCard>
      ) : !targets ? (
        <ResultCard title="Chargement…">
          <p className="text-muted">Récupération des objectifs depuis l’API…</p>
        </ResultCard>
      ) : (
        <ResultCard
          title="Objectifs quotidiens"
          footnote="Calculés à partir de votre profil et figés sur le programme actif. Ouvrez Calculateurs pour explorer des variantes sans modifier votre profil."
        >
          <dl className="grid grid-cols-2 gap-md">
            <dt className="text-muted">Calories</dt>
            <dd className="text-2xl font-semibold">{targets.daily_kcal} kcal</dd>
            <dt className="text-muted">TDEE</dt>
            <dd className="text-text">{targets.tdee_kcal} kcal</dd>
            <dt className="text-muted">Protéines</dt>
            <dd className="text-text">{targets.macros.protein_g} g</dd>
            <dt className="text-muted">Glucides</dt>
            <dd className="text-text">{targets.macros.carbs_g} g</dd>
            <dt className="text-muted">Lipides</dt>
            <dd className="text-text">{targets.macros.fat_g} g</dd>
          </dl>
        </ResultCard>
      )}
    </main>
  );
}

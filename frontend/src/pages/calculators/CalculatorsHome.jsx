import { Link } from 'react-router-dom';

const CALCULATORS = [
  { slug: 'bmr', label: 'BMR', description: 'Métabolisme basal (Mifflin–St Jeor).' },
  { slug: 'tdee', label: 'TDEE', description: 'Dépense énergétique totale, par niveau d’activité.' },
  { slug: 'macros', label: 'Macros', description: 'Calories + protéines / glucides / lipides.' },
  { slug: 'one-rep-max', label: '1RM', description: 'Estimation du 1RM et table de pourcentages.' },
  {
    slug: 'body-composition',
    label: 'Composition corporelle',
    description: 'Body-fat % et masse maigre.',
  },
];

export default function CalculatorsHome() {
  return (
    <main className="min-h-full p-lg max-w-3xl mx-auto">
      <header className="mb-lg">
        <p className="text-muted text-sm mb-xs">MassLab · Phase 1</p>
        <h1 className="text-3xl font-semibold">Calculateurs</h1>
        <p className="text-muted mt-sm">
          Tests rapides sans modifier votre profil. Les résultats sont identiques au moteur interne.
        </p>
      </header>
      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-md">
        {CALCULATORS.map((c) => (
          <li key={c.slug}>
            <Link
              to={`/calculators/${c.slug}`}
              className="block bg-surface rounded-lg p-lg hover:bg-bg/40 transition-colors"
            >
              <h2 className="text-xl font-semibold mb-xs">{c.label}</h2>
              <p className="text-muted text-sm">{c.description}</p>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}

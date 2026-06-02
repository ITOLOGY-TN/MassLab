// US2 (placeholder) — day detail. Replaced in Phase 3 US2 with the ordered
// exercise list + last weight + progression indicator.
import { useParams, Link } from 'react-router-dom';

export default function ProgramDay() {
  const { dayOfWeek } = useParams();
  return (
    <main className="mx-auto max-w-2xl px-lg py-xl">
      <Link to="/program" className="text-sm text-accent hover:underline">
        ← Programme
      </Link>
      <h1 className="mt-md text-xl font-bold text-text">Journée {dayOfWeek}</h1>
      <p className="mt-sm text-sm text-muted">Détail de la journée — bientôt disponible.</p>
    </main>
  );
}

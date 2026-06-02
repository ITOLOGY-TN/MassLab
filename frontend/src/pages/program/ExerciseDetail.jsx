// US3 (placeholder) — exercise detail. Replaced in Phase 3 US3 with full
// instructions, media, alternatives, history, 1RM, and load recommendation.
import { useParams, Link } from 'react-router-dom';

export default function ExerciseDetail() {
  const { id } = useParams();
  return (
    <main className="mx-auto max-w-2xl px-lg py-xl">
      <Link to="/program" className="text-sm text-accent hover:underline">
        ← Programme
      </Link>
      <h1 className="mt-md text-xl font-bold text-text">Exercice {id}</h1>
      <p className="mt-sm text-sm text-muted">Fiche d&apos;exercice — bientôt disponible.</p>
    </main>
  );
}

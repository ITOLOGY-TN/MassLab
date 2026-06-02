// A training-day card: muscle group, color badge, and exercise count. The whole
// card is a large tap target that opens the day detail (FR-002, FR-005).
import { Link } from 'react-router-dom';

const DAY_LABELS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

export default function DayCard({ day }) {
  const { day_of_week, muscle_group, exercise_count } = day;
  const count = exercise_count ?? 0;
  return (
    <Link
      to={`/program/day/${day_of_week}`}
      data-testid="day-card"
      className="flex items-center justify-between gap-md rounded-lg border border-muted/20 bg-surface px-lg py-md transition hover:border-accent/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      <div className="flex items-center gap-md">
        <span
          aria-hidden="true"
          className="h-10 w-2 rounded-md"
          style={{ backgroundColor: muscle_group?.color ?? '#6b7280' }}
        />
        <div className="flex flex-col">
          <span className="text-xs uppercase tracking-wide text-muted">
            {DAY_LABELS[day_of_week - 1]}
          </span>
          <span className="text-base font-semibold text-text">
            {muscle_group?.name ?? 'Non assigné'}
          </span>
        </div>
      </div>
      <span className="text-sm text-muted">
        {count} {count === 1 ? 'exercice' : 'exercices'}
      </span>
    </Link>
  );
}

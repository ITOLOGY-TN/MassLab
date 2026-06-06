// Phase 10 (013-phase10-dashboard) T015 — compact 7-day strip of the current ISO
// week: each day done / todo / rest, color-coded on the shared design tokens
// (FR / week overview). Plain Tailwind markup — no charting library. Reads the
// composed `data.week.days` array ({ date, day_of_week, status }); future training
// days are 'todo', never 'missed'.

// Short ISO weekday labels (Mon→Sun), aligned with day_of_week 1→7.
const DAY_LABELS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

const TONE = {
  done: 'bg-success/80 border-success/40 text-text',
  todo: 'bg-surface/60 border-surface text-muted',
  rest: 'bg-surface/30 border-surface text-muted',
};

const STATUS_LABEL = { done: 'Fait', todo: 'À faire', rest: 'Repos' };

export default function WeekStrip({ week }) {
  const days = week?.days ?? [];
  if (days.length === 0) return null;

  return (
    <section
      data-testid="week-strip"
      className="rounded-lg border border-surface bg-surface/40 p-lg shadow-sm"
    >
      <h2 className="mb-md text-base font-semibold text-text">Semaine</h2>

      <ol className="grid grid-cols-7 gap-sm">
        {days.map((day) => (
          <li key={day.date} className="flex flex-col items-center gap-xs">
            <span className="text-xs font-medium text-muted">
              {DAY_LABELS[day.day_of_week - 1]}
            </span>
            <span
              data-testid="week-strip-cell"
              data-status={day.status}
              title={`${day.date} — ${STATUS_LABEL[day.status]}`}
              aria-label={`${DAY_LABELS[day.day_of_week - 1]} ${day.date} ${STATUS_LABEL[day.status]}`}
              className={`flex h-9 w-full items-center justify-center rounded-md border text-[10px] ${TONE[day.status]}`}
            >
              {STATUS_LABEL[day.status]}
            </span>
          </li>
        ))}
      </ol>

      <div className="mt-md flex flex-wrap gap-md text-xs text-muted">
        {['done', 'todo', 'rest'].map((s) => (
          <span key={s} className="flex items-center gap-xs">
            <span className={`inline-block h-3 w-3 rounded-sm border ${TONE[s]}`} />
            {STATUS_LABEL[s]}
          </span>
        ))}
      </div>
    </section>
  );
}

// Phase 8 (011-phase8-supplements) T030 — the weekly adherence grid: supplements ×
// 7 days, each cell color-coded taken / missed / upcoming (FR-009/FR-010). Plain
// Tailwind markup on the shared design tokens — no charting library.

// Short ISO weekday labels (Mon→Sun), aligned with the week's 7 ascending days.
const DAY_LABELS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

const CELL_TONE = {
  taken: 'bg-success/80 border-success/40',
  missed: 'bg-danger/70 border-danger/30',
  upcoming: 'bg-surface/60 border-surface',
};

const CELL_LABEL = { taken: 'Pris', missed: 'Manqué', upcoming: 'À venir' };

export default function WeeklyGrid({ grid, onPrevWeek, onNextWeek }) {
  if (!grid) return null;
  const days = grid.days ?? [];
  const rows = grid.rows ?? [];

  return (
    <section
      data-testid="weekly-grid"
      className="rounded-lg border border-surface bg-surface/40 p-lg shadow-sm"
    >
      <div className="mb-md flex items-center justify-between gap-md">
        <h2 className="text-base font-semibold text-text">Semaine</h2>
        <div className="flex items-center gap-sm text-sm">
          <button
            type="button"
            data-testid="grid-prev-week"
            onClick={onPrevWeek}
            className="rounded-md border border-surface px-sm py-xs text-muted hover:text-accent"
            aria-label="Semaine précédente"
          >
            ‹
          </button>
          <span className="text-xs text-muted">sem. du {grid.week_start}</span>
          <button
            type="button"
            data-testid="grid-next-week"
            onClick={onNextWeek}
            className="rounded-md border border-surface px-sm py-xs text-muted hover:text-accent"
            aria-label="Semaine suivante"
          >
            ›
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-1 text-center text-xs">
          <thead>
            <tr>
              <th className="text-left font-medium text-muted">Complément</th>
              {days.map((date, i) => (
                <th key={date} className="font-medium text-muted" title={date}>
                  {DAY_LABELS[i]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.supplement_id} data-testid="grid-row">
                <td className="whitespace-nowrap py-xs pr-sm text-left text-sm text-text">
                  {row.name}
                </td>
                {row.cells.map((cell) => (
                  <td key={cell.date} className="p-0">
                    <span
                      data-testid="grid-cell"
                      data-status={cell.status}
                      title={`${cell.date} — ${CELL_LABEL[cell.status]}`}
                      aria-label={`${row.name} ${cell.date} ${CELL_LABEL[cell.status]}`}
                      className={`block h-7 w-full rounded-md border ${CELL_TONE[cell.status]}`}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-md flex flex-wrap gap-md text-xs text-muted">
        {['taken', 'missed', 'upcoming'].map((s) => (
          <span key={s} className="flex items-center gap-xs">
            <span className={`inline-block h-3 w-3 rounded-sm border ${CELL_TONE[s]}`} />
            {CELL_LABEL[s]}
          </span>
        ))}
      </div>
    </section>
  );
}

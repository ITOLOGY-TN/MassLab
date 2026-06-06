// Phase 11 (US3) — Attendance tab. Renders the finished-session volume heatmap as one
// monthly CalendarHeatmap per calendar month present in `attendance.days`. Each graded
// day (level 1..levels) is mapped onto the heatmap's 0–10 energy scale so the shared
// component colors it; level-0 days (rest/future/no session) map to a null cell.
import CalendarHeatmap from '../../../components/charts/CalendarHeatmap.jsx';

// A titled card section — mirrors RecoveryTrends' Panel so every tab reads as a
// stack of bordered chart panels with a consistent header + optional subtitle.
function Panel({ title, subtitle, children }) {
  return (
    <section className="rounded-lg border border-surface bg-surface/40 p-lg shadow-sm">
      <h2 className="text-base font-semibold text-text">{title}</h2>
      {subtitle ? (
        <p className="mb-md mt-xs text-xs text-muted">{subtitle}</p>
      ) : (
        <div className="mb-md" />
      )}
      {children}
    </section>
  );
}

// Group the flat ascending day list into { 'YYYY-MM': day[] } buckets, ordered.
function groupByMonth(days) {
  const months = new Map();
  for (const day of days) {
    const key = day.date.slice(0, 7);
    if (!months.has(key)) months.set(key, []);
    months.get(key).push(day);
  }
  return [...months.entries()];
}

export default function AttendanceTab({ attendance }) {
  const { days = [], levels = 0 } = attendance ?? {};

  if (!days.length) {
    return (
      <div data-testid="attendance-tab">
        <Panel title="Assiduité" subtitle="Intensité par volume d’entraînement.">
          <p className="rounded-lg border border-dashed border-muted/25 bg-surface/30 p-md text-sm text-muted">
            Aucune séance terminée pour l’instant.
          </p>
        </Panel>
      </div>
    );
  }

  const months = groupByMonth(days);

  return (
    <div data-testid="attendance-tab">
      <Panel
        title="Assiduité"
        subtitle="Une case par jour · plus la couleur est vive, plus le volume d’entraînement est haut."
      >
        <div className="flex flex-wrap gap-lg">
          {months.map(([key, monthDays]) => {
            const [year, month] = key.split('-').map(Number);
            const cells = monthDays.map((day) => ({
              date: day.date,
              energy: day.level === 0 ? null : Math.round((day.level / levels) * 10),
            }));
            return (
              <div key={key} className="flex flex-col items-center gap-xs">
                <CalendarHeatmap year={year} month={month} cells={cells} />
                <span className="text-xs font-medium text-muted tabular-nums">{key}</span>
              </div>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}

// Phase 4 — post-session summary result (FR-021..FR-023). Renders the computed
// summary returned by POST /sessions/:id/finish.
import { formatDuration } from '../lib/sessionTime.js';

function Stat({ label, value }) {
  return (
    <div className="flex flex-col gap-xs rounded-lg border border-muted/20 bg-surface px-lg py-md">
      <span className="text-xs uppercase tracking-wide text-muted">{label}</span>
      <span className="text-xl font-bold text-text">{value}</span>
    </div>
  );
}

export default function SessionSummary({ summary, onDone }) {
  if (!summary) return null;
  const { duration_seconds, total_volume_kg, top_performance, personal_records } = summary;
  return (
    <section data-testid="session-summary" className="flex flex-col gap-md">
      <h1 className="text-2xl font-bold text-text">Séance terminée 💪</h1>
      <div className="grid grid-cols-2 gap-sm">
        <Stat label="Durée" value={formatDuration(duration_seconds)} />
        <Stat label="Volume total" value={`${total_volume_kg} kg`} />
      </div>

      {top_performance && (
        <div className="rounded-lg border border-accent/30 bg-surface px-lg py-md">
          <p className="text-xs uppercase tracking-wide text-muted">Top performance</p>
          <p className="text-lg font-semibold text-text">
            {top_performance.name} — {top_performance.weight_kg} kg × {top_performance.reps}
          </p>
        </div>
      )}

      {personal_records?.length > 0 && (
        <div className="rounded-lg border border-success/40 bg-success/5 px-lg py-md">
          <p className="mb-sm text-sm font-semibold text-success">
            🏆 {personal_records.length} record{personal_records.length > 1 ? 's' : ''} !
          </p>
          <ul className="flex flex-col gap-xs">
            {personal_records.map((pr, i) => (
              <li key={`${pr.exercise_id}-${pr.kind}-${i}`} className="text-sm text-text">
                {pr.name ?? `Exercice ${pr.exercise_id}`} —{' '}
                {pr.kind === 'weight' ? 'charge' : '1RM estimé'} {pr.value_kg} kg
                {pr.previous_kg != null && (
                  <span className="text-muted"> (avant {pr.previous_kg} kg)</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <button
        type="button"
        onClick={onDone}
        className="min-h-[44px] rounded-md bg-accent px-lg py-sm font-semibold text-white hover:bg-accent/90"
      >
        Terminé
      </button>
    </section>
  );
}

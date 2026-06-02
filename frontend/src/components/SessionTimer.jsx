// Phase 4 — live session elapsed clock, anchored to the server `started_at`
// (FR-012, research D-12).
import { useElapsed, formatDuration } from '../lib/sessionTime.js';

export default function SessionTimer({ startedAt }) {
  const secs = useElapsed(startedAt);
  return (
    <div
      data-testid="session-timer"
      className="font-mono text-2xl font-bold text-accent tabular-nums"
      aria-label="Durée de la séance"
    >
      {formatDuration(secs)}
    </div>
  );
}

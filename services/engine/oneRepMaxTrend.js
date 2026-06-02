// Pure function — month-over-month % change in primary_estimate_kg for a single
// exercise's history (FR-017). Returns { delta_pct, on_pace } or nulls when
// there is no record older than ~25 days.
import { DEFAULTS } from './constants.js';

const DAY_MS = 86_400_000;

export function oneRepMaxTrend({ records = [], now = new Date(), constants = DEFAULTS }) {
  if (!records.length) return { delta_pct: null, on_pace: null };

  const sorted = [...records].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
  const latest = sorted[0];

  // Find a baseline record between 25 and 60 days ago (most recent that qualifies).
  const minAgeMs = 25 * DAY_MS;
  const maxAgeMs = 60 * DAY_MS;
  const tNow = now.getTime();
  const baseline = sorted.find((r) => {
    const age = tNow - new Date(r.created_at).getTime();
    return age >= minAgeMs && age <= maxAgeMs;
  });

  if (!baseline) return { delta_pct: null, on_pace: null };

  const delta_pct =
    Math.round(
      ((latest.primary_estimate_kg - baseline.primary_estimate_kg) / baseline.primary_estimate_kg) *
        1000,
    ) / 10;

  const on_pace = delta_pct >= constants.on_pace_pct_per_month;
  return { delta_pct, on_pace };
}

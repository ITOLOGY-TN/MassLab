// Pure presenter — the weekly self-assessment + trend (Phase 8, FR-012/FR-015/FR-016).
// The current ISO week's assessment is always editable (the server only ever returns
// the current week as `current`, so elapsed weeks are read-only). The four fixed
// dimensions live here as a tested constant (research D-9), not env config. No I/O.

export const DIMENSIONS = ['energy', 'recovery', 'sleep_quality', 'strength'];

function pick(row) {
  if (!row) return null;
  return {
    week_start: row.week_start,
    energy: row.energy,
    recovery: row.recovery,
    sleep_quality: row.sleep_quality,
    strength: row.strength,
  };
}

/**
 * @param {object} args
 * @param {object|null} args.currentRow  the current ISO week's row (or null)
 * @param {Array<object>} [args.trendRows]  rows over the trend window, chronological
 * @param {string} [args.weekStart]  the current ISO week Monday
 * @returns {{ current, editable, trend }}
 */
export function build({ currentRow = null, trendRows = [], weekStart = null } = {}) {
  return {
    current: pick(currentRow),
    editable: true,
    week_start: weekStart,
    trend: (trendRows ?? []).map(pick),
  };
}

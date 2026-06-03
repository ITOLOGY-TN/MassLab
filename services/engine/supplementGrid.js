// Pure — weekly grid cell classification (Phase 8, research D-7). A cell is
// `taken` when a record exists, `missed` when the day has fully elapsed with no
// record, and `upcoming` for the remainder of today and any future day. This keeps
// "missed" retrospective-only — today's un-tapped supplement is upcoming, not missed.
// Caller supplies asOf; no clock, no I/O, no globals (Constitution II + V).

/**
 * @param {string} date  YYYY-MM-DD
 * @param {Set<string>|string[]} takenSet  taken dates for the supplement
 * @param {{ asOf: string }} opts  server "today"
 * @returns {'taken'|'missed'|'upcoming'}
 */
export function cellStatus(date, takenSet, { asOf } = {}) {
  const set = takenSet instanceof Set ? takenSet : new Set(takenSet ?? []);
  if (set.has(date)) return 'taken';
  if (date < asOf) return 'missed';
  return 'upcoming';
}

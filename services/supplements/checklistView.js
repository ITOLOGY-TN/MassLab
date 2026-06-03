// Pure presenter — the daily supplement checklist (Phase 8, FR-001/FR-007/FR-008).
// One item per catalogue supplement (already in display_order), carrying the day's
// taken-state, the per-supplement streak, and is_primary for the configured primary
// slug (creatine). No I/O; the caller injects taken-ids + streaks.

/**
 * @param {object} args
 * @param {Array<{id,slug,name,dosage,recommended_time}>} args.catalogue  the seeded supplements
 * @param {Set<number>} [args.takenIds]  supplement ids taken on `date`
 * @param {Record<number, number>} [args.streaks]  per-supplement streak counts
 * @param {string} [args.primarySlug]  the slug shown most prominently
 * @param {string} [args.date]  the day in YYYY-MM-DD
 * @returns {{ date, supplements }}
 */
export function build({ catalogue = [], takenIds, streaks, primarySlug, date = null } = {}) {
  const taken = takenIds instanceof Set ? takenIds : new Set(takenIds ?? []);
  const streakOf = streaks ?? {};
  return {
    date,
    supplements: catalogue.map((s) => ({
      id: s.id,
      slug: s.slug,
      name: s.name,
      dosage: s.dosage,
      recommended_time: s.recommended_time,
      taken: taken.has(s.id),
      streak: streakOf[s.id] ?? 0,
      is_primary: s.slug === primarySlug,
    })),
  };
}

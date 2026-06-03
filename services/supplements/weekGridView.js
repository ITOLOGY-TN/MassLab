// Pure presenter — the weekly supplement grid (Phase 8, FR-009/FR-010/FR-011).
// One row per catalogue supplement × 7 ISO-week days, each cell classified
// taken/missed/upcoming via the grid engine. No I/O; the caller injects the week's
// taken rows + asOf.
import { weekDays } from './week.js';
import { cellStatus } from '../engine/supplementGrid.js';

/**
 * @param {object} args
 * @param {Array<{id,slug,name}>} args.catalogue  the seeded supplements
 * @param {Array<{supplement_id, logged_on}>} [args.takenRows]  taken rows for the week
 * @param {string} args.weekStart  the ISO week Monday (YYYY-MM-DD)
 * @param {string} args.asOf  server "today" (YYYY-MM-DD)
 * @returns {{ week_start, days, rows }}
 */
export function build({ catalogue = [], takenRows = [], weekStart, asOf } = {}) {
  const days = weekDays(weekStart);

  // Per-supplement set of taken dates within the week.
  const datesBySupp = new Map();
  for (const r of takenRows) {
    if (!datesBySupp.has(r.supplement_id)) datesBySupp.set(r.supplement_id, new Set());
    datesBySupp.get(r.supplement_id).add(r.logged_on);
  }

  return {
    week_start: weekStart,
    days,
    rows: catalogue.map((s) => {
      const taken = datesBySupp.get(s.id) ?? new Set();
      return {
        supplement_id: s.id,
        slug: s.slug,
        name: s.name,
        cells: days.map((date) => ({ date, status: cellStatus(date, taken, { asOf }) })),
      };
    }),
  };
}

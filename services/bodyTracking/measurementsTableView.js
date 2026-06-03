// Pure presenter — compose the monthly measurements table view model from a
// weigh-in history (Phase 6, FR-021–FR-023). Delegates the numbers to the engine
// (`measurementDeltas`): one latest value per field per month (D-5) and a signed
// month-over-month delta (null where a side is missing). Adds the per-cell
// `direction` arrow the frontend renders. No I/O, no globals (Constitution II).
import {
  monthlyLatest,
  monthOverMonthDeltas,
  MEASUREMENT_FIELDS,
} from '../engine/measurementDeltas.js';

// The table shows circumferences (weight has its own chart), but a caller may pass
// any subset via `fields`.
const DEFAULT_FIELDS = MEASUREMENT_FIELDS.filter((f) => f !== 'weight_kg');

function directionOf(delta) {
  if (delta == null || delta === 0) return 'flat';
  return delta > 0 ? 'up' : 'down';
}

/**
 * @param {object} args
 * @param {Array<{ measured_on: string }>} args.measurements  weigh-in rows (any order)
 * @param {string[]} [args.fields]  measurement fields to surface (defaults to the seven circumferences)
 * @returns {{ months: Array<{ month: string, fields: Object<string, { value: number, delta: number|null, direction: 'up'|'down'|'flat' }> }> }}
 */
export function build({ measurements = [], fields = DEFAULT_FIELDS } = {}) {
  const monthly = monthlyLatest(measurements);
  const deltas = monthOverMonthDeltas(monthly);

  const months = Object.keys(monthly)
    .sort()
    .map((month) => {
      const valueByField = monthly[month];
      const deltaByField = deltas[month] || {};
      const cells = {};
      for (const field of fields) {
        if (!(field in valueByField)) continue; // only surface fields present this month
        const delta = field in deltaByField ? deltaByField[field] : null;
        cells[field] = { value: valueByField[field], delta, direction: directionOf(delta) };
      }
      return { month, fields: cells };
    });

  return { months };
}

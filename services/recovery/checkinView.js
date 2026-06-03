// Pure presenter — the daily recovery check-in form state (Phase 9, data-model.md §5a).
// Projects the day's persisted signals (or null when nothing is logged), carries the
// editable flag (computed at the controller from the current ISO week), and surfaces the
// config-sourced mood + sore-zone option lists so the UI hardcodes neither. No I/O.

// The signal columns that constitute an actual check-in (identity/metadata excluded).
const CHECKIN_FIELDS = ['sleep_quality', 'sleep_hours', 'energy', 'stress', 'mood', 'note'];

/**
 * @param {object} args
 * @param {object|null} [args.row]  the persisted recovery_log row, or null/empty when none
 * @param {string|null} [args.date]  the day in YYYY-MM-DD
 * @param {boolean} [args.editable]  true when `date` falls in the current ISO week
 * @param {string[]} [args.moodOptions]  allowed mood keys (config-sourced)
 * @param {string[]} [args.soreZoneList]  allowed sore-zone keys (config-sourced)
 * @returns {{ date, editable, checkin: object|null, options: { moods, sore_zones } }}
 */
export function build({
  row,
  date = null,
  editable = false,
  moodOptions = [],
  soreZoneList = [],
} = {}) {
  return {
    date,
    editable: Boolean(editable),
    checkin: projectCheckin(row),
    options: { moods: moodOptions, sore_zones: soreZoneList },
  };
}

function projectCheckin(row) {
  if (!row || !hasSignal(row)) return null;
  return {
    sleep_quality: row.sleep_quality ?? null,
    sleep_hours: row.sleep_hours ?? null,
    energy: row.energy ?? null,
    stress: row.stress ?? null,
    mood: row.mood ?? null,
    sore_zones: Array.isArray(row.sore_zones) ? row.sore_zones : [],
    note: row.note ?? null,
  };
}

// A row is a real check-in when it carries at least one signal value (a scalar field
// that is present and non-null, or a non-empty sore_zones set). Identity/metadata-only
// rows (id/athlete_id/logged_on/created_at) read as "no check-in".
function hasSignal(row) {
  if (CHECKIN_FIELDS.some((f) => row[f] !== undefined && row[f] !== null)) return true;
  return Array.isArray(row.sore_zones) && row.sore_zones.length > 0;
}

// Phase 2 US5 (T073): pure CSV serializer with RFC 4180 quoting.
// Header row always emitted, even when sessions is empty.

const HEADER = [
  'session_id',
  'started_at',
  'completed_at',
  'day_of_week',
  'muscle_group',
  'exercise_slug',
  'set_index',
  'weight_kg',
  'reps',
  'rpe',
];

function quote(value, separator) {
  if (value == null) return '';
  const str = String(value);
  // RFC 4180: quote if value contains separator, quote, or newline.
  if (str.includes(separator) || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * @param {Array<object>} sessions — flat rows; one per (session, exercise, set).
 * @param {{ separator?: string }} options
 */
export function serializeSessionsCsv(sessions = [], { separator = ',' } = {}) {
  const sep = separator || ',';
  const headerLine = HEADER.join(sep);
  if (!sessions.length) return `${headerLine}\n`;
  const lines = sessions.map((row) =>
    HEADER.map((col) => quote(row[col], sep)).join(sep),
  );
  return [headerLine, ...lines].join('\n') + '\n';
}

export const SESSIONS_CSV_HEADER = HEADER;

// Pure — month-over-month measurement math for the body-tracking measurements
// table (Phase 6, research D-5). `monthlyLatest` collapses a weigh-in history to
// one representative value per measurement per month (the value from the latest
// measured_on in that month that is non-null for the field); `monthOverMonthDeltas`
// compares each field strictly against the immediately-preceding month bucket
// signs each field against the immediately-preceding month bucket, or null when
// either side is missing (FR-022/FR-023). No clock, no I/O, no globals
// (Constitution II + V) — the caller supplies the entries.

/** The eight tracked weigh-in fields (weight + seven circumferences). */
export const MEASUREMENT_FIELDS = Object.freeze([
  'weight_kg',
  'arm_cm',
  'chest_cm',
  'thigh_cm',
  'shoulder_cm',
  'waist_cm',
  'neck_cm',
  'hip_cm',
]);

function monthKey(measuredOn) {
  // measured_on is an ISO 'YYYY-MM-DD' string; the YYYY-MM prefix is the bucket.
  return String(measuredOn).slice(0, 7);
}

/**
 * Bucket weigh-in entries to one latest non-null value per field per month (D-5).
 * For each {month, field}, picks the value from the most recent measured_on in that
 * month that is non-null for that field; a field absent across the whole month is
 * omitted from the bucket entirely.
 * @param {Array<{ measured_on: string }>} entries
 * @returns {Object<string, Object<string, number>>}  { 'YYYY-MM': { field: value } }
 */
export function monthlyLatest(entries = []) {
  // For each month/field track the value paired with the latest date it was seen.
  const latestSeen = {}; // { month: { field: { date, value } } }

  for (const entry of entries) {
    if (!entry || entry.measured_on == null) continue;
    const month = monthKey(entry.measured_on);
    const date = String(entry.measured_on);
    const bucket = (latestSeen[month] ||= {});

    for (const field of MEASUREMENT_FIELDS) {
      const value = entry[field];
      if (value == null) continue;
      const prev = bucket[field];
      if (!prev || date >= prev.date) {
        bucket[field] = { date, value: Number(value) };
      }
    }
  }

  const monthly = {};
  for (const [month, fields] of Object.entries(latestSeen)) {
    const out = {};
    for (const [field, { value }] of Object.entries(fields)) {
      out[field] = value;
    }
    monthly[month] = out;
  }
  return monthly;
}

/**
 * Per month, per field, the signed delta versus the **immediately-preceding month
 * bucket** (FR-022). Null when either the current month or its immediate predecessor
 * lacks the value (FR-023/SC-005) — the comparison never bridges a gap month, so a
 * field present, then absent, then present again yields null on its return (the
 * directly-prior month had no value). The chronologically first month has no
 * predecessor, so all its present fields are null.
 * @param {Object<string, Object<string, number>>} monthly  output of monthlyLatest
 * @returns {Object<string, Object<string, number|null>>}
 */
export function monthOverMonthDeltas(monthly = {}) {
  const months = Object.keys(monthly).sort();
  const deltas = {};

  for (let i = 0; i < months.length; i++) {
    const month = months[i];
    const row = (deltas[month] ||= {});
    const prevMonth = i > 0 ? months[i - 1] : null;
    const prev = prevMonth ? monthly[prevMonth] : {};

    for (const field of MEASUREMENT_FIELDS) {
      const current = monthly[month][field];
      if (current == null) {
        // field absent this month — nothing to report.
        continue;
      }
      const prevValue = prev[field];
      // Compare only against the immediately-preceding month bucket; if that month
      // lacks the field, there is no prior-month value, so the delta is null.
      row[field] = prevValue == null ? null : current - prevValue;
    }
  }

  return deltas;
}

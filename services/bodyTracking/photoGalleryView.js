// Pure presenter — compose the progress-photo gallery (FR-024). Maps athlete_photos
// rows (date-desc, as returned by the DAO) into view-model items, resolving each
// storage_key to a served URL via the injected `url` adapter (photoStorage.url).
// No I/O, no globals — the caller passes the url() function in.

/**
 * @param {object} args
 * @param {Array<{ id, taken_on, storage_key, weight_overlay_kg, note }>} args.rows
 *   athlete_photos rows, date-desc (order preserved as-is)
 * @param {(key: string) => string} args.url  storage-key → served URL (photoStorage.url)
 * @returns {{ items: Array<{ id, takenOn, weightKg, url, note }> }}
 */
export function build({ rows = [], url } = {}) {
  const items = rows.map((row) => ({
    id: row.id,
    takenOn: row.taken_on,
    weightKg: row.weight_overlay_kg ?? null,
    url: url(row.storage_key),
    note: row.note ?? null,
  }));
  return { items };
}

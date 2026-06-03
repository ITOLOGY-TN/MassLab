/**
 * Pure custom-food slug helper (FR-002a reconciliation).
 *
 * Deterministic: no wall-clock, no randomness. Two spellings of the same name
 * that differ only by case or diacritics produce the same slug, so a duplicate
 * custom food reconciles onto the same `(athlete_id, slug, locale)` row.
 */

/**
 * Slugify a food name.
 *
 * - lowercases
 * - strips diacritics (NFD decomposition + combining-mark removal)
 * - replaces any run of non-alphanumeric characters with a single hyphen
 * - trims leading/trailing hyphens
 * - idempotent
 *
 * @param {string} name
 * @returns {string}
 */
export function slugify(name) {
  return String(name)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

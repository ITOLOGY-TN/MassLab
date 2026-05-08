// Phase 2 — pure unit-conversion helpers (FR-016, SC-006).
// kg ↔ lbs round-trip drift bounded to ±0.05 kg across 30–250 kg.
const KG_PER_LB = 0.45359237;

export function kgToLbs(kg) {
  if (kg == null || Number.isNaN(kg)) return null;
  return Number((kg / KG_PER_LB).toFixed(2));
}

export function lbsToKg(lbs) {
  if (lbs == null || Number.isNaN(lbs)) return null;
  return Number((lbs * KG_PER_LB).toFixed(2));
}

export function formatWeight(value, unit) {
  if (value == null || Number.isNaN(value)) return '—';
  const display = unit === 'lbs' ? kgToLbs(value) : Number(value).toFixed(1);
  const suffix = unit === 'lbs' ? 'lbs' : 'kg';
  return `${display} ${suffix}`;
}

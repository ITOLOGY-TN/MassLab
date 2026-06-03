// Phase 2 — pure unit-conversion helpers (FR-016, SC-006).
// Phase 6 (T043, FR-028) extends these with a length (cm/in) formatter so the
// body screens render the athlete's preferred units WITHOUT ever changing the
// stored/API values — every conversion here is display-only.
// kg ↔ lbs round-trip drift bounded to ±0.05 kg across 30–250 kg.
const KG_PER_LB = 0.45359237;
const CM_PER_IN = 2.54;

export function kgToLbs(kg) {
  if (kg == null || Number.isNaN(kg)) return null;
  return Number((kg / KG_PER_LB).toFixed(2));
}

export function lbsToKg(lbs) {
  if (lbs == null || Number.isNaN(lbs)) return null;
  return Number((lbs * KG_PER_LB).toFixed(2));
}

export function cmToIn(cm) {
  if (cm == null || Number.isNaN(cm)) return null;
  return Number((cm / CM_PER_IN).toFixed(1));
}

// The athlete's weight-unit preference ('kg' | 'lbs') drives length display too:
// metric → cm, imperial → in. There is one preference toggle, not two.
export function weightSuffix(unit) {
  return unit === 'lbs' ? 'lbs' : 'kg';
}

export function lengthSuffix(unit) {
  return unit === 'lbs' ? 'in' : 'cm';
}

// Convert a stored kg value to the preferred unit's numeric magnitude (no suffix).
export function displayWeight(value, unit) {
  if (value == null || Number.isNaN(Number(value))) return null;
  return unit === 'lbs' ? kgToLbs(Number(value)) : Number(Number(value).toFixed(1));
}

// Convert a stored cm value to the preferred unit's numeric magnitude (no suffix).
export function displayLength(value, unit) {
  if (value == null || Number.isNaN(Number(value))) return null;
  return unit === 'lbs' ? cmToIn(Number(value)) : Number(Number(value).toFixed(1));
}

export function formatWeight(value, unit) {
  const display = displayWeight(value, unit);
  if (display == null) return '—';
  return `${display} ${weightSuffix(unit)}`;
}

export function formatLength(value, unit) {
  const display = displayLength(value, unit);
  if (display == null) return '—';
  return `${display} ${lengthSuffix(unit)}`;
}

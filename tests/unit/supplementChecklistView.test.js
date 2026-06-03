import { describe, it, expect } from 'vitest';
import { build } from '../../services/supplements/checklistView.js';

// Phase 8 (011-phase8-supplements) T009 — pure checklist presenter (FR-001/FR-004/
// FR-007/FR-008). One item per catalogue supplement, in catalogue order, with the
// day's taken-state, the per-supplement streak, and is_primary for the configured
// primary slug. Renders the empty (nothing-taken) shape without error.

const CATALOGUE = [
  { id: 1, slug: 'creatine-monohydrate', name: 'Créatine', dosage: '5 g', recommended_time: 'morning' },
  { id: 2, slug: 'omega-3', name: 'Oméga-3', dosage: '2 g', recommended_time: 'with_meal' },
];

describe('checklistView.build', () => {
  it('maps each catalogue supplement in order with taken, streak, and is_primary', () => {
    const view = build({
      catalogue: CATALOGUE,
      takenIds: new Set([1]),
      streaks: { 1: 14, 2: 0 },
      primarySlug: 'creatine-monohydrate',
      date: '2026-06-03',
    });
    expect(view.date).toBe('2026-06-03');
    expect(view.supplements).toHaveLength(2);

    const [creatine, omega] = view.supplements;
    expect(creatine).toMatchObject({
      id: 1,
      slug: 'creatine-monohydrate',
      name: 'Créatine',
      dosage: '5 g',
      recommended_time: 'morning',
      taken: true,
      streak: 14,
      is_primary: true,
    });
    expect(omega).toMatchObject({ id: 2, taken: false, streak: 0, is_primary: false });
  });

  it('defaults taken=false and streak=0 when no data is supplied (empty state)', () => {
    const view = build({ catalogue: CATALOGUE, date: '2026-06-03' });
    expect(view.supplements.every((s) => s.taken === false && s.streak === 0)).toBe(true);
  });

  it('renders an empty supplements array when the catalogue is empty', () => {
    const view = build({ catalogue: [], date: '2026-06-03' });
    expect(view.supplements).toEqual([]);
  });
});

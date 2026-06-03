import { describe, it, expect } from 'vitest';
import { build } from '../../services/supplements/weekGridView.js';

// Phase 8 (011-phase8-supplements) T025 — pure weekly-grid presenter (FR-009/FR-010/
// FR-011). Builds week_start (ISO Monday), the 7 days, and one row per catalogue
// supplement with 7 classified cells. A no-record week splits missed/upcoming at today.

const CATALOGUE = [
  { id: 1, slug: 'creatine-monohydrate', name: 'Créatine' },
  { id: 2, slug: 'omega-3', name: 'Oméga-3' },
];

describe('weekGridView.build', () => {
  it('builds days + one row per supplement with classified cells', () => {
    const view = build({
      catalogue: CATALOGUE,
      takenRows: [
        { supplement_id: 1, logged_on: '2026-06-01' },
        { supplement_id: 1, logged_on: '2026-06-03' },
      ],
      weekStart: '2026-06-01',
      asOf: '2026-06-03',
    });

    expect(view.week_start).toBe('2026-06-01');
    expect(view.days).toHaveLength(7);
    expect(view.days[0]).toBe('2026-06-01');
    expect(view.rows).toHaveLength(2);

    const creatine = view.rows.find((r) => r.supplement_id === 1);
    const byDate = Object.fromEntries(creatine.cells.map((c) => [c.date, c.status]));
    expect(byDate['2026-06-01']).toBe('taken');
    expect(byDate['2026-06-02']).toBe('missed'); // elapsed, no record
    expect(byDate['2026-06-03']).toBe('taken');
    expect(byDate['2026-06-04']).toBe('upcoming'); // future
    expect(byDate['2026-06-07']).toBe('upcoming');

    // Omega-3 has no records: missed for elapsed days, upcoming from today on.
    const omega = view.rows.find((r) => r.supplement_id === 2);
    const omegaByDate = Object.fromEntries(omega.cells.map((c) => [c.date, c.status]));
    expect(omegaByDate['2026-06-01']).toBe('missed');
    expect(omegaByDate['2026-06-02']).toBe('missed');
    expect(omegaByDate['2026-06-03']).toBe('upcoming'); // today, not taken
    expect(omegaByDate['2026-06-04']).toBe('upcoming');
  });

  it('renders a future week entirely as upcoming', () => {
    const view = build({
      catalogue: CATALOGUE,
      takenRows: [],
      weekStart: '2026-06-08',
      asOf: '2026-06-03',
    });
    const statuses = view.rows.flatMap((r) => r.cells.map((c) => c.status));
    expect(statuses.every((s) => s === 'upcoming')).toBe(true);
  });
});

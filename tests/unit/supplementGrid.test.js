import { describe, it, expect } from 'vitest';
import { cellStatus } from '../../services/engine/supplementGrid.js';

// Phase 8 (011-phase8-supplements) T024 — pure grid cell classification (research
// D-7). taken = a record exists; missed = a fully-elapsed day with no record;
// upcoming = today not-yet-taken, or any future day. "missed" is retrospective-only
// and never penalizes time that hasn't happened.

const ASOF = '2026-06-03';

describe('cellStatus', () => {
  const taken = new Set(['2026-06-01', '2026-06-03']);

  it('is taken when a record exists for that day', () => {
    expect(cellStatus('2026-06-01', taken, { asOf: ASOF })).toBe('taken');
    expect(cellStatus('2026-06-03', taken, { asOf: ASOF })).toBe('taken');
  });

  it('is missed for a fully-elapsed day with no record', () => {
    expect(cellStatus('2026-06-02', taken, { asOf: ASOF })).toBe('missed');
  });

  it('is upcoming for today when not yet taken', () => {
    expect(cellStatus('2026-06-03', new Set(), { asOf: ASOF })).toBe('upcoming');
  });

  it('is upcoming for any future day', () => {
    expect(cellStatus('2026-06-04', taken, { asOf: ASOF })).toBe('upcoming');
    expect(cellStatus('2026-06-07', new Set(), { asOf: ASOF })).toBe('upcoming');
  });
});

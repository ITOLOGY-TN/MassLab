// Phase 6 (009-body-weight-measurements) T007 [US1] — the at-least-one-value
// refine on bodyMeasurementSchema (FR-003): a weigh-in must carry a weight or at
// least one circumference; a note alone (or nothing) is rejected.
import { describe, it, expect } from 'vitest';
import { bodyMeasurementSchema } from '../../services/engine/inputSchemas.js';

describe('bodyMeasurementSchema — at-least-one-value refine (FR-003)', () => {
  it('accepts a weight-only weigh-in', () => {
    const parsed = bodyMeasurementSchema.safeParse({
      measured_on: '2026-06-03',
      weight_kg: 60,
    });
    expect(parsed.success).toBe(true);
  });

  it('accepts a single circumference with no weight', () => {
    const parsed = bodyMeasurementSchema.safeParse({
      measured_on: '2026-06-03',
      arm_cm: 38,
    });
    expect(parsed.success).toBe(true);
  });

  it('accepts a weight plus circumferences plus a note', () => {
    const parsed = bodyMeasurementSchema.safeParse({
      measured_on: '2026-06-03',
      weight_kg: 60,
      chest_cm: 104,
      waist_cm: 78,
      note: 'morning, fasted',
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects a note-only weigh-in (no weight, no circumference)', () => {
    const parsed = bodyMeasurementSchema.safeParse({
      measured_on: '2026-06-03',
      note: 'felt strong today',
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects an empty weigh-in (date only)', () => {
    const parsed = bodyMeasurementSchema.safeParse({
      measured_on: '2026-06-03',
    });
    expect(parsed.success).toBe(false);
  });
});

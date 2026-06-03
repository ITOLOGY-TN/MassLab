import { describe, it, expect } from 'vitest';
import { build } from '../../services/bodyTracking/measurementsTableView.js';

const FIELDS = ['arm_cm', 'chest_cm', 'thigh_cm', 'shoulder_cm', 'waist_cm', 'neck_cm', 'hip_cm'];

describe('measurementsTableView.build', () => {
  it('emits month rows in chronological order with value + delta + direction', () => {
    const measurements = [
      { measured_on: '2026-05-20', arm_cm: 38.5, waist_cm: 79.0 },
      { measured_on: '2026-04-10', arm_cm: 37.8, waist_cm: 80.2 },
    ];
    const vm = build({ measurements, fields: FIELDS });
    expect(vm.months.map((m) => m.month)).toEqual(['2026-04', '2026-05']);

    const may = vm.months[1];
    expect(may.fields.arm_cm.value).toBe(38.5);
    expect(may.fields.arm_cm.delta).toBeCloseTo(0.7, 5);
    expect(may.fields.arm_cm.direction).toBe('up');
    expect(may.fields.waist_cm.value).toBe(79.0);
    expect(may.fields.waist_cm.delta).toBeCloseTo(-1.2, 5);
    expect(may.fields.waist_cm.direction).toBe('down');
  });

  it('sets direction from the sign of the delta; flat when delta is exactly 0', () => {
    const measurements = [
      { measured_on: '2026-04-10', chest_cm: 100.0 },
      { measured_on: '2026-05-10', chest_cm: 100.0 },
    ];
    const vm = build({ measurements, fields: FIELDS });
    expect(vm.months[1].fields.chest_cm).toEqual({ value: 100.0, delta: 0, direction: 'flat' });
  });

  it('omits delta (null) and marks direction flat when there is no prior-month value (FR-023)', () => {
    const measurements = [
      { measured_on: '2026-04-10', arm_cm: 37.0 },
      { measured_on: '2026-05-10', arm_cm: 38.0, chest_cm: 101.0 },
    ];
    const vm = build({ measurements, fields: FIELDS });
    const may = vm.months[1];
    expect(may.fields.arm_cm).toEqual({ value: 38.0, delta: 1.0, direction: 'up' });
    // chest first appears in May → no prior value → null delta, flat direction
    expect(may.fields.chest_cm).toEqual({ value: 101.0, delta: null, direction: 'flat' });
  });

  it('single month of data: values present, no delta populated, no error', () => {
    const measurements = [{ measured_on: '2026-05-10', arm_cm: 38.0, waist_cm: 79.0 }];
    const vm = build({ measurements, fields: FIELDS });
    expect(vm.months).toHaveLength(1);
    const only = vm.months[0];
    expect(only.month).toBe('2026-05');
    expect(only.fields.arm_cm).toEqual({ value: 38.0, delta: null, direction: 'flat' });
    expect(only.fields.waist_cm).toEqual({ value: 79.0, delta: null, direction: 'flat' });
  });

  it('only includes fields that have a value in a given month', () => {
    const measurements = [{ measured_on: '2026-05-10', arm_cm: 38.0 }];
    const vm = build({ measurements, fields: FIELDS });
    const only = vm.months[0];
    expect(Object.keys(only.fields)).toEqual(['arm_cm']);
  });

  it('renders an empty months array for no measurements', () => {
    expect(build({ measurements: [], fields: FIELDS })).toEqual({ months: [] });
    expect(build({})).toEqual({ months: [] });
  });

  it('defaults to the full circumference field set when fields are not supplied', () => {
    const measurements = [
      {
        measured_on: '2026-05-10',
        arm_cm: 38,
        chest_cm: 100,
        thigh_cm: 55,
        shoulder_cm: 120,
        waist_cm: 78,
        neck_cm: 40,
        hip_cm: 95,
      },
    ];
    const vm = build({ measurements });
    expect(Object.keys(vm.months[0].fields).sort()).toEqual([...FIELDS].sort());
  });
});

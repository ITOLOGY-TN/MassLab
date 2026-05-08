import { describe, it, expect } from 'vitest';
import { validateEnvelope } from '../../services/dataManagement/backupSchema.js';

const okEnvelope = {
  _export: {
    schema_version: 1,
    engine_version: '1.0.0',
    exported_at: '2026-05-08T00:00:00Z',
    athlete_id: '00000000-0000-0000-0000-000000000001',
  },
  athletes: [],
  app_config: [],
  exercises: [],
  muscle_groups: [],
  weekly_plan_slots: [],
  weekly_plan_exercises: [],
};

describe('backupSchema', () => {
  it('accepts a known-good v1 envelope', () => {
    const r = validateEnvelope(okEnvelope);
    expect(r.success).toBe(true);
  });

  it('rejects when _export.schema_version is missing', () => {
    const bad = { ...okEnvelope, _export: { ...okEnvelope._export } };
    delete bad._export.schema_version;
    expect(validateEnvelope(bad).success).toBe(false);
  });

  it('rejects when a required collection is missing', () => {
    const bad = { ...okEnvelope };
    delete bad.muscle_groups;
    expect(validateEnvelope(bad).success).toBe(false);
  });

  it('rejects when athlete_id is not a UUID', () => {
    const bad = {
      ...okEnvelope,
      _export: { ...okEnvelope._export, athlete_id: 'not-a-uuid' },
    };
    expect(validateEnvelope(bad).success).toBe(false);
  });
});

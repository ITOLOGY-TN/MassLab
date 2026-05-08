import { describe, it, expect } from 'vitest';
import { buildEnvelope } from '../../services/dataManagement/exporter.js';

const records = {
  athletes: [{ id: 'a', display_name: 'Test', auth_user_id: 'should-be-stripped' }],
  app_config: [{ athlete_id: 'a', theme: 'dark' }],
  exercises: [],
  muscle_groups: [{ id: 1, athlete_id: 'a', slug: 'test', name: 'Test' }],
  weekly_plan_slots: [],
  weekly_plan_exercises: [],
  body_measurements: [{ id: 9, athlete_id: 'a', measured_on: '2026-05-08' }],
};

describe('dataManagement.exporter.buildEnvelope', () => {
  it('emits the v1 envelope with required collections', () => {
    const env = buildEnvelope(records, { engineVersion: '1.0.0', athleteId: 'a' });
    expect(env._export.schema_version).toBe(1);
    expect(env._export.engine_version).toBe('1.0.0');
    expect(env._export.athlete_id).toBe('a');
    for (const k of [
      'athletes',
      'app_config',
      'exercises',
      'muscle_groups',
      'weekly_plan_slots',
      'weekly_plan_exercises',
    ]) {
      expect(env).toHaveProperty(k);
    }
  });

  it('strips secret-tagged keys (auth_user_id)', () => {
    const env = buildEnvelope(records, { engineVersion: '1.0.0', athleteId: 'a' });
    expect(env.athletes[0]).not.toHaveProperty('auth_user_id');
  });

  it('passes through extra collections (e.g. body_measurements)', () => {
    const env = buildEnvelope(records, { engineVersion: '1.0.0', athleteId: 'a' });
    expect(env.body_measurements).toEqual(records.body_measurements);
  });

  it('throws when meta is incomplete', () => {
    expect(() => buildEnvelope({}, { engineVersion: '1.0.0' })).toThrow(/athleteId/);
    expect(() => buildEnvelope({}, { athleteId: 'a' })).toThrow(/engineVersion/);
  });

  it('is deterministic for the same input (idempotent except exported_at)', () => {
    const env1 = buildEnvelope(records, {
      engineVersion: '1.0.0',
      athleteId: 'a',
      exportedAt: '2026-05-08T00:00:00Z',
    });
    const env2 = buildEnvelope(records, {
      engineVersion: '1.0.0',
      athleteId: 'a',
      exportedAt: '2026-05-08T00:00:00Z',
    });
    expect(env1).toEqual(env2);
  });
});

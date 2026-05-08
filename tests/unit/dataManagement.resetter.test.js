import { describe, it, expect, vi } from 'vitest';
import { resetModule } from '../../services/dataManagement/resetter.js';

function makeDaos(overrides = {}) {
  return {
    reset: {
      resetModule: vi.fn().mockResolvedValue({ session_journal: 3, session_sets: 12 }),
      resetPreferencesAndOverrides: vi.fn().mockResolvedValue({ app_config: 1 }),
      deleteAllExceptProfile: vi
        .fn()
        .mockResolvedValue({ session_journal: 3, weekly_plan_slots: 5, app_config: 1 }),
      ...overrides.reset,
    },
    exporters: {
      readAllForAthlete: vi.fn().mockResolvedValue({
        athletes: [{ id: 'a' }],
        app_config: [],
        exercises: [],
        muscle_groups: [],
        weekly_plan_slots: [],
        weekly_plan_exercises: [],
      }),
      ...overrides.exporters,
    },
  };
}

describe('dataManagement.resetter', () => {
  it('module=sessions delegates to reset.resetModule(sessions)', async () => {
    const daos = makeDaos();
    const result = await resetModule({
      athleteId: 'a',
      module: 'sessions',
      daos,
      engineVersion: '1.0.0',
    });
    expect(daos.reset.resetModule).toHaveBeenCalledWith('a', 'sessions');
    expect(result.deleted_counts.session_journal).toBe(3);
    expect(result.module).toBe('sessions');
  });

  it('module=preferences delegates to resetPreferencesAndOverrides', async () => {
    const daos = makeDaos();
    const result = await resetModule({
      athleteId: 'a',
      module: 'preferences',
      daos,
      engineVersion: '1.0.0',
    });
    expect(daos.reset.resetPreferencesAndOverrides).toHaveBeenCalledOnce();
    expect(result.deleted_counts.app_config).toBe(1);
  });

  it('module=all wipes everything except profile', async () => {
    const daos = makeDaos();
    const result = await resetModule({
      athleteId: 'a',
      module: 'all',
      daos,
      engineVersion: '1.0.0',
    });
    expect(daos.reset.deleteAllExceptProfile).toHaveBeenCalledOnce();
    expect(result.module).toBe('all');
  });

  it('exportFirst=true on full reset emits a data: URL before wiping', async () => {
    const daos = makeDaos();
    const result = await resetModule({
      athleteId: 'a',
      module: 'all',
      exportFirst: true,
      daos,
      engineVersion: '1.0.0',
    });
    expect(result.export_url).toMatch(/^data:application\/json;base64,/);
    expect(daos.exporters.readAllForAthlete).toHaveBeenCalledOnce();
  });
});

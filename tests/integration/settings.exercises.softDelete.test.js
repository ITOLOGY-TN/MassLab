// Phase 2 US3 (T042): exercises soft-delete vs hard-delete decision.
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { loadConfig, ConfigError } from '../../config/index.js';
import { getSupabase, _resetSupabaseCache } from '../../services/dataAccess/supabaseClient.js';
import { buildApp } from '../../app.js';

let app;
let supabase;
let live = false;

beforeAll(async () => {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      console.warn('[exercises.softDelete] skipped — .env not configured');
      return;
    }
    throw err;
  }
  _resetSupabaseCache();
  supabase = getSupabase(config);
  const probe = await supabase.from('exercises').select('id').limit(1);
  if (probe.error) {
    console.warn('[exercises.softDelete] skipped — Supabase unreachable');
    return;
  }
  app = buildApp({ config });
  live = true;
});

describe('US3 — exercises soft/hard delete', () => {
  it('DELETE on a row referenced by weekly_plan_exercises soft-archives', async () => {
    if (!live) return;
    // Find any exercise referenced by a slot.
    const planRes = await request(app).get('/api/v1/me/schedule');
    const exId = planRes.body.data.slots
      .flatMap((s) => s.exercises ?? [])
      .map((e) => e.exercise_id)
      .find(Boolean);
    expect(exId).toBeDefined();

    const del = await request(app).delete(`/api/v1/exercises/${exId}`);
    expect(del.status).toBe(204);

    const archived = await request(app).get('/api/v1/exercises?include_archived=1');
    const found = archived.body.data.find((e) => e.id === exId);
    expect(found).toBeDefined();
    expect(found.is_active).toBe(false);

    // Restore for stability.
    await supabase.from('exercises').update({ is_active: true }).eq('id', exId);
  });

  it('DELETE on an unreferenced exercise hard-removes', async () => {
    if (!live) return;
    const created = await request(app)
      .post('/api/v1/exercises')
      .send({
        name: `Test ${Date.now()}`,
        targeted_muscles: ['biceps'],
        instructions: 'temp',
      });
    expect(created.status).toBe(201);
    const id = created.body.data.id;
    const del = await request(app).delete(`/api/v1/exercises/${id}`);
    expect(del.status).toBe(204);
    const all = await request(app).get('/api/v1/exercises?include_archived=1');
    expect(all.body.data.find((e) => e.id === id)).toBeUndefined();
  });

  it('default GET hides archived rows', async () => {
    if (!live) return;
    const list = await request(app).get('/api/v1/exercises');
    expect(list.body.data.every((e) => e.is_active === true)).toBe(true);
  });
});

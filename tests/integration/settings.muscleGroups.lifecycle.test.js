// Phase 2 US2 (T028): muscle-groups lifecycle — create → patch → delete (hard
// for unreferenced rows). Merge + soft-archive on referenced rows are exercised
// implicitly by leaving the seeded catalogue alone (those rows are referenced
// by weekly_plan_slots so DELETE there would soft-archive them).
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
      console.warn('[muscleGroups.lifecycle] skipped — .env not configured');
      return;
    }
    throw err;
  }
  _resetSupabaseCache();
  supabase = getSupabase(config);
  const probe = await supabase.from('muscle_groups').select('id').limit(1);
  if (probe.error) {
    console.warn('[muscleGroups.lifecycle] skipped — Supabase unreachable:', probe.error.message);
    return;
  }
  app = buildApp({ config });
  live = true;
});

describe('US2 — muscle-groups lifecycle', () => {
  it('create → patch (rename) → DELETE hard-removes when unreferenced', async () => {
    if (!live) return;
    const stamp = Date.now();
    const created = await request(app)
      .post('/api/v1/muscle-groups')
      .send({ name: `Lifecycle ${stamp}` });
    expect(created.status).toBe(201);
    const id = created.body.data.id;

    const patched = await request(app)
      .patch(`/api/v1/muscle-groups/${id}`)
      .send({ name: `Lifecycle ${stamp} renamed`, display_color: '#112233' });
    expect(patched.status).toBe(200);
    expect(patched.body.data.name).toBe(`Lifecycle ${stamp} renamed`);
    expect(patched.body.data.display_color).toBe('#112233');

    const removed = await request(app).delete(`/api/v1/muscle-groups/${id}`);
    expect(removed.status).toBe(204);

    const afterList = await request(app).get('/api/v1/muscle-groups?include_archived=1');
    expect(afterList.body.data.find((mg) => mg.id === id)).toBeUndefined();
  });

  it('DELETE on a row referenced by weekly_plan_slots soft-archives instead of hard-deleting', async () => {
    if (!live) return;
    // Pick a muscle group that we know is referenced by walking the schedule.
    const sched = await request(app).get('/api/v1/me/schedule');
    expect(sched.body.data.slots.length).toBeGreaterThan(0);
    const referencedId = sched.body.data.slots[0].muscle_group_id;
    const list = await request(app).get('/api/v1/muscle-groups');
    const referenced = list.body.data.find((mg) => mg.id === referencedId);
    expect(referenced).toBeDefined();

    const removed = await request(app).delete(`/api/v1/muscle-groups/${referenced.id}`);
    expect(removed.status).toBe(204);

    const archivedList = await request(app).get('/api/v1/muscle-groups?include_archived=1');
    const found = archivedList.body.data.find((mg) => mg.id === referenced.id);
    expect(found).toBeDefined();
    expect(found.is_active).toBe(false);

    // Restore so subsequent runs don't see the row archived. We poke the DB
    // directly rather than going through PATCH /muscle-groups/:id — that
    // re-derives the slug from `name`, which over many test runs accumulates
    // orphan rows when the seed re-creates the canonical slug.
    await supabase
      .from('muscle_groups')
      .update({ is_active: true, archived_at: null })
      .eq('id', referenced.id);
  });
});

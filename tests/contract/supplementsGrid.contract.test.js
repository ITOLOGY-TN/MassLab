import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { loadConfig, ConfigError } from '../../config/index.js';
import { getSupabase, _resetSupabaseCache } from '../../services/dataAccess/supabaseClient.js';
import { buildApp } from '../../app.js';

// Phase 8 (011-phase8-supplements) T026 — contract for the weekly grid. Read-only.
// Live-gated: skips when .env is missing, Supabase is unreachable, or the Phase 8
// supplement_intake_log migration is unapplied.
let app;
let live = false;

beforeAll(async () => {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      console.warn('[supplementsGrid.contract] skipped — .env not configured');
      return;
    }
    throw err;
  }
  _resetSupabaseCache();
  const supabase = getSupabase(config);
  const probe = await supabase.from('athletes').select('id').limit(1);
  if (probe.error) {
    console.warn('[supplementsGrid.contract] skipped — Supabase unreachable');
    return;
  }
  const mig = await supabase.from('supplement_intake_log').select('id').limit(1);
  if (mig.error) {
    console.warn('[supplementsGrid.contract] skipped — Phase 8 migration not applied');
    return;
  }
  app = buildApp({ config, supabase });
  live = true;
});

const STATUSES = ['taken', 'missed', 'upcoming'];

describe('contract: supplements weekly grid', () => {
  it('GET /supplements/grid returns the WeekGrid envelope', async () => {
    if (!live) return;
    const res = await request(app).get('/api/v1/supplements/grid');
    expect(res.status).toBe(200);
    const { data } = res.body;
    expect(typeof data.week_start).toBe('string');
    expect(Array.isArray(data.days)).toBe(true);
    expect(data.days).toHaveLength(7);
    expect(Array.isArray(data.rows)).toBe(true);
    for (const row of data.rows) {
      expect(row).toHaveProperty('supplement_id');
      expect(row).toHaveProperty('name');
      expect(row.cells).toHaveLength(7);
      for (const cell of row.cells) {
        expect(cell).toHaveProperty('date');
        expect(STATUSES).toContain(cell.status);
      }
    }
  });

  it('GET /supplements/grid?week= snaps an arbitrary date to its ISO Monday', async () => {
    if (!live) return;
    // 2026-06-03 (a Wednesday) → ISO Monday 2026-06-01.
    const res = await request(app).get('/api/v1/supplements/grid?week=2026-06-03');
    expect(res.status).toBe(200);
    expect(res.body.data.week_start).toBe('2026-06-01');
  });

  it('GET /supplements/grid with a malformed week date → 400', async () => {
    if (!live) return;
    const res = await request(app).get('/api/v1/supplements/grid?week=not-a-date');
    expect(res.status).toBe(400);
    expect(res.body.error).toHaveProperty('code');
  });

  it('GET /supplements/grid with an invalid calendar date → 400', async () => {
    if (!live) return;
    // 2026-02-30 matches the date regex but is not real — must be rejected.
    const res = await request(app).get('/api/v1/supplements/grid?week=2026-02-30');
    expect(res.status).toBe(400);
    expect(res.body.error).toHaveProperty('code');
  });
});

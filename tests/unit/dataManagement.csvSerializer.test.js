import { describe, it, expect } from 'vitest';
import { serializeSessionsCsv } from '../../services/dataManagement/csvSerializer.js';

describe('dataManagement.csvSerializer', () => {
  it('emits header-only when sessions is empty', () => {
    const csv = serializeSessionsCsv([]);
    expect(csv).toMatch(/^session_id,started_at,/);
    expect(csv.split('\n').filter(Boolean)).toHaveLength(1);
  });

  it('escapes commas, quotes, and newlines per RFC 4180', () => {
    const csv = serializeSessionsCsv([
      {
        session_id: 1,
        started_at: '2026-05-08',
        completed_at: '2026-05-08',
        day_of_week: 1,
        muscle_group: 'Chest, Triceps',
        exercise_slug: 'with "quotes"',
        set_index: 1,
        weight_kg: 60,
        reps: 8,
        rpe: 'newline\nin value',
      },
    ]);
    expect(csv).toContain('"Chest, Triceps"');
    expect(csv).toContain('"with ""quotes"""');
    expect(csv).toContain('"newline\nin value"');
  });

  it('honours a custom separator', () => {
    const csv = serializeSessionsCsv([], { separator: ';' });
    expect(csv.split('\n')[0]).toContain(';');
  });
});

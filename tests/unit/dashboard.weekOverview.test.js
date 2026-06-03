import { describe, it, expect } from 'vitest';
import { build } from '../../services/dashboard/weekOverview.js';

// Phase 10 (013-phase10-dashboard) T007 — pure 7-day week-overview presenter
// (data-model §3b, US1). For each of the 7 ISO-week days it derives a status:
//   - done = a finished session that day,
//   - rest = the ISO weekday is not a scheduled training day,
//   - todo = a scheduled training day with no finished session (INCLUDING future
//     days — never "missed").
// Pure: `asOf` (server "today", YYYY-MM-DD) is injected; no clock, no I/O.

// Monday 2026-06-01 … Sunday 2026-06-07 (ISO weekdays 1…7).
const WEEK = [
  '2026-06-01', // Mon (1)
  '2026-06-02', // Tue (2)
  '2026-06-03', // Wed (3)
  '2026-06-04', // Thu (4)
  '2026-06-05', // Fri (5)
  '2026-06-06', // Sat (6)
  '2026-06-07', // Sun (7)
];

describe('weekOverview.build', () => {
  it('returns exactly 7 entries with the date + ISO day_of_week of each day', () => {
    const view = build({
      weekDays: WEEK,
      scheduleDays: [1, 3, 5],
      finishedDays: new Set(),
      asOf: '2026-06-04',
    });

    expect(view.days).toHaveLength(7);
    expect(view.days.map((d) => d.date)).toEqual(WEEK);
    expect(view.days.map((d) => d.day_of_week)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("marks a finished scheduled day 'done'", () => {
    const view = build({
      weekDays: WEEK,
      scheduleDays: [1, 3, 5],
      finishedDays: new Set(['2026-06-01']),
      asOf: '2026-06-04',
    });

    const mon = view.days.find((d) => d.date === '2026-06-01');
    expect(mon.status).toBe('done');
  });

  it("marks a non-scheduled day 'rest' even when (oddly) a session was finished there", () => {
    const view = build({
      weekDays: WEEK,
      scheduleDays: [1, 3, 5],
      finishedDays: new Set(['2026-06-02']), // Tue is not a training day
      asOf: '2026-06-04',
    });

    const tue = view.days.find((d) => d.date === '2026-06-02');
    expect(tue.status).toBe('rest');
  });

  it("marks an elapsed, scheduled, un-finished day 'todo' (never 'missed')", () => {
    const view = build({
      weekDays: WEEK,
      scheduleDays: [1, 3, 5],
      finishedDays: new Set(), // nothing finished
      asOf: '2026-06-04', // Thu — Mon & Wed are elapsed
    });

    const mon = view.days.find((d) => d.date === '2026-06-01');
    const wed = view.days.find((d) => d.date === '2026-06-03');
    expect(mon.status).toBe('todo');
    expect(wed.status).toBe('todo');
  });

  it("marks a FUTURE scheduled day 'todo'", () => {
    const view = build({
      weekDays: WEEK,
      scheduleDays: [1, 3, 5],
      finishedDays: new Set(['2026-06-01', '2026-06-03']),
      asOf: '2026-06-04', // Thu — Fri (5) is in the future
    });

    const fri = view.days.find((d) => d.date === '2026-06-05');
    expect(fri.status).toBe('todo');
  });

  it('classifies a full mixed week', () => {
    const view = build({
      weekDays: WEEK,
      scheduleDays: [1, 3, 5],
      finishedDays: new Set(['2026-06-01']), // only Monday done
      asOf: '2026-06-04', // Thursday
    });

    expect(view.days.map((d) => d.status)).toEqual([
      'done', // Mon (1) scheduled + finished
      'rest', // Tue (2) not scheduled
      'todo', // Wed (3) scheduled, elapsed, unfinished
      'rest', // Thu (4) not scheduled (asOf)
      'todo', // Fri (5) scheduled, future
      'rest', // Sat (6) not scheduled
      'rest', // Sun (7) not scheduled
    ]);
  });

  it('marks every day rest when there are no scheduled training days', () => {
    const view = build({
      weekDays: WEEK,
      scheduleDays: [],
      finishedDays: new Set(['2026-06-01']),
      asOf: '2026-06-04',
    });

    expect(view.days.every((d) => d.status === 'rest')).toBe(true);
  });

  it('treats omitted finishedDays as an empty set', () => {
    const view = build({
      weekDays: WEEK,
      scheduleDays: [1],
      asOf: '2026-06-04',
    });

    expect(view.days.find((d) => d.date === '2026-06-01').status).toBe('todo');
  });
});

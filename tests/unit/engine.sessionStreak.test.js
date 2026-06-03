import { describe, it, expect } from 'vitest';
import { consecutiveSessionStreak, missedScheduledDays } from '../../services/engine/sessionStreak.js';

// Phase 10 (013-phase10-dashboard) T017 — pure session-streak math (data-model.md §2a,
// research D-4). Schedule-aware: only ISO-weekday training days count; rest days are
// skipped and never break a run; a future scheduled day not yet reached doesn't count;
// counting never precedes programStart. The streak is the count of scheduled training
// days COMPLETED in an unbroken run ending at the most recent ELAPSED scheduled day, and
// is 0 when that latest elapsed scheduled day was missed. missedScheduledDays counts the
// consecutive elapsed scheduled training days at the tail with no completed session.

// ISO weekdays: Mon=1 … Sun=7.
const PROGRAM_START = '2026-05-01';

// Reference calendar (all 2026):
//   2026-06-01 Mon (1)
//   2026-06-02 Tue (2)
//   2026-06-03 Wed (3)
//   2026-06-04 Thu (4)
//   2026-06-05 Fri (5)
//   2026-06-06 Sat (6)
//   2026-06-07 Sun (7)
//   2026-06-08 Mon (1)
//   2026-06-09 Tue (2)
//   2026-06-10 Wed (3)

describe('consecutiveSessionStreak', () => {
  it('counts consecutive scheduled training days completed (rest days skipped)', () => {
    // Trains Mon/Wed/Fri. asOf = Fri 2026-06-05, all three this week done.
    const scheduleDays = [1, 3, 5];
    const finishedDays = new Set(['2026-06-01', '2026-06-03', '2026-06-05']);
    expect(
      consecutiveSessionStreak({
        finishedDays,
        scheduleDays,
        asOf: '2026-06-05',
        programStart: PROGRAM_START,
      }),
    ).toBe(3);
  });

  it('skips rest days without breaking the run (Tue/Thu/Sat/Sun not counted)', () => {
    // Trains Mon/Wed/Fri. asOf is a Saturday (rest) → most recent elapsed scheduled day
    // is Fri 2026-06-05; all three done → 3. The intervening rest days do not break it.
    const scheduleDays = [1, 3, 5];
    const finishedDays = new Set(['2026-06-01', '2026-06-03', '2026-06-05']);
    expect(
      consecutiveSessionStreak({
        finishedDays,
        scheduleDays,
        asOf: '2026-06-06',
        programStart: PROGRAM_START,
      }),
    ).toBe(3);
  });

  it('does not count a future scheduled day not yet reached', () => {
    // asOf = Wed 2026-06-03. Fri 2026-06-05 is in the future (and not finished); the most
    // recent ELAPSED scheduled day is Wed → Mon+Wed done = 2. Future Fri ignored.
    const scheduleDays = [1, 3, 5];
    const finishedDays = new Set(['2026-06-01', '2026-06-03']);
    expect(
      consecutiveSessionStreak({
        finishedDays,
        scheduleDays,
        asOf: '2026-06-03',
        programStart: PROGRAM_START,
      }),
    ).toBe(2);
  });

  it('does not break when TODAY is a scheduled day not yet done (counts the run before it)', () => {
    // asOf = Fri 2026-06-05 (a training day) but not yet completed. The most recent
    // elapsed scheduled day before today is Wed 2026-06-03; Mon+Wed done = 2. Today being
    // incomplete must NOT zero the streak (it is not yet "missed").
    const scheduleDays = [1, 3, 5];
    const finishedDays = new Set(['2026-06-01', '2026-06-03']);
    expect(
      consecutiveSessionStreak({
        finishedDays,
        scheduleDays,
        asOf: '2026-06-05',
        programStart: PROGRAM_START,
      }),
    ).toBe(2);
  });

  it('returns 0 when the most recent ELAPSED scheduled day was missed', () => {
    // asOf = Sat 2026-06-06 (rest). Most recent elapsed scheduled day = Fri 2026-06-05,
    // which was NOT done → streak is 0 even though Mon+Wed were done.
    const scheduleDays = [1, 3, 5];
    const finishedDays = new Set(['2026-06-01', '2026-06-03']);
    expect(
      consecutiveSessionStreak({
        finishedDays,
        scheduleDays,
        asOf: '2026-06-06',
        programStart: PROGRAM_START,
      }),
    ).toBe(0);
  });

  it('breaks the run at the first missed scheduled day, counting only the run after it', () => {
    // Trains Mon/Wed/Fri. Mon 2026-06-01 missed; Wed+Fri done. asOf = Fri 2026-06-05.
    // Run ending at Fri: Fri, Wed done, then Mon missed → stop. Streak = 2.
    const scheduleDays = [1, 3, 5];
    const finishedDays = new Set(['2026-06-03', '2026-06-05']);
    expect(
      consecutiveSessionStreak({
        finishedDays,
        scheduleDays,
        asOf: '2026-06-05',
        programStart: PROGRAM_START,
      }),
    ).toBe(2);
  });

  it('never counts a scheduled day earlier than programStart', () => {
    // programStart = Wed 2026-06-03. Mon 2026-06-01 is before it and must not count even
    // though it is in finishedDays. asOf = Fri 2026-06-05; Wed+Fri count = 2.
    const scheduleDays = [1, 3, 5];
    const finishedDays = new Set(['2026-06-01', '2026-06-03', '2026-06-05']);
    expect(
      consecutiveSessionStreak({
        finishedDays,
        scheduleDays,
        asOf: '2026-06-05',
        programStart: '2026-06-03',
      }),
    ).toBe(2);
  });

  it('returns 0 when no scheduled training day has elapsed yet', () => {
    // programStart = Fri 2026-06-05, asOf = Fri 2026-06-05 (today, not yet done). No
    // earlier scheduled day is on/after programStart → 0.
    const scheduleDays = [1, 3, 5];
    const finishedDays = new Set();
    expect(
      consecutiveSessionStreak({
        finishedDays,
        scheduleDays,
        asOf: '2026-06-05',
        programStart: '2026-06-05',
      }),
    ).toBe(0);
  });

  it('returns 0 for an empty schedule (no training days)', () => {
    expect(
      consecutiveSessionStreak({
        finishedDays: new Set(['2026-06-01']),
        scheduleDays: [],
        asOf: '2026-06-05',
        programStart: PROGRAM_START,
      }),
    ).toBe(0);
  });

  it('counts an unbroken run that spans across weeks', () => {
    // Trains Mon/Wed/Fri. Week 1: Mon/Wed/Fri done; Week 2: Mon 2026-06-08 done.
    // asOf = Mon 2026-06-08 (done) → 4 in a row.
    const scheduleDays = [1, 3, 5];
    const finishedDays = new Set([
      '2026-06-01',
      '2026-06-03',
      '2026-06-05',
      '2026-06-08',
    ]);
    expect(
      consecutiveSessionStreak({
        finishedDays,
        scheduleDays,
        asOf: '2026-06-08',
        programStart: PROGRAM_START,
      }),
    ).toBe(4);
  });

  it('accepts an array of finishedDays as well as a Set', () => {
    const scheduleDays = [1, 3, 5];
    expect(
      consecutiveSessionStreak({
        finishedDays: ['2026-06-03', '2026-06-05'],
        scheduleDays,
        asOf: '2026-06-05',
        programStart: PROGRAM_START,
      }),
    ).toBe(2);
  });
});

describe('missedScheduledDays', () => {
  it('counts consecutive elapsed scheduled days at the tail with no session', () => {
    // Trains Mon/Wed/Fri. The prior week's Fri 2026-05-29 was done (bounds the tail);
    // this week Mon/Wed/Fri all missed. asOf = Sat 2026-06-06 (rest). Elapsed scheduled
    // tail = Fri, Wed, Mon all missed → 3, stopping at the completed 2026-05-29.
    const scheduleDays = [1, 3, 5];
    const finishedDays = new Set(['2026-05-29']);
    expect(
      missedScheduledDays({ finishedDays, scheduleDays, asOf: '2026-06-06' }),
    ).toBe(3);
  });

  it('returns 0 when the most recent elapsed scheduled day was completed', () => {
    const scheduleDays = [1, 3, 5];
    const finishedDays = new Set(['2026-06-05']);
    // asOf = Sat 2026-06-06; latest elapsed scheduled = Fri done → 0 missed.
    expect(
      missedScheduledDays({ finishedDays, scheduleDays, asOf: '2026-06-06' }),
    ).toBe(0);
  });

  it('does not count TODAY when today is a scheduled day not yet done', () => {
    // asOf = Fri 2026-06-05 (training day, not done). Today is not yet "missed"; the
    // latest elapsed scheduled day is Wed 2026-06-03 (also not done) → 1 (Wed), then Mon
    // 2026-06-01 not done → 2, stopping at the prior completed Fri 2026-05-29.
    const scheduleDays = [1, 3, 5];
    const finishedDays = new Set(['2026-05-29']);
    expect(
      missedScheduledDays({ finishedDays, scheduleDays, asOf: '2026-06-05' }),
    ).toBe(2);
  });

  it('stops the count at the first completed scheduled day from the tail', () => {
    // Mon 2026-06-01 done, Wed+Fri missed. asOf = Sat 2026-06-06. Tail: Fri missed, Wed
    // missed, Mon done → stop. 2 missed.
    const scheduleDays = [1, 3, 5];
    const finishedDays = new Set(['2026-06-01']);
    expect(
      missedScheduledDays({ finishedDays, scheduleDays, asOf: '2026-06-06' }),
    ).toBe(2);
  });

  it('ignores future scheduled days (only elapsed days count as missed)', () => {
    // asOf = Wed 2026-06-03 (training day, not done). Fri 2026-06-05 is future and must
    // not be missed. Latest elapsed scheduled before today = Mon 2026-06-01 (not done)
    // → 1, stopping at the prior completed Fri 2026-05-29.
    const scheduleDays = [1, 3, 5];
    const finishedDays = new Set(['2026-05-29']);
    expect(
      missedScheduledDays({ finishedDays, scheduleDays, asOf: '2026-06-03' }),
    ).toBe(1);
  });

  it('returns 0 for an empty schedule', () => {
    expect(
      missedScheduledDays({ finishedDays: new Set(), scheduleDays: [], asOf: '2026-06-06' }),
    ).toBe(0);
  });

  it('accepts an array of finishedDays', () => {
    const scheduleDays = [1, 3, 5];
    expect(
      missedScheduledDays({
        finishedDays: ['2026-06-05'],
        scheduleDays,
        asOf: '2026-06-06',
      }),
    ).toBe(0);
  });
});

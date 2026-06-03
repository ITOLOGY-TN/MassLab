import { describe, it, expect } from 'vitest';
import { build } from '../../services/recovery/checkinView.js';

// Phase 9 (012-phase9-recovery-wellbeing) T007/T011 — pure check-in presenter
// (data-model.md §5a). Assembles the daily recovery check-in form state: the day's
// persisted signals (or null when nothing is logged), the editable flag, and the
// config-sourced option lists (moods + sore zones) so the UI hardcodes neither.

const MOODS = ['great', 'good', 'ok', 'low', 'bad'];
const SORE_ZONES = [
  'neck',
  'shoulders',
  'chest',
  'upper_back',
  'lower_back',
  'biceps',
  'triceps',
  'forearms',
  'abs',
  'glutes',
  'quads',
  'hamstrings',
  'calves',
];

describe('checkinView.build', () => {
  it('projects the persisted check-in row with date, editable, and option lists', () => {
    const view = build({
      row: {
        id: 7,
        athlete_id: 'a-1',
        logged_on: '2026-06-03',
        sleep_quality: 4,
        sleep_hours: 7.5,
        energy: 6,
        stress: 5,
        mood: 'good',
        sore_zones: ['quads', 'lower_back'],
        note: 'felt solid',
        created_at: '2026-06-03T08:00:00Z',
      },
      date: '2026-06-03',
      editable: true,
      moodOptions: MOODS,
      soreZoneList: SORE_ZONES,
    });

    expect(view.date).toBe('2026-06-03');
    expect(view.editable).toBe(true);
    expect(view.checkin).toEqual({
      sleep_quality: 4,
      sleep_hours: 7.5,
      energy: 6,
      stress: 5,
      mood: 'good',
      sore_zones: ['quads', 'lower_back'],
      note: 'felt solid',
    });
    expect(view.options).toEqual({ moods: MOODS, sore_zones: SORE_ZONES });
  });

  it('omits non-check-in columns from the projected check-in', () => {
    const view = build({
      row: { id: 7, athlete_id: 'a-1', logged_on: '2026-06-03', created_at: 'x', energy: 5 },
      date: '2026-06-03',
      editable: false,
      moodOptions: MOODS,
      soreZoneList: SORE_ZONES,
    });
    expect(Object.keys(view.checkin).sort()).toEqual(
      ['energy', 'mood', 'note', 'sleep_hours', 'sleep_quality', 'sore_zones', 'stress'].sort(),
    );
    expect(view.checkin).not.toHaveProperty('id');
    expect(view.checkin).not.toHaveProperty('athlete_id');
    expect(view.checkin).not.toHaveProperty('created_at');
    expect(view.editable).toBe(false);
  });

  it('defaults sore_zones to an empty array when the row omits it', () => {
    const view = build({
      row: { logged_on: '2026-06-03', energy: 6 },
      date: '2026-06-03',
      editable: true,
      moodOptions: MOODS,
      soreZoneList: SORE_ZONES,
    });
    expect(view.checkin.sore_zones).toEqual([]);
  });

  it('preserves an explicit empty sore_zones (no soreness reported, distinct from null)', () => {
    const view = build({
      row: { logged_on: '2026-06-03', energy: 6, sore_zones: [] },
      date: '2026-06-03',
      editable: true,
      moodOptions: MOODS,
      soreZoneList: SORE_ZONES,
    });
    expect(view.checkin.sore_zones).toEqual([]);
  });

  it('returns checkin null when the row is null (no check-in logged)', () => {
    const view = build({
      row: null,
      date: '2026-06-03',
      editable: true,
      moodOptions: MOODS,
      soreZoneList: SORE_ZONES,
    });
    expect(view.checkin).toBeNull();
    expect(view.date).toBe('2026-06-03');
    expect(view.editable).toBe(true);
    expect(view.options).toEqual({ moods: MOODS, sore_zones: SORE_ZONES });
  });

  it('treats an empty row object as no check-in (checkin null)', () => {
    const view = build({
      row: {},
      date: '2026-06-03',
      editable: true,
      moodOptions: MOODS,
      soreZoneList: SORE_ZONES,
    });
    expect(view.checkin).toBeNull();
  });

  it('treats a row carrying only identity/metadata columns as no check-in', () => {
    const view = build({
      row: { id: 7, athlete_id: 'a-1', logged_on: '2026-06-03', created_at: 'x' },
      date: '2026-06-03',
      editable: true,
      moodOptions: MOODS,
      soreZoneList: SORE_ZONES,
    });
    expect(view.checkin).toBeNull();
  });

  it('defaults options to empty lists when none are supplied', () => {
    const view = build({ row: null, date: '2026-06-03', editable: true });
    expect(view.options).toEqual({ moods: [], sore_zones: [] });
  });
});

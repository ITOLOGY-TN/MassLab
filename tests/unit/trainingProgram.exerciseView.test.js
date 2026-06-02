import { describe, it, expect } from 'vitest';
import { buildExerciseView } from '../../services/trainingProgram/exerciseView.js';
import { oneRepMax } from '../../services/engine/oneRepMax.js';
import { DEFAULTS } from '../../services/engine/constants.js';

const HOST = 'https://www.youtube-nocookie.com';

const exercise = {
  id: 101,
  slug: 'bench-press',
  name: 'Bench Press',
  targeted_muscles: ['chest', 'triceps'],
  instructions: 'Lie on the bench…',
  technique_points: ['retract scapula'],
  media_image_url: '/media/bench.jpg',
  media_video_url: 'https://youtu.be/rT7DgCr-3pg',
  is_active: true,
};

const alternatives = [
  { alternative_exercise_id: 145, exercises: { id: 145, slug: 'db-press', name: 'DB Press', is_active: true } },
  { alternative_exercise_id: 150, exercises: { id: 150, slug: 'old', name: 'Old Press', is_active: false } },
];

const sessions = [
  {
    id: 1,
    started_at: '2026-05-20T10:00:00Z',
    sets: [{ weight_kg: 70, reps: 8, completed: true }],
  },
  {
    id: 2,
    started_at: '2026-05-27T10:00:00Z',
    sets: [
      { weight_kg: 80, reps: 5, completed: true },
      { weight_kg: 100, reps: 1, completed: false },
    ],
  },
];

describe('trainingProgram.exerciseView — buildExerciseView (FR-013..FR-019)', () => {
  it('always renders static content', () => {
    const v = buildExerciseView({ exercise, embedHost: HOST });
    expect(v).toMatchObject({
      exercise_id: 101,
      slug: 'bench-press',
      name: 'Bench Press',
      targeted_muscles: ['chest', 'triceps'],
      instructions: 'Lie on the bench…',
      technique_points: ['retract scapula'],
      is_active: true,
    });
  });

  it('classifies media (image + youtube embed)', () => {
    const v = buildExerciseView({ exercise, embedHost: HOST });
    expect(v.media.image_url).toBe('/media/bench.jpg');
    expect(v.media.video).toEqual({ kind: 'youtube', url: `${HOST}/embed/rT7DgCr-3pg` });
  });

  it('lists alternatives and flags archived ones (D-7)', () => {
    const v = buildExerciseView({ exercise, alternatives, embedHost: HOST });
    expect(v.alternatives).toEqual([
      { exercise_id: 145, slug: 'db-press', name: 'DB Press', is_active: true },
      { exercise_id: 150, slug: 'old', name: 'Old Press', is_active: false },
    ]);
  });

  it('computes 1RM from the heaviest completed set of the most recent session (D-1, SC-003)', () => {
    const v = buildExerciseView({ exercise, sessions, embedHost: HOST });
    expect(v.history.has_history).toBe(true);
    // Feed set = 80kg×5 (the 100kg×1 is incomplete → ignored).
    const expected = oneRepMax({ weight_kg: 80, reps: 5, constants: DEFAULTS }).primary_estimate_kg;
    expect(v.history.estimated_1rm_kg).toBeCloseTo(Math.round(expected * 10) / 10, 1);
    expect(v.history.recent_sessions).toHaveLength(2);
    expect(v.history.recent_sessions[0].date).toBe('2026-05-27');
  });

  it('recommends last weight + delta when add_load is active (D-3)', () => {
    const v = buildExerciseView({
      exercise,
      sessions,
      activeFlag: { flag_type: 'add_load', suggested_adjustment: { delta_kg: 2.5 } },
      embedHost: HOST,
    });
    expect(v.history.recommended_load_kg).toBe(82.5); // 80 + 2.5
  });

  it('renders empty history states with no sessions (FR-019)', () => {
    const v = buildExerciseView({ exercise, sessions: [], embedHost: HOST });
    expect(v.history).toMatchObject({
      recent_sessions: [],
      estimated_1rm_kg: null,
      recommended_load_kg: null,
      has_history: false,
    });
    // static content still present
    expect(v.name).toBe('Bench Press');
  });

  it('omits the video gracefully when none is set', () => {
    const v = buildExerciseView({ exercise: { ...exercise, media_video_url: null }, embedHost: HOST });
    expect(v.media.video).toEqual({ kind: null, url: null });
  });
});

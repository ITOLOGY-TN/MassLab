// Boundary: only this directory imports `@supabase/supabase-js`.
import { HttpError } from '../../middleware/errorHandler.js';

export function weeklyPlanDao(supabase) {
  return {
    async listSlotsWithExercises(athleteId) {
      const { data: slots, error: slotErr } = await supabase
        .from('weekly_plan_slots')
        .select('*')
        .eq('athlete_id', athleteId)
        .order('day_of_week', { ascending: true });
      if (slotErr) throw new HttpError(500, 'DB_ERROR', slotErr.message);

      if (!slots?.length) return [];

      const { data: exs, error: exErr } = await supabase
        .from('weekly_plan_exercises')
        .select('*')
        .eq('athlete_id', athleteId)
        .order('position', { ascending: true });
      if (exErr) throw new HttpError(500, 'DB_ERROR', exErr.message);

      return slots.map((s) => ({
        ...s,
        exercises: (exs ?? [])
          .filter((e) => e.slot_id === s.id)
          .map(({ slot_id: _slot, athlete_id: _aid, id: _id, ...rest }) => rest),
      }));
    },

    async upsertSlot(slot) {
      const { data, error } = await supabase
        .from('weekly_plan_slots')
        .upsert(slot, { onConflict: 'athlete_id,day_of_week' })
        .select('*')
        .single();
      if (error) throw new HttpError(500, 'DB_ERROR', error.message);
      return data;
    },

    async upsertSlotExercise(row) {
      const { data, error } = await supabase
        .from('weekly_plan_exercises')
        .upsert(row, { onConflict: 'slot_id,position' })
        .select('*')
        .single();
      if (error) throw new HttpError(500, 'DB_ERROR', error.message);
      return data;
    },

    /**
     * Phase 2 US2 (T034): full schedule replace.
     *
     * Supabase's PostgREST client cannot wrap multi-statement transactions
     * cleanly, so we approximate atomicity by wiping the athlete's slots +
     * exercises (FK-cascade) then inserting the new payload. If the insert
     * fails, the caller is left with an empty schedule — the controller
     * surfaces a 500 ATOMIC_ROLLBACK and the athlete's seed/regenerate path
     * can rebuild from the program. A future migration may move this to a
     * single Postgres function for true single-tx semantics.
     *
     * @param {string} athleteId
     * @param {{ slots: Array<{
     *   day_of_week: number,
     *   muscle_group_id: number,
     *   display_order?: number,
     *   display_color?: string,
     *   exercises?: Array<{ exercise_id: number, position: number,
     *     target_sets: number, target_reps_low: number, target_reps_high: number }>,
     * }> }} payload
     */
    async replaceSchedule(athleteId, payload) {
      const slots = Array.isArray(payload?.slots) ? payload.slots : [];

      // 1. Wipe — exercises cascade via FK.
      const { error: wipeErr } = await supabase
        .from('weekly_plan_slots')
        .delete()
        .eq('athlete_id', athleteId);
      if (wipeErr) throw new HttpError(500, 'DB_ERROR', wipeErr.message);

      if (slots.length === 0) return [];

      // 2. Insert slots first (need the generated ids for the exercises).
      const slotRows = slots.map((s, idx) => ({
        athlete_id: athleteId,
        day_of_week: s.day_of_week,
        muscle_group_id: s.muscle_group_id,
        display_order: s.display_order ?? idx + 1,
        display_color: s.display_color ?? '#6b7280',
      }));
      const { data: insertedSlots, error: slotsErr } = await supabase
        .from('weekly_plan_slots')
        .insert(slotRows)
        .select('*');
      if (slotsErr) throw new HttpError(500, 'ATOMIC_ROLLBACK', slotsErr.message);

      // 3. Map (day_of_week → inserted slot id), then build exercise rows.
      const slotIdByDay = new Map(insertedSlots.map((row) => [row.day_of_week, row.id]));
      const exerciseRows = [];
      for (const s of slots) {
        const slotId = slotIdByDay.get(s.day_of_week);
        if (!slotId || !Array.isArray(s.exercises)) continue;
        for (const e of s.exercises) {
          exerciseRows.push({
            athlete_id: athleteId,
            slot_id: slotId,
            exercise_id: e.exercise_id,
            position: e.position,
            target_sets: e.target_sets,
            target_reps_low: e.target_reps_low,
            target_reps_high: e.target_reps_high,
          });
        }
      }
      if (exerciseRows.length) {
        const { error: exErr } = await supabase.from('weekly_plan_exercises').insert(exerciseRows);
        if (exErr) throw new HttpError(500, 'ATOMIC_ROLLBACK', exErr.message);
      }

      return this.listSlotsWithExercises(athleteId);
    },

    /**
     * Phase 2 US2 (T037): reorder exercises within one slot.
     * Two-pass update — bump every position into a high range first to dodge
     * the (slot_id, position) unique index, then write the final positions.
     */
    async reorderSlotExercises(slotId, athleteId, orderedExerciseIds) {
      if (!Array.isArray(orderedExerciseIds) || orderedExerciseIds.length === 0) {
        throw new HttpError(400, 'VALIDATION_FAILED', 'ordered_exercise_ids is required.');
      }

      // Verify slot ownership + collect existing exercises in one go.
      const { data: existing, error: existErr } = await supabase
        .from('weekly_plan_exercises')
        .select('id, exercise_id, position')
        .eq('athlete_id', athleteId)
        .eq('slot_id', slotId);
      if (existErr) throw new HttpError(500, 'DB_ERROR', existErr.message);
      if (!existing?.length) {
        throw new HttpError(404, 'NOT_FOUND', 'Slot has no exercises to reorder.');
      }

      const idByExerciseId = new Map(existing.map((row) => [row.exercise_id, row.id]));
      for (const exId of orderedExerciseIds) {
        if (!idByExerciseId.has(exId)) {
          throw new HttpError(
            400,
            'VALIDATION_FAILED',
            `exercise_id=${exId} is not part of slot ${slotId}.`,
          );
        }
      }
      if (orderedExerciseIds.length !== existing.length) {
        throw new HttpError(
          400,
          'VALIDATION_FAILED',
          'ordered_exercise_ids must include every exercise currently in the slot.',
        );
      }

      // Pass 1 — move every row out of the way.
      for (const row of existing) {
        const { error } = await supabase
          .from('weekly_plan_exercises')
          .update({ position: row.position + 1000 })
          .eq('id', row.id);
        if (error) throw new HttpError(500, 'DB_ERROR', error.message);
      }
      // Pass 2 — write the final positions.
      for (let i = 0; i < orderedExerciseIds.length; i += 1) {
        const exId = orderedExerciseIds[i];
        const rowId = idByExerciseId.get(exId);
        const { error } = await supabase
          .from('weekly_plan_exercises')
          .update({ position: i + 1 })
          .eq('id', rowId);
        if (error) throw new HttpError(500, 'DB_ERROR', error.message);
      }
    },

    /**
     * Used by the schedule-replace conflict check (FR-008): refuse the replace
     * when an in-progress session sits on a day that the new schedule drops.
     * Phase 4 introduces session_journal; for Phase 2 we expose the plumbing
     * but resolve to "no in-progress sessions" until that table ships.
     */
    async findInProgressSessionDays(_athleteId) {
      return [];
    },
  };
}

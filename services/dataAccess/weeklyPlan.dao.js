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
  };
}

-- 20260508000008_init_replace_athlete_dataset_fn.sql
-- Phase 2 US6 hardening: atomic restore via single transaction.
--
-- Replaces the per-statement wipe+insert loop in importers.dao.js. plpgsql
-- functions run inside an implicit transaction, so any RAISE / runtime error
-- rolls the entire restore back, preserving the previous dataset instead of
-- leaving the athlete partially wiped.

create or replace function public.replace_athlete_dataset(
  p_athlete_id uuid,
  p_payload jsonb
) returns jsonb
language plpgsql
as $$
declare
  v_wipe_order constant text[] := array[
    'app_config','recovery_log','one_rep_max_records','progression_flags',
    'generated_programs','calculation_results','body_composition_results',
    'body_measurements','quotes','foods','supplements','nutrition_template_meals',
    'training_phases','weekly_plan_exercises','weekly_plan_slots','exercises',
    'muscle_groups'
  ];
  v_restore_order constant text[] := array[
    'muscle_groups','exercises','weekly_plan_slots','weekly_plan_exercises',
    'training_phases','nutrition_template_meals','supplements','foods','quotes',
    'body_measurements','body_composition_results','calculation_results',
    'generated_programs','progression_flags','one_rep_max_records','recovery_log',
    'app_config'
  ];
  v_table text;
  v_athlete_patch jsonb;
  v_rows jsonb;
  v_cols text;
  v_counts jsonb := '{}'::jsonb;
begin
  if p_athlete_id is null then
    raise exception 'replace_athlete_dataset: p_athlete_id is required';
  end if;

  -- 1. Patch the athletes row in place, preserving id / auth_user_id / created_at.
  --    jsonb_populate_record(athletes, patch) merges patch over the existing row,
  --    so keys missing from the payload keep their current value.
  if jsonb_typeof(p_payload->'athletes') = 'array'
     and jsonb_array_length(p_payload->'athletes') > 0 then
    select coalesce(
      (select e.value from jsonb_array_elements(p_payload->'athletes') as e(value)
        where e.value->>'id' = p_athlete_id::text limit 1),
      p_payload->'athletes'->0
    ) into v_athlete_patch;
    v_athlete_patch := v_athlete_patch
                     - 'id' - 'auth_user_id' - 'created_at' - 'updated_at';

    update public.athletes a set
      email = (src.m).email,
      display_name = (src.m).display_name,
      age = (src.m).age,
      biological_sex = (src.m).biological_sex,
      height_cm = (src.m).height_cm,
      starting_weight_kg = (src.m).starting_weight_kg,
      target_weight_kg = (src.m).target_weight_kg,
      morphotype = (src.m).morphotype,
      goal = (src.m).goal,
      weekly_session_count = (src.m).weekly_session_count,
      available_equipment = (src.m).available_equipment,
      injuries = (src.m).injuries,
      program_start_date = (src.m).program_start_date
    from (
      select jsonb_populate_record(athletes, v_athlete_patch) as m
        from public.athletes where id = p_athlete_id
    ) src
    where a.id = p_athlete_id;
  end if;

  -- 2. Wipe athlete-scoped rows in dependency-safe order. Tables that don't
  --    exist yet (e.g. on partial environments) are skipped.
  foreach v_table in array v_wipe_order loop
    if to_regclass('public.' || v_table) is not null then
      execute format('delete from public.%I where athlete_id = $1', v_table)
        using p_athlete_id;
    end if;
  end loop;

  -- 3. Insert the new state. For each row, force athlete_id to the caller's
  --    id and strip server-managed keys so identity / default columns work.
  foreach v_table in array v_restore_order loop
    if to_regclass('public.' || v_table) is null then
      v_counts := v_counts || jsonb_build_object(v_table, 0);
      continue;
    end if;

    v_rows := p_payload->v_table;
    if v_rows is null
       or jsonb_typeof(v_rows) <> 'array'
       or jsonb_array_length(v_rows) = 0 then
      v_counts := v_counts || jsonb_build_object(v_table, 0);
      continue;
    end if;

    if v_table = 'app_config' then
      select coalesce(
        jsonb_agg((e.value - 'created_at')
                  || jsonb_build_object('athlete_id', p_athlete_id)),
        '[]'::jsonb)
        into v_rows
        from jsonb_array_elements(v_rows) as e(value);
    else
      select coalesce(
        jsonb_agg((e.value - 'id' - 'created_at')
                  || jsonb_build_object('athlete_id', p_athlete_id)),
        '[]'::jsonb)
        into v_rows
        from jsonb_array_elements(v_rows) as e(value);
    end if;

    -- Build the column list from the intersection of the row's keys and the
    -- table's insertable columns. Identity / generated columns are excluded
    -- so sequences and computed columns keep working.
    select string_agg(quote_ident(c.column_name), ', ')
      into v_cols
      from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = v_table
        and c.is_identity = 'NO'
        and c.is_generated = 'NEVER'
        and (v_rows->0) ? c.column_name;

    if v_cols is null then
      v_counts := v_counts || jsonb_build_object(v_table, 0);
      continue;
    end if;

    execute format(
      'insert into public.%I (%s) select %s from jsonb_populate_recordset(null::public.%I, $1)',
      v_table, v_cols, v_cols, v_table
    ) using v_rows;

    v_counts := v_counts || jsonb_build_object(v_table, jsonb_array_length(v_rows));
  end loop;

  return v_counts;
end;
$$;

comment on function public.replace_athlete_dataset(uuid, jsonb) is
  'Atomic data restore for one athlete. Patches athletes, wipes athlete-scoped tables, and re-inserts the payload in a single transaction. Phase 2 US6.';

revoke all on function public.replace_athlete_dataset(uuid, jsonb) from public;
revoke all on function public.replace_athlete_dataset(uuid, jsonb) from anon, authenticated;

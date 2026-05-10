-- Pin search_path so unqualified identifiers always resolve from public/pg_temp,
-- closing the function_search_path_mutable advisory for replace_athlete_dataset.
alter function public.replace_athlete_dataset(uuid, jsonb)
  set search_path = public, pg_temp;

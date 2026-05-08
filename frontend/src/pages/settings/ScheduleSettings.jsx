import { useEffect, useMemo, useState } from 'react';
import { apiGet, apiPut } from '../../lib/api.js';
import SortableList from '../../components/SortableList.jsx';

const DAYS = [
  { dow: 1, label: 'Lundi' },
  { dow: 2, label: 'Mardi' },
  { dow: 3, label: 'Mercredi' },
  { dow: 4, label: 'Jeudi' },
  { dow: 5, label: 'Vendredi' },
  { dow: 6, label: 'Samedi' },
  { dow: 7, label: 'Dimanche' },
];

const REST = '__rest__';

// The draft is always 7 entries long, one per weekday row. Each entry is the
// "content" of that day — either { muscle_group_id, display_color, exercises }
// or null for rest. Drag-and-drop reorders the contents while the weekday
// labels stay fixed (Lundi–Dimanche).
function buildInitialDraft(slots) {
  const byDay = new Map((slots ?? []).map((s) => [s.day_of_week, s]));
  return DAYS.map(({ dow }) => byDay.get(dow) ?? null);
}

// Stable id per row so SortableList can track drags. We use the weekday index
// rather than the muscle_group_id (which can repeat as `null` for rest days).
function rowId(idx) {
  return `row-${idx}`;
}

export default function ScheduleSettings() {
  const [groups, setGroups] = useState(null);
  const [initial, setInitial] = useState(null);
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([apiGet('/api/v1/me/schedule'), apiGet('/api/v1/muscle-groups')])
      .then(([sched, mg]) => {
        if (cancelled) return;
        const built = buildInitialDraft(sched.data.slots ?? []);
        setInitial(built);
        setDraft(built);
        setGroups(mg.data ?? []);
      })
      .catch((err) => setError(err.message));
    return () => {
      cancelled = true;
    };
  }, []);

  const dirty = useMemo(() => {
    if (!draft || !initial) return false;
    return draft.some((slot, i) => {
      const a = slot?.muscle_group_id ?? null;
      const b = initial[i]?.muscle_group_id ?? null;
      return a !== b;
    });
  }, [draft, initial]);

  if (error && !draft) {
    return (
      <div role="alert" className="text-danger text-sm">
        {error}
      </div>
    );
  }
  if (!draft || !groups) return <p className="text-muted text-sm">Chargement…</p>;

  function setDay(idx, value) {
    setError(null);
    const next = draft.slice();
    if (value === REST) {
      next[idx] = null;
    } else {
      const id = Number(value);
      const conflict = next.findIndex((s, i) => i !== idx && s?.muscle_group_id === id);
      if (conflict >= 0) {
        setError(
          `${groups.find((g) => g.id === id)?.name ?? 'Ce groupe'} est déjà programmé un autre jour. Mettez ce jour-là en repos d'abord.`,
        );
        return;
      }
      const group = groups.find((g) => g.id === id);
      next[idx] = {
        muscle_group_id: id,
        display_color: group?.display_color ?? '#6b7280',
        exercises: draft[idx]?.exercises ?? [],
      };
    }
    setDraft(next);
  }

  // Drag handler — `nextItems` is the reordered draft; the day labels stay put,
  // only the contents shift between rows.
  function handleReorder(_orderedIds, nextItems) {
    setDraft(nextItems);
  }

  async function onSave() {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const slots = [];
      let order = 1;
      DAYS.forEach(({ dow }, i) => {
        const slot = draft[i];
        if (!slot) return;
        slots.push({
          day_of_week: dow,
          muscle_group_id: slot.muscle_group_id,
          display_order: order++,
          display_color: slot.display_color,
          exercises: (slot.exercises || []).map((e, idx) => ({
            exercise_id: e.exercise_id,
            position: idx + 1,
            target_sets: e.target_sets,
            target_reps_low: e.target_reps_low,
            target_reps_high: e.target_reps_high,
          })),
        });
      });
      if (slots.length === 0) {
        setError("Au moins un jour d'entraînement est requis.");
        setSaving(false);
        return;
      }
      const res = await apiPut('/api/v1/me/schedule', { active_days: slots.length, slots });
      const next = buildInitialDraft(res.data.slots ?? []);
      setInitial(next);
      setDraft(next);
      setSuccess('Planning enregistré.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const trainingDays = draft.filter(Boolean).length;
  // Wrap each row content with its weekday-index id so SortableList tracks them.
  const rows = draft.map((slot, idx) => ({ idx, slot }));

  return (
    <div className="grid gap-md">
      <header className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold">Planning hebdomadaire</h2>
        <span className="text-sm text-muted">
          {trainingDays} jour{trainingDays > 1 ? 's' : ''} d'entraînement · {7 - trainingDays} jour
          {7 - trainingDays > 1 ? 's' : ''} de repos
        </span>
      </header>

      <p className="text-xs text-muted">
        Glissez les jours pour réorganiser votre semaine. Choisissez « Repos » pour marquer un
        jour sans entraînement.
      </p>

      <SortableList
        items={rows}
        getId={(r) => rowId(r.idx)}
        onReorder={(_ids, items) => handleReorder(_ids, items.map((r) => r.slot))}
      >
        {({ idx, slot }, handle) => {
          const value = slot?.muscle_group_id ?? REST;
          const usedElsewhere = new Set(
            draft
              .map((s, j) => (j !== idx ? s?.muscle_group_id : null))
              .filter(Boolean),
          );
          return (
            <li
              ref={handle.ref}
              style={handle.style}
              className="bg-bg border border-muted/30 rounded-md p-md flex items-center gap-md"
            >
              <button
                type="button"
                {...handle.attributes}
                {...handle.listeners}
                aria-label="Réorganiser"
                className="cursor-grab text-muted text-xl select-none min-w-[44px] min-h-[44px] flex items-center justify-center"
              >
                ⋮⋮
              </button>
              <span className="font-semibold w-24">{DAYS[idx].label}</span>
              <select
                value={value}
                onChange={(e) => setDay(idx, e.target.value)}
                className="flex-1 bg-bg border border-muted/30 text-text rounded-md px-md py-sm min-h-[44px] focus:outline-none focus:border-accent"
              >
                <option value={REST}>Repos</option>
                {groups
                  .filter((g) => g.is_active || g.id === slot?.muscle_group_id)
                  .map((g) => (
                    <option
                      key={g.id}
                      value={g.id}
                      disabled={usedElsewhere.has(g.id) && g.id !== slot?.muscle_group_id}
                    >
                      {g.name}
                      {usedElsewhere.has(g.id) && g.id !== slot?.muscle_group_id ? ' (déjà utilisé)' : ''}
                    </option>
                  ))}
              </select>
              {slot ? (
                <span
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: slot.display_color }}
                  aria-hidden="true"
                />
              ) : null}
            </li>
          );
        }}
      </SortableList>

      <div className="flex justify-end">
        <button
          type="button"
          disabled={!dirty || saving}
          onClick={onSave}
          className="bg-accent text-white rounded-md px-lg py-sm min-h-[44px] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>

      {error ? (
        <p role="alert" className="text-danger text-sm">
          {error}
        </p>
      ) : null}
      {success ? (
        <p role="status" className="text-success text-sm">
          {success}
        </p>
      ) : null}
    </div>
  );
}

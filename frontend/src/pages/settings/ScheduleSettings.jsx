import { useEffect, useMemo, useState } from 'react';
import { apiGet, apiPut } from '../../lib/api.js';
import SortableList from '../../components/SortableList.jsx';

const DAY_NAMES = ['Lun.', 'Mar.', 'Mer.', 'Jeu.', 'Ven.', 'Sam.', 'Dim.'];

function reassignDays(slots) {
  // After a drag-reorder we treat the displayed order as Mon→Sun mapping, so
  // every slot gets a fresh day_of_week (1..n) matching its index.
  return slots.map((s, i) => ({ ...s, day_of_week: i + 1, display_order: i + 1 }));
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
        const slots = sched.data.slots ?? [];
        setInitial(slots);
        setDraft(slots);
        setGroups(mg.data ?? []);
      })
      .catch((err) => setError(err.message));
    return () => {
      cancelled = true;
    };
  }, []);

  const dirty = useMemo(() => {
    if (!draft || !initial) return false;
    if (draft.length !== initial.length) return true;
    return draft.some(
      (s, i) =>
        s.day_of_week !== initial[i].day_of_week ||
        s.muscle_group_id !== initial[i].muscle_group_id ||
        s.display_order !== initial[i].display_order,
    );
  }, [draft, initial]);

  if (error && !draft) {
    return (
      <div role="alert" className="text-danger text-sm">
        {error}
      </div>
    );
  }
  if (!draft || !groups) return <p className="text-muted text-sm">Chargement…</p>;

  function handleReorder(_orderedIds, nextItems) {
    setDraft(reassignDays(nextItems));
  }

  function pickGroup(slotIndex, value) {
    const next = draft.slice();
    next[slotIndex] = { ...next[slotIndex], muscle_group_id: Number(value) };
    setDraft(next);
  }

  function removeSlot(idx) {
    setDraft(reassignDays(draft.filter((_, i) => i !== idx)));
  }

  function addSlot() {
    if (draft.length >= 7) return;
    const usedGroupIds = new Set(draft.map((s) => s.muscle_group_id));
    const unused = groups.find((g) => !usedGroupIds.has(g.id) && g.is_active);
    if (!unused) {
      setError('Aucun groupe musculaire disponible — créez-en un nouveau.');
      return;
    }
    setError(null);
    setDraft(
      reassignDays([
        ...draft,
        {
          day_of_week: draft.length + 1,
          muscle_group_id: unused.id,
          display_order: draft.length + 1,
          display_color: unused.display_color ?? '#6b7280',
          exercises: [],
        },
      ]),
    );
  }

  async function onSave() {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const payload = {
        active_days: draft.length,
        slots: draft.map((s, i) => ({
          day_of_week: s.day_of_week,
          muscle_group_id: s.muscle_group_id,
          display_order: i + 1,
          display_color: s.display_color,
          exercises: (s.exercises || []).map((e, idx) => ({
            exercise_id: e.exercise_id,
            position: idx + 1,
            target_sets: e.target_sets,
            target_reps_low: e.target_reps_low,
            target_reps_high: e.target_reps_high,
          })),
        })),
      };
      const res = await apiPut('/api/v1/me/schedule', payload);
      const slots = res.data.slots ?? [];
      setInitial(slots);
      setDraft(slots);
      setSuccess('Planning enregistré.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-md">
      <header className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold">Planning hebdomadaire</h2>
        <span className="text-sm text-muted">
          {draft.length} jour{draft.length > 1 ? 's' : ''} actif{draft.length > 1 ? 's' : ''}
        </span>
      </header>

      <SortableList items={draft} getId={(s) => s.muscle_group_id} onReorder={handleReorder}>
        {(slot, handle) => (
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
            <span className="font-semibold w-12">{DAY_NAMES[slot.day_of_week - 1] ?? `J${slot.day_of_week}`}</span>
            <select
              value={slot.muscle_group_id}
              onChange={(e) => pickGroup(draft.indexOf(slot), e.target.value)}
              className="flex-1 bg-bg border border-muted/30 text-text rounded-md px-md py-sm min-h-[44px] focus:outline-none focus:border-accent"
            >
              {groups
                .filter((g) => g.is_active || g.id === slot.muscle_group_id)
                .map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
            </select>
            <button
              type="button"
              onClick={() => removeSlot(draft.indexOf(slot))}
              className="text-danger hover:underline px-md min-h-[44px]"
              aria-label="Retirer ce jour"
            >
              Retirer
            </button>
          </li>
        )}
      </SortableList>

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={addSlot}
          disabled={draft.length >= 7}
          className="border border-muted/30 text-text rounded-md px-md py-sm min-h-[44px] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          + Ajouter un jour
        </button>
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

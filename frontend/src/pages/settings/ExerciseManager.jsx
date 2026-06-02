import { useEffect, useMemo, useState } from 'react';
import { apiGet, apiPost, apiPatch, apiDelete } from '../../lib/api.js';

const empty = {
  name: '',
  targeted_muscles: '',
  instructions: '',
  technique_points: '',
  media_image_url: '',
  media_video_url: '',
};

function fromForm(form) {
  const split = (s) =>
    String(s)
      .split(/\s*,\s*/)
      .filter(Boolean);
  const body = {
    name: form.name.trim(),
    targeted_muscles: split(form.targeted_muscles),
    instructions: form.instructions.trim(),
  };
  if (form.technique_points.trim()) body.technique_points = split(form.technique_points);
  if (form.media_image_url.trim()) body.media_image_url = form.media_image_url.trim();
  if (form.media_video_url.trim()) body.media_video_url = form.media_video_url.trim();
  return body;
}

function toForm(ex) {
  return {
    name: ex.name ?? '',
    targeted_muscles: (ex.targeted_muscles ?? []).join(', '),
    instructions: ex.instructions ?? '',
    technique_points: (ex.technique_points ?? []).join(', '),
    media_image_url: ex.media_image_url ?? '',
    media_video_url: ex.media_video_url ?? '',
  };
}

export default function ExerciseManager() {
  const [exercises, setExercises] = useState(null);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const res = await apiGet(`/api/v1/exercises${includeArchived ? '?include_archived=1' : ''}`);
    setExercises(res.data);
  }

  useEffect(() => {
    refresh().catch((err) => setError(err.message));
  }, [includeArchived]);

  const visible = useMemo(() => exercises ?? [], [exercises]);

  async function onCreate(form) {
    setBusy(true);
    setError(null);
    try {
      await apiPost('/api/v1/exercises', fromForm(form));
      setEditing(null);
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function onPatch(id, form) {
    setBusy(true);
    setError(null);
    try {
      await apiPatch(`/api/v1/exercises/${id}`, fromForm(form));
      setEditing(null);
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(ex) {
    const ok = window.confirm(
      `Supprimer "${ex.name}" ? Si l'exercice est utilisé dans des séances historiques, il sera archivé plutôt que supprimé.`,
    );
    if (!ok) return;
    setBusy(true);
    try {
      await apiDelete(`/api/v1/exercises/${ex.id}`);
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (error && !exercises) {
    return (
      <div role="alert" className="text-danger text-sm">
        {error}
      </div>
    );
  }
  if (!exercises) return <p className="text-muted text-sm">Chargement…</p>;

  return (
    <div className="grid gap-md">
      <header className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold">Exercices</h2>
        <div className="flex items-center gap-md">
          <label className="flex items-center gap-xs text-sm text-muted">
            <input
              type="checkbox"
              checked={includeArchived}
              onChange={(e) => setIncludeArchived(e.target.checked)}
            />
            Afficher les archivés
          </label>
          <button
            type="button"
            onClick={() => setEditing({ kind: 'new', form: { ...empty } })}
            className="bg-accent text-white px-md py-sm rounded-md min-h-[44px]"
          >
            + Nouvel exercice
          </button>
        </div>
      </header>

      {error ? (
        <p role="alert" className="text-danger text-sm">
          {error}
        </p>
      ) : null}

      <ul className="grid gap-sm">
        {visible.map((ex) => (
          <li
            key={ex.id}
            className="bg-bg border border-muted/30 rounded-md p-md flex items-center gap-md"
          >
            <div className="flex-1">
              <p className="font-semibold">
                {ex.name}{' '}
                {!ex.is_active ? <span className="text-xs text-muted">(archivé)</span> : null}
              </p>
              <p className="text-sm text-muted">{(ex.targeted_muscles ?? []).join(', ')}</p>
            </div>
            <button
              type="button"
              onClick={() => setEditing({ kind: 'edit', id: ex.id, form: toForm(ex) })}
              className="text-accent hover:underline px-md py-sm min-h-[44px]"
            >
              Modifier
            </button>
            <button
              type="button"
              onClick={() => onDelete(ex)}
              className="text-danger hover:underline px-md py-sm min-h-[44px]"
            >
              Supprimer
            </button>
          </li>
        ))}
      </ul>

      {editing ? (
        <ExerciseEditor
          key={editing.kind === 'new' ? 'new' : `edit:${editing.id}`}
          editing={editing}
          busy={busy}
          onCancel={() => setEditing(null)}
          onSubmit={(form) => (editing.kind === 'new' ? onCreate(form) : onPatch(editing.id, form))}
        />
      ) : null}
    </div>
  );
}

function ExerciseEditor({ editing, busy, onCancel, onSubmit }) {
  const [form, setForm] = useState(editing.form);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(form);
      }}
      className="bg-bg border border-muted/30 rounded-md p-md grid gap-sm"
    >
      <h3 className="text-xl font-semibold">
        {editing.kind === 'new' ? 'Nouvel exercice' : "Modifier l'exercice"}
      </h3>
      <label className="block">
        <span className="block text-sm text-muted mb-xs">Nom</span>
        <input
          required
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className="w-full bg-bg border border-muted/30 text-text rounded-md px-md py-sm min-h-[44px]"
        />
      </label>
      <label className="block">
        <span className="block text-sm text-muted mb-xs">
          Muscles ciblés (séparés par des virgules)
        </span>
        <input
          required
          value={form.targeted_muscles}
          onChange={(e) => setForm({ ...form, targeted_muscles: e.target.value })}
          className="w-full bg-bg border border-muted/30 text-text rounded-md px-md py-sm min-h-[44px]"
        />
      </label>
      <label className="block">
        <span className="block text-sm text-muted mb-xs">Instructions</span>
        <textarea
          required
          value={form.instructions}
          onChange={(e) => setForm({ ...form, instructions: e.target.value })}
          rows={3}
          className="w-full bg-bg border border-muted/30 text-text rounded-md px-md py-sm"
        />
      </label>
      <label className="block">
        <span className="block text-sm text-muted mb-xs">
          Points de technique (séparés par des virgules)
        </span>
        <input
          value={form.technique_points}
          onChange={(e) => setForm({ ...form, technique_points: e.target.value })}
          className="w-full bg-bg border border-muted/30 text-text rounded-md px-md py-sm min-h-[44px]"
        />
      </label>
      <div className="flex justify-end gap-sm">
        <button
          type="button"
          onClick={onCancel}
          className="border border-muted/30 px-md py-sm rounded-md min-h-[44px]"
        >
          Annuler
        </button>
        <button
          type="submit"
          disabled={busy}
          className="bg-accent text-white px-md py-sm rounded-md min-h-[44px] disabled:opacity-40"
        >
          {busy ? '…' : 'Enregistrer'}
        </button>
      </div>
    </form>
  );
}

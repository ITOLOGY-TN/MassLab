// US4 — link/unlink alternative exercises. Surfaces self/duplicate errors.
import { useEffect, useState } from 'react';
import { listExercises, addAlternative, removeAlternative } from '../lib/programApi.js';

export default function AlternativesEditor({ exerciseId, alternatives = [], onChange }) {
  const [options, setOptions] = useState([]);
  const [picked, setPicked] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    const excluded = new Set([Number(exerciseId), ...alternatives.map((a) => a.exercise_id)]);
    listExercises()
      .then((list) => active && setOptions(list.filter((e) => !excluded.has(e.id))))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [exerciseId, alternatives]);

  async function run(fn) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onChange?.();
    } catch (err) {
      setError(
        err?.code === 'SELF_LINK_FORBIDDEN'
          ? 'Un exercice ne peut pas être sa propre alternative.'
          : err?.code === 'CONFLICT'
            ? 'Cette alternative est déjà liée.'
            : (err?.message ?? 'Échec de l’opération.'),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      data-testid="alternatives-editor"
      className="flex flex-col gap-sm rounded-lg border border-muted/20 p-md"
    >
      <div className="flex items-center gap-sm">
        <select
          data-testid="alt-select"
          value={picked}
          onChange={(e) => setPicked(e.target.value)}
          className="flex-1 rounded-md border border-muted/30 bg-bg px-sm py-xs text-sm"
        >
          <option value="">Choisir un exercice…</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={busy || !picked}
          onClick={() =>
            run(async () => {
              await addAlternative(exerciseId, Number(picked));
              setPicked('');
            })
          }
          className="rounded-md bg-accent px-sm py-xs text-xs font-medium text-bg disabled:opacity-50"
        >
          Lier
        </button>
      </div>

      {alternatives.length > 0 && (
        <ul className="flex flex-col gap-xs">
          {alternatives.map((alt) => (
            <li key={alt.exercise_id} className="flex items-center justify-between text-sm">
              <span className="text-text">{alt.name}</span>
              <button
                type="button"
                disabled={busy}
                data-testid="alt-remove"
                onClick={() => run(() => removeAlternative(exerciseId, alt.exercise_id))}
                className="text-xs text-danger hover:underline"
              >
                Délier
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

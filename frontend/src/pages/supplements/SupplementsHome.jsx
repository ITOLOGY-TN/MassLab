// Phase 8 (011-phase8-supplements) — the supplements home: a one-tap daily checklist
// with per-supplement streaks (creatine as the hero), the weekly adherence grid, and
// the current-week self-assessment. Premium Tailwind on the shared design tokens; the
// toggle is a large one-handed hit target (athlete-first UX).
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  getChecklist,
  toggleIntake,
  getGrid,
  getAssessments,
  putAssessment,
} from '../../lib/supplementsApi.js';
import StateBlock from '../../components/StateBlock.jsx';
import WeeklyGrid from '../../components/supplements/WeeklyGrid.jsx';

const TIME_LABELS = {
  morning: 'Matin',
  post_workout: 'Post-entraînement',
  evening: 'Soir',
  with_meal: 'Au repas',
  pre_workout: 'Pré-entraînement',
};

const DIMENSIONS = [
  { key: 'energy', label: 'Énergie' },
  { key: 'recovery', label: 'Récupération' },
  { key: 'sleep_quality', label: 'Sommeil' },
  { key: 'strength', label: 'Force' },
];

// Shift a YYYY-MM-DD string by whole days (UTC-anchored, matches the backend).
function shiftIso(isoDate, days) {
  const d = new Date(`${isoDate}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// ---- Streak badge -----------------------------------------------------------
function StreakBadge({ streak, primary }) {
  return (
    <span
      data-testid="streak-count"
      className={`inline-flex items-center gap-xs rounded-full px-sm py-xs font-semibold tabular-nums ${
        primary ? 'bg-accent/15 text-accent text-base' : 'bg-surface/60 text-muted text-xs'
      }`}
      title={`${streak} jour(s) d'affilée`}
    >
      <span aria-hidden="true">🔥</span>
      {streak}
    </span>
  );
}

// ---- One supplement card ----------------------------------------------------
function SupplementCard({ supp, onToggle, busy }) {
  const primary = supp.is_primary;
  return (
    <div
      data-testid="supplement-card"
      data-primary={primary ? 'true' : 'false'}
      className={`flex items-center justify-between gap-md rounded-lg border p-lg shadow-sm transition ${
        primary
          ? 'border-accent/40 bg-accent/5 ring-1 ring-accent/20 sm:p-xl'
          : 'border-surface bg-surface/40'
      }`}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-sm">
          <h3 className={`truncate font-semibold text-text ${primary ? 'text-lg' : 'text-base'}`}>
            {supp.name}
          </h3>
          {primary && (
            <span className="rounded-full bg-accent/20 px-sm py-px text-[10px] font-medium uppercase tracking-wide text-accent">
              Clé
            </span>
          )}
        </div>
        <p className="mt-xs text-sm text-muted">
          {supp.dosage}
          {supp.recommended_time
            ? ` · ${TIME_LABELS[supp.recommended_time] ?? supp.recommended_time}`
            : ''}
        </p>
        <div className="mt-sm">
          <StreakBadge streak={supp.streak} primary={primary} />
        </div>
      </div>

      <button
        type="button"
        data-testid="intake-toggle"
        data-taken={supp.taken ? 'true' : 'false'}
        disabled={busy}
        onClick={() => onToggle(supp)}
        aria-pressed={supp.taken}
        aria-label={`${supp.taken ? 'Retirer' : 'Marquer pris'} — ${supp.name}`}
        className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-2 text-2xl transition disabled:opacity-50 ${
          supp.taken
            ? 'border-success bg-success/80 text-white'
            : 'border-surface bg-surface/40 text-muted hover:border-accent hover:text-accent'
        }`}
      >
        {supp.taken ? '✓' : '+'}
      </button>
    </div>
  );
}

// ---- Weekly self-assessment form --------------------------------------------
function AssessmentForm({ assessment, onSave, saving }) {
  const initial = assessment?.current ?? {};
  const [ratings, setRatings] = useState({
    energy: initial.energy ?? 3,
    recovery: initial.recovery ?? 3,
    sleep_quality: initial.sleep_quality ?? 3,
    strength: initial.strength ?? 3,
  });

  // Re-sync when a freshly-loaded assessment arrives.
  useEffect(() => {
    const c = assessment?.current;
    if (c) {
      setRatings({
        energy: c.energy,
        recovery: c.recovery,
        sleep_quality: c.sleep_quality,
        strength: c.strength,
      });
    }
  }, [assessment]);

  return (
    <form
      data-testid="assessment-form"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(ratings);
      }}
      className="rounded-lg border border-surface bg-surface/40 p-lg shadow-sm"
    >
      <div className="mb-md flex items-baseline justify-between gap-md">
        <h2 className="text-base font-semibold text-text">Auto-évaluation de la semaine</h2>
        <Link to="/supplements/trends" className="text-xs text-accent hover:underline">
          Voir les tendances →
        </Link>
      </div>
      <div className="grid gap-md sm:grid-cols-2">
        {DIMENSIONS.map((d) => (
          <label key={d.key} className="flex flex-col gap-xs text-sm text-text">
            {d.label}
            <select
              aria-label={d.label}
              value={ratings[d.key]}
              onChange={(e) => setRatings((r) => ({ ...r, [d.key]: Number(e.target.value) }))}
              className="rounded-md border border-surface bg-surface/60 px-sm py-xs text-text"
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <button
        type="submit"
        data-testid="assessment-save"
        disabled={saving}
        className="mt-md rounded-md bg-accent px-lg py-sm text-sm font-medium text-white disabled:opacity-50"
      >
        {saving ? 'Enregistrement…' : 'Enregistrer'}
      </button>
    </form>
  );
}

export default function SupplementsHome() {
  const [checklist, setChecklist] = useState({ status: 'loading', data: null });
  const [grid, setGrid] = useState(null);
  const [assessment, setAssessment] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [saving, setSaving] = useState(false);

  const loadChecklist = useCallback(async () => {
    try {
      const data = await getChecklist();
      setChecklist({ status: 'ready', data });
    } catch {
      setChecklist({ status: 'error', data: null });
    }
  }, []);

  const loadGrid = useCallback(async (week) => {
    try {
      setGrid(await getGrid(week));
    } catch {
      /* grid is non-critical; leave as-is */
    }
  }, []);

  const loadAssessment = useCallback(async () => {
    try {
      setAssessment(await getAssessments());
    } catch {
      /* assessment is non-critical */
    }
  }, []);

  useEffect(() => {
    loadChecklist();
    loadGrid();
    loadAssessment();
  }, [loadChecklist, loadGrid, loadAssessment]);

  const onToggle = useCallback(
    async (supp) => {
      const date = checklist.data?.date;
      if (!date) return;
      setBusyId(supp.id);
      try {
        await toggleIntake({ supplement_id: supp.id, logged_on: date, taken: !supp.taken });
        await Promise.all([loadChecklist(), loadGrid(grid?.week_start)]);
      } catch {
        // On a rejected toggle (e.g. 422), resync to server truth rather than
        // leave the UI showing a state the server didn't accept.
        await Promise.all([loadChecklist(), loadGrid(grid?.week_start)]);
      } finally {
        setBusyId(null);
      }
    },
    [checklist.data, grid, loadChecklist, loadGrid],
  );

  const onSaveAssessment = useCallback(
    async (ratings) => {
      setSaving(true);
      try {
        await putAssessment(ratings);
        await loadAssessment();
      } catch {
        /* validation errors are guarded by the 1–5 selects */
      } finally {
        setSaving(false);
      }
    },
    [loadAssessment],
  );

  const supplements = checklist.data?.supplements ?? [];

  return (
    <main className="mx-auto max-w-2xl px-lg py-lg">
      <header className="mb-lg">
        <p className="mb-xs text-sm text-muted">MassLab</p>
        <h1 className="text-2xl font-semibold text-text">Suppléments</h1>
        <p className="mt-xs text-muted">Coche tes compléments du jour et garde la série.</p>
      </header>

      {checklist.status === 'loading' && <StateBlock kind="loading" />}
      {checklist.status === 'error' && (
        <StateBlock kind="error" title="Erreur" message="Impossible de charger les compléments." />
      )}

      {checklist.status === 'ready' && (
        <div className="flex flex-col gap-lg">
          {supplements.length === 0 ? (
            <StateBlock
              kind="empty"
              title="Aucun complément"
              message="Aucun complément n’est configuré pour le moment."
            />
          ) : (
            <section className="flex flex-col gap-md">
              {supplements.map((supp) => (
                <SupplementCard
                  key={supp.id}
                  supp={supp}
                  onToggle={onToggle}
                  busy={busyId === supp.id}
                />
              ))}
            </section>
          )}

          <WeeklyGrid
            grid={grid}
            onPrevWeek={() => grid && loadGrid(shiftIso(grid.week_start, -7))}
            onNextWeek={() => grid && loadGrid(shiftIso(grid.week_start, 7))}
          />

          <AssessmentForm
            assessment={assessment}
            onSave={onSaveAssessment}
            saving={saving}
          />
        </div>
      )}
    </main>
  );
}

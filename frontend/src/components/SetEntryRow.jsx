// Phase 4 — one set's input row: weight (±2.5), reps (±1), optional RPE, and a
// complete control. A set cannot be completed without weight > 0 and reps > 0
// (FR-006..FR-009).
import QuickStepper from './QuickStepper.jsx';

export default function SetEntryRow({ set, index, onChange, onComplete, onRemove }) {
  const canComplete = Number(set.weight_kg) > 0 && Number(set.reps) > 0;
  return (
    <div
      data-testid="set-entry-row"
      className={`flex flex-wrap items-end gap-md rounded-lg border px-md py-sm ${
        set.completed ? 'border-success/50 bg-success/5' : 'border-muted/20 bg-surface'
      }`}
    >
      <span className="text-xs text-muted w-8 pb-sm">#{index + 1}</span>
      <QuickStepper
        label="Poids"
        suffix="kg"
        step={2.5}
        value={set.weight_kg}
        testid={`weight-${index}`}
        disabled={set.completed}
        onChange={(v) => onChange({ weight_kg: v })}
      />
      <QuickStepper
        label="Reps"
        step={1}
        value={set.reps}
        testid={`reps-${index}`}
        disabled={set.completed}
        onChange={(v) => onChange({ reps: v })}
      />
      <label className="flex flex-col gap-xs">
        <span className="text-xs text-muted">RPE</span>
        <input
          type="number"
          min={1}
          max={10}
          value={set.rpe ?? ''}
          disabled={set.completed}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === '') return onChange({ rpe: null });
            const n = Number(raw);
            return onChange({ rpe: Number.isNaN(n) ? null : Math.max(1, Math.min(10, n)) });
          }}
          className="w-16 bg-bg border border-muted/30 text-text text-center rounded-md px-sm py-sm min-h-[44px] focus:outline-none focus:border-accent"
        />
      </label>
      <button
        type="button"
        data-testid={`complete-${index}`}
        disabled={set.completed || !canComplete}
        onClick={onComplete}
        className="min-h-[44px] px-md rounded-md bg-success text-white text-sm font-semibold hover:bg-success/90 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {set.completed ? '✓ Fait' : 'Valider'}
      </button>
      {!set.completed && (
        <button
          type="button"
          aria-label="Supprimer la série"
          onClick={onRemove}
          className="min-h-[44px] px-sm rounded-md text-muted hover:text-danger"
        >
          ✕
        </button>
      )}
    </div>
  );
}

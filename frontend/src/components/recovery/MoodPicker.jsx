// Phase 9 (012-phase9-recovery-wellbeing) T014 — single-select emoji mood row.
// Renders one button per mood key in `options` (sourced from the API's
// options.moods so the client hardcodes no list). Each known key maps to an
// emoji + a localized (fr-FR) label; unknown keys degrade gracefully. Plain
// Tailwind on the shared design tokens — large hit targets (Constitution VI).

// Mood key → { emoji, label (fr-FR) }. Covers the RECOVERY_MOOD_OPTIONS
// defaults (great, good, ok, low, bad); any key absent here falls back to a
// neutral glyph + the raw key so the row never breaks on a config change.
const MOOD_META = {
  great: { emoji: '😄', label: 'Excellent' },
  good: { emoji: '🙂', label: 'Bien' },
  ok: { emoji: '😐', label: 'Correct' },
  low: { emoji: '😕', label: 'Bas' },
  bad: { emoji: '😣', label: 'Mauvais' },
};

const FALLBACK = { emoji: '❔', label: null };

export default function MoodPicker({ options, value, onChange, disabled }) {
  const moods = options ?? [];
  if (moods.length === 0) return null;

  return (
    <div
      role="radiogroup"
      aria-label="Humeur"
      data-testid="mood-picker"
      className="flex flex-wrap gap-sm"
    >
      {moods.map((key) => {
        const meta = MOOD_META[key] ?? FALLBACK;
        const label = meta.label ?? key;
        const selected = value === key;
        return (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={label}
            disabled={disabled}
            data-testid="mood-option"
            data-mood={key}
            data-selected={selected ? 'true' : 'false'}
            onClick={() => onChange(selected ? null : key)}
            className={[
              'flex min-w-[4.5rem] flex-1 flex-col items-center gap-xs rounded-lg border px-sm py-md',
              'transition-colors focus:outline-none focus:border-accent',
              selected
                ? 'border-accent bg-accent/15 text-text'
                : 'border-surface bg-surface/40 text-muted hover:text-text',
              disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
            ].join(' ')}
          >
            <span aria-hidden="true" className="text-2xl leading-none">
              {meta.emoji}
            </span>
            <span className="text-xs font-medium">{label}</span>
          </button>
        );
      })}
    </div>
  );
}

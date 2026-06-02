// Progression indicator pill — maps the three states to a label + tone.
// FR-010 / research D-4.
const VARIANTS = {
  ready_to_increase: { label: 'Prêt à augmenter', cls: 'bg-success/15 text-success' },
  regressing: { label: 'En régression', cls: 'bg-danger/15 text-danger' },
  stable: { label: 'Stable', cls: 'bg-muted/15 text-muted' },
};

export default function ProgressionBadge({ state }) {
  const v = VARIANTS[state] ?? VARIANTS.stable;
  return (
    <span
      data-testid="progression-badge"
      data-state={state}
      className={`inline-flex items-center rounded-md px-sm py-xs text-xs font-medium ${v.cls}`}
    >
      {v.label}
    </span>
  );
}

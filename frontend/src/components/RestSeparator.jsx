// A compact rest-day marker — visually lighter than a training-day card so the
// week's rhythm reads at a glance (FR-003).
const DAY_LABELS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

export default function RestSeparator({ dayOfWeek }) {
  return (
    <div
      data-testid="rest-separator"
      className="flex items-center gap-sm px-md py-sm text-xs uppercase tracking-wide text-muted/70"
    >
      <span className="font-medium">{DAY_LABELS[dayOfWeek - 1]}</span>
      <span className="h-px flex-1 bg-muted/20" />
      <span>Repos</span>
    </div>
  );
}

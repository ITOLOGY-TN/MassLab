// Shared loading / empty / error panel for the Training Program views.
// Keeps every screen's non-content states consistent (Athlete-First UX).
export default function StateBlock({ kind = 'loading', title, message, action }) {
  const tone = kind === 'error' ? 'text-danger' : kind === 'empty' ? 'text-muted' : 'text-muted';
  return (
    <div
      role={kind === 'error' ? 'alert' : 'status'}
      className="flex flex-col items-center justify-center gap-sm rounded-lg border border-muted/20 bg-surface px-lg py-xl text-center"
    >
      {title && <p className={`text-base font-semibold ${tone}`}>{title}</p>}
      <p className="text-sm text-muted">{message ?? (kind === 'loading' ? 'Chargement…' : '')}</p>
      {action}
    </div>
  );
}

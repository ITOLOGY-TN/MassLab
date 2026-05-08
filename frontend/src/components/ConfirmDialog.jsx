import { useEffect, useRef, useState } from 'react';

export default function ConfirmDialog({
  open,
  title,
  description,
  confirmToken,
  confirmLabel = 'Confirmer',
  cancelLabel = 'Annuler',
  destructive = true,
  onConfirm,
  onCancel,
}) {
  const [typed, setTyped] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) {
      setTyped('');
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  if (!open) return null;
  const tokenRequired = Boolean(confirmToken);
  const canConfirm = !tokenRequired || typed === confirmToken;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-md"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel?.();
      }}
    >
      <div className="bg-surface rounded-lg p-lg max-w-md w-full shadow-xl">
        <h2 id="confirm-title" className="text-xl font-semibold mb-sm">
          {title}
        </h2>
        {description ? (
          <p className="text-sm text-muted mb-md whitespace-pre-line">{description}</p>
        ) : null}
        {tokenRequired ? (
          <label className="block mb-md">
            <span className="block text-sm text-muted mb-xs">
              Tapez <code className="text-text">{confirmToken}</code> pour confirmer
            </span>
            <input
              ref={inputRef}
              type="text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              className="w-full bg-bg border border-muted/30 text-text rounded-md px-md py-sm focus:outline-none focus:border-accent min-h-[44px]"
              autoComplete="off"
            />
          </label>
        ) : null}
        <div className="flex gap-sm justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="px-md py-sm rounded-md border border-muted/30 hover:border-muted min-h-[44px] min-w-[88px]"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={!canConfirm}
            onClick={onConfirm}
            className={`px-md py-sm rounded-md min-h-[44px] min-w-[88px] disabled:opacity-40 disabled:cursor-not-allowed ${
              destructive
                ? 'bg-danger text-white hover:bg-danger/90'
                : 'bg-accent text-white hover:bg-accent/90'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

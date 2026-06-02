// Phase 4 — one-handed numeric stepper with large −/＋ buttons (Constitution VI:
// ±2.5 kg / ±1 rep quick buttons, no fine-precision keyboard during a set).
function round2(n) {
  return Math.round(n * 100) / 100;
}

export default function QuickStepper({
  label,
  value,
  onChange,
  step = 1,
  min = 0,
  max,
  suffix,
  testid,
  disabled = false,
}) {
  const v = Number(value ?? 0);
  const dec = () => onChange(round2(Math.max(min, v - step)));
  const inc = () => onChange(round2(max != null ? Math.min(max, v + step) : v + step));
  const btn =
    'min-h-[44px] min-w-[44px] rounded-md bg-muted/15 text-text text-lg font-semibold ' +
    'hover:bg-muted/30 active:bg-muted/40 disabled:opacity-40';

  return (
    <div className="flex flex-col gap-xs">
      {label && <span className="text-xs text-muted">{label}</span>}
      <div className="flex items-center gap-xs">
        <button
          type="button"
          aria-label={`-${step}`}
          className={btn}
          onClick={dec}
          disabled={disabled}
        >
          −
        </button>
        <input
          type="number"
          inputMode="decimal"
          value={value ?? ''}
          data-testid={testid}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))}
          className="w-20 bg-bg border border-muted/30 text-text text-center rounded-md px-sm py-sm min-h-[44px] focus:outline-none focus:border-accent"
        />
        <button
          type="button"
          aria-label={`+${step}`}
          className={btn}
          onClick={inc}
          disabled={disabled}
        >
          ＋
        </button>
        {suffix && <span className="text-xs text-muted">{suffix}</span>}
      </div>
    </div>
  );
}

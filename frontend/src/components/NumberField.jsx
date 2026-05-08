export default function NumberField({ label, name, value, onChange, min, max, step = 1, required }) {
  return (
    <label className="block">
      <span className="block text-sm text-muted mb-xs">{label}</span>
      <input
        type="number"
        name={name}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
        min={min}
        max={max}
        step={step}
        required={required}
        className="w-full bg-bg border border-muted/30 text-text rounded-md px-md py-sm focus:outline-none focus:border-accent"
      />
    </label>
  );
}

export default function SelectField({ label, name, value, onChange, options, required }) {
  return (
    <label className="block">
      <span className="block text-sm text-muted mb-xs">{label}</span>
      <select
        name={name}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className="w-full bg-bg border border-muted/30 text-text rounded-md px-md py-sm focus:outline-none focus:border-accent"
      >
        <option value="" disabled>
          —
        </option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}

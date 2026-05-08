import { useState } from 'react';
import { apiPost } from '../../lib/api.js';
import NumberField from '../../components/NumberField.jsx';
import SelectField from '../../components/SelectField.jsx';
import ResultCard from '../../components/ResultCard.jsx';

const SEX_OPTIONS = [
  { value: 'male', label: 'Homme' },
  { value: 'female', label: 'Femme' },
];

export default function BmrCalculator() {
  const [form, setForm] = useState({
    weight_kg: 58,
    height_cm: 173,
    age: 29,
    biological_sex: 'male',
  });
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const set = (k) => (v) => setForm((s) => ({ ...s, [k]: v }));

  async function onSubmit(e) {
    e.preventDefault();
    setError(null);
    try {
      const res = await apiPost('/api/v1/calculators/bmr', form);
      setResult(res.data);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <main className="min-h-full p-lg max-w-2xl mx-auto">
      <h1 className="text-3xl font-semibold mb-lg">BMR — Mifflin–St Jeor</h1>
      <form onSubmit={onSubmit} className="grid grid-cols-2 gap-md mb-lg">
        <NumberField label="Poids (kg)" name="weight_kg" value={form.weight_kg} onChange={set('weight_kg')} step={0.1} required />
        <NumberField label="Taille (cm)" name="height_cm" value={form.height_cm} onChange={set('height_cm')} step={0.1} required />
        <NumberField label="Âge" name="age" value={form.age} onChange={set('age')} required />
        <SelectField label="Sexe biologique" name="biological_sex" value={form.biological_sex} onChange={set('biological_sex')} options={SEX_OPTIONS} required />
        <div className="col-span-2">
          <button type="submit" className="bg-accent text-bg rounded-md px-lg py-sm font-semibold">
            Calculer
          </button>
        </div>
      </form>
      {error ? <ResultCard title="Erreur"><p className="text-danger">{error}</p></ResultCard> : null}
      {result ? (
        <ResultCard title="Résultat">
          <p className="text-3xl font-semibold">{result.bmr_kcal} kcal/j</p>
        </ResultCard>
      ) : null}
    </main>
  );
}

import { useState } from 'react';
import { apiPost } from '../../lib/api.js';
import NumberField from '../../components/NumberField.jsx';
import SelectField from '../../components/SelectField.jsx';
import ResultCard from '../../components/ResultCard.jsx';

const SEX_OPTIONS = [
  { value: 'male', label: 'Homme' },
  { value: 'female', label: 'Femme' },
];

export default function BodyCompositionCalculator() {
  const [form, setForm] = useState({
    weight_kg: 58,
    height_cm: 173,
    age: 29,
    biological_sex: 'male',
    waist_cm: '',
    neck_cm: '',
    hip_cm: '',
  });
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const set = (k) => (v) => setForm((s) => ({ ...s, [k]: v }));

  async function onSubmit(e) {
    e.preventDefault();
    setError(null);
    const body = { ...form };
    for (const k of ['waist_cm', 'neck_cm', 'hip_cm']) {
      if (body[k] === '' || body[k] == null) delete body[k];
    }
    try {
      const res = await apiPost('/api/v1/calculators/body-composition', body);
      setResult(res.data);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <main className="min-h-full p-lg max-w-2xl mx-auto">
      <h1 className="text-3xl font-semibold mb-lg">Composition corporelle</h1>
      <form onSubmit={onSubmit} className="grid grid-cols-2 gap-md mb-lg">
        <NumberField
          label="Poids (kg)"
          name="weight_kg"
          value={form.weight_kg}
          onChange={set('weight_kg')}
          step={0.1}
          required
        />
        <NumberField
          label="Taille (cm)"
          name="height_cm"
          value={form.height_cm}
          onChange={set('height_cm')}
          step={0.1}
          required
        />
        <NumberField label="Âge" name="age" value={form.age} onChange={set('age')} required />
        <SelectField
          label="Sexe"
          name="biological_sex"
          value={form.biological_sex}
          onChange={set('biological_sex')}
          options={SEX_OPTIONS}
          required
        />
        <NumberField
          label="Tour de taille (cm, opt.)"
          name="waist_cm"
          value={form.waist_cm}
          onChange={set('waist_cm')}
          step={0.5}
        />
        <NumberField
          label="Tour de cou (cm, opt.)"
          name="neck_cm"
          value={form.neck_cm}
          onChange={set('neck_cm')}
          step={0.5}
        />
        {form.biological_sex === 'female' ? (
          <NumberField
            label="Tour de hanches (cm)"
            name="hip_cm"
            value={form.hip_cm}
            onChange={set('hip_cm')}
            step={0.5}
          />
        ) : null}
        <div className="col-span-2">
          <button type="submit" className="bg-accent text-bg rounded-md px-lg py-sm font-semibold">
            Calculer
          </button>
        </div>
      </form>
      {error ? (
        <ResultCard title="Erreur">
          <p className="text-danger">{error}</p>
        </ResultCard>
      ) : null}
      {result ? (
        <ResultCard
          title="Résultat"
          footnote={`Méthode : ${result.method === 'us_navy' ? 'U.S. Navy (multi-mesures)' : 'Estimation BMI'}.`}
        >
          <dl className="grid grid-cols-2 gap-sm">
            <dt className="text-muted">Body-fat %</dt>
            <dd className="text-2xl font-semibold">{result.body_fat_pct} %</dd>
            <dt className="text-muted">Masse maigre</dt>
            <dd>{result.lean_body_mass_kg} kg</dd>
          </dl>
        </ResultCard>
      ) : null}
    </main>
  );
}

import { useState } from 'react';
import { apiPost } from '../../lib/api.js';
import NumberField from '../../components/NumberField.jsx';
import SelectField from '../../components/SelectField.jsx';
import ResultCard from '../../components/ResultCard.jsx';

const SEX_OPTIONS = [
  { value: 'male', label: 'Homme' },
  { value: 'female', label: 'Femme' },
];
const ACTIVITY_OPTIONS = [
  { value: 'sedentary', label: 'Sédentaire' },
  { value: 'lightly_active', label: 'Légèrement actif' },
  { value: 'moderately_active', label: 'Modérément actif' },
  { value: 'very_active', label: 'Très actif' },
  { value: 'extremely_active', label: 'Extrêmement actif' },
];
const MORPHOTYPE_OPTIONS = [
  { value: 'ectomorph', label: 'Ectomorphe' },
  { value: 'mesomorph', label: 'Mésomorphe' },
  { value: 'endomorph', label: 'Endomorphe' },
];
const GOAL_OPTIONS = [
  { value: 'bulk', label: 'Prise de masse' },
  { value: 'cut', label: 'Sèche' },
  { value: 'maintain', label: 'Maintenance' },
];

export default function MacrosCalculator() {
  const [form, setForm] = useState({
    weight_kg: 58,
    height_cm: 173,
    age: 29,
    biological_sex: 'male',
    activity_level: 'moderately_active',
    morphotype: 'ectomorph',
    goal: 'bulk',
    lean_body_mass_kg: '',
  });
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const set = (k) => (v) => setForm((s) => ({ ...s, [k]: v }));

  async function onSubmit(e) {
    e.preventDefault();
    setError(null);
    const body = { ...form };
    if (body.lean_body_mass_kg === '' || body.lean_body_mass_kg == null) {
      delete body.lean_body_mass_kg;
    }
    try {
      const res = await apiPost('/api/v1/calculators/macros', body);
      setResult(res.data);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <main className="min-h-full p-lg max-w-2xl mx-auto">
      <h1 className="text-3xl font-semibold mb-lg">Macros</h1>
      <form onSubmit={onSubmit} className="grid grid-cols-2 gap-md mb-lg">
        <NumberField label="Poids (kg)" name="weight_kg" value={form.weight_kg} onChange={set('weight_kg')} step={0.1} required />
        <NumberField label="Taille (cm)" name="height_cm" value={form.height_cm} onChange={set('height_cm')} step={0.1} required />
        <NumberField label="Âge" name="age" value={form.age} onChange={set('age')} required />
        <SelectField label="Sexe" name="biological_sex" value={form.biological_sex} onChange={set('biological_sex')} options={SEX_OPTIONS} required />
        <SelectField label="Activité" name="activity_level" value={form.activity_level} onChange={set('activity_level')} options={ACTIVITY_OPTIONS} required />
        <SelectField label="Morphotype" name="morphotype" value={form.morphotype} onChange={set('morphotype')} options={MORPHOTYPE_OPTIONS} required />
        <SelectField label="Objectif" name="goal" value={form.goal} onChange={set('goal')} options={GOAL_OPTIONS} required />
        <NumberField label="Masse maigre (kg, optionnel)" name="lean_body_mass_kg" value={form.lean_body_mass_kg} onChange={set('lean_body_mass_kg')} step={0.1} />
        <div className="col-span-2">
          <button type="submit" className="bg-accent text-bg rounded-md px-lg py-sm font-semibold">
            Calculer
          </button>
        </div>
      </form>
      {error ? <ResultCard title="Erreur"><p className="text-danger">{error}</p></ResultCard> : null}
      {result ? (
        <ResultCard title="Résultat">
          <dl className="grid grid-cols-2 gap-sm">
            <dt className="text-muted">BMR</dt>
            <dd>{result.bmr_kcal} kcal</dd>
            <dt className="text-muted">TDEE</dt>
            <dd>{result.tdee_kcal} kcal</dd>
            <dt className="text-muted">Calories</dt>
            <dd className="text-2xl font-semibold">{result.daily_kcal} kcal/j</dd>
            <dt className="text-muted">Protéines</dt>
            <dd>{result.macros.protein_g} g</dd>
            <dt className="text-muted">Glucides</dt>
            <dd>{result.macros.carbs_g} g</dd>
            <dt className="text-muted">Lipides</dt>
            <dd>{result.macros.fat_g} g</dd>
          </dl>
        </ResultCard>
      ) : null}
    </main>
  );
}

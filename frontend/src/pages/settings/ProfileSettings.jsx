import { useEffect, useMemo, useRef, useState } from 'react';
import { apiGet, apiPatch } from '../../lib/api.js';
import NumberField from '../../components/NumberField.jsx';
import SelectField from '../../components/SelectField.jsx';

const SEX = [
  { value: 'male', label: 'Homme' },
  { value: 'female', label: 'Femme' },
];
const MORPHOTYPE = [
  { value: 'ectomorph', label: 'Ectomorphe' },
  { value: 'mesomorph', label: 'Mésomorphe' },
  { value: 'endomorph', label: 'Endomorphe' },
];
const ACTIVITY = [
  { value: 'sedentary', label: 'Sédentaire' },
  { value: 'lightly_active', label: 'Légèrement actif' },
  { value: 'moderately_active', label: 'Modérément actif' },
  { value: 'very_active', label: 'Très actif' },
  { value: 'extremely_active', label: 'Extrêmement actif' },
];

function fromDb(athlete) {
  if (!athlete) return null;
  return {
    display_name: athlete.display_name ?? '',
    age: athlete.age ?? '',
    biological_sex: athlete.biological_sex ?? 'male',
    height_cm: athlete.height_cm ?? '',
    current_weight_kg: athlete.starting_weight_kg ?? athlete.current_weight_kg ?? '',
    target_weight_kg: athlete.target_weight_kg ?? '',
    morphotype: athlete.morphotype ?? 'mesomorph',
    activity_level: athlete.activity_level ?? 'moderately_active',
    sessions_per_week: athlete.weekly_session_count ?? 5,
    program_start_date: athlete.program_start_date ?? '',
  };
}

const REQUIRED_NUMERIC = [
  'age',
  'height_cm',
  'current_weight_kg',
  'target_weight_kg',
  'sessions_per_week',
];

export default function ProfileSettings() {
  const [initial, setInitial] = useState(null);
  const [form, setForm] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [recompute, setRecompute] = useState(null);
  const dirtyRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    apiGet('/api/v1/me')
      .then((res) => {
        if (cancelled) return;
        const initialForm = fromDb(res.data);
        setInitial(initialForm);
        setForm(initialForm);
      })
      .catch((err) => setError(err.message));
    return () => {
      cancelled = true;
    };
  }, []);

  const dirty = useMemo(() => {
    if (!form || !initial) return false;
    return Object.keys(form).some((k) => String(form[k]) !== String(initial[k]));
  }, [form, initial]);

  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  useEffect(() => {
    const handler = (e) => {
      if (!dirtyRef.current) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  if (error) {
    return (
      <div role="alert" className="text-danger text-sm">
        {error}
      </div>
    );
  }
  if (!form) return <p className="text-muted text-sm">Chargement…</p>;

  function patchField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function buildBody() {
    const body = {};
    for (const k of Object.keys(form)) {
      if (String(form[k]) === String(initial[k])) continue;
      if (form[k] === '' || form[k] == null) continue;
      body[k] = REQUIRED_NUMERIC.includes(k) ? Number(form[k]) : form[k];
    }
    return body;
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError(null);
    setRecompute(null);
    const body = buildBody();
    if (Object.keys(body).length === 0) return;
    setSaving(true);
    try {
      const res = await apiPatch('/api/v1/me', body);
      const updated = fromDb(res.data?.profile ?? res.data?.athlete);
      setInitial(updated);
      setForm(updated);
      setRecompute(res.data?.recompute ?? null);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-md">
      <h2 className="text-2xl font-semibold">Profil</h2>

      <label className="block">
        <span className="block text-sm text-muted mb-xs">Nom affiché</span>
        <input
          type="text"
          value={form.display_name}
          onChange={(e) => patchField('display_name', e.target.value)}
          maxLength={100}
          className="w-full bg-bg border border-muted/30 text-text rounded-md px-md py-sm focus:outline-none focus:border-accent min-h-[44px]"
        />
      </label>

      <div className="grid grid-cols-2 gap-md">
        <NumberField
          label="Âge"
          name="age"
          value={form.age}
          onChange={(v) => patchField('age', v)}
          min={13}
          max={100}
        />
        <SelectField
          label="Sexe biologique"
          name="biological_sex"
          value={form.biological_sex}
          onChange={(v) => patchField('biological_sex', v)}
          options={SEX}
        />
        <NumberField
          label="Taille (cm)"
          name="height_cm"
          value={form.height_cm}
          onChange={(v) => patchField('height_cm', v)}
          min={100}
          max={250}
        />
        <NumberField
          label="Poids actuel (kg)"
          name="current_weight_kg"
          value={form.current_weight_kg}
          onChange={(v) => patchField('current_weight_kg', v)}
          min={30}
          max={250}
          step={0.1}
        />
        <NumberField
          label="Poids cible (kg)"
          name="target_weight_kg"
          value={form.target_weight_kg}
          onChange={(v) => patchField('target_weight_kg', v)}
          min={30}
          max={300}
          step={0.1}
        />
        <NumberField
          label="Séances / semaine"
          name="sessions_per_week"
          value={form.sessions_per_week}
          onChange={(v) => patchField('sessions_per_week', v)}
          min={1}
          max={7}
        />
        <SelectField
          label="Morphotype"
          name="morphotype"
          value={form.morphotype}
          onChange={(v) => patchField('morphotype', v)}
          options={MORPHOTYPE}
        />
        <SelectField
          label="Niveau d'activité"
          name="activity_level"
          value={form.activity_level}
          onChange={(v) => patchField('activity_level', v)}
          options={ACTIVITY}
        />
      </div>

      <label className="block">
        <span className="block text-sm text-muted mb-xs">Date de début du programme</span>
        <input
          type="date"
          value={form.program_start_date}
          onChange={(e) => patchField('program_start_date', e.target.value)}
          className="w-full bg-bg border border-muted/30 text-text rounded-md px-md py-sm focus:outline-none focus:border-accent min-h-[44px]"
        />
      </label>

      {error ? (
        <p role="alert" className="text-danger text-sm">
          {error}
        </p>
      ) : null}
      {recompute ? (
        <p role="status" className="text-success text-sm">
          Programme recalculé · audit #{recompute.calculation_audit_id} · moteur{' '}
          {recompute.engine_version}
        </p>
      ) : null}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={!dirty || saving}
          className="bg-accent text-white px-lg py-sm rounded-md min-h-[44px] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>
    </form>
  );
}

import { useEffect, useState } from 'react';
import { apiGet, apiPatch, apiPut, apiDelete } from '../../lib/api.js';
import { applyTheme } from '../../lib/theme.js';
import NumberField from '../../components/NumberField.jsx';
import SelectField from '../../components/SelectField.jsx';

const THEME = [
  { value: 'dark', label: 'Sombre' },
  { value: 'light', label: 'Clair' },
];
const UNITS = [
  { value: 'kg', label: 'Kilogrammes' },
  { value: 'lbs', label: 'Livres' },
];

export default function PreferencesSettings() {
  const [prefs, setPrefs] = useState(null);
  const [targets, setTargets] = useState(null);
  const [overrideDraft, setOverrideDraft] = useState({
    daily_kcal: '',
    daily_protein_g: '',
    daily_carbs_g: '',
    daily_fat_g: '',
  });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const [p, t] = await Promise.all([
      apiGet('/api/v1/me/preferences'),
      apiGet('/api/v1/me/nutrition-targets'),
    ]);
    setPrefs(p.data);
    setTargets(t.data);
  }

  useEffect(() => {
    refresh().catch((err) => setError(err.message));
  }, []);

  async function patchPref(patch) {
    try {
      const res = await apiPatch('/api/v1/me/preferences', patch);
      setPrefs(res.data);
      if (patch.theme) applyTheme(patch.theme);
    } catch (err) {
      setError(err.message);
    }
  }

  async function saveOverrides() {
    setBusy(true);
    setError(null);
    try {
      const body = {};
      for (const k of ['daily_kcal', 'daily_protein_g', 'daily_carbs_g', 'daily_fat_g']) {
        const v = overrideDraft[k];
        if (v === '' || v == null) continue;
        body[k] = Number(v);
      }
      if (Object.keys(body).length === 0) return;
      await apiPut('/api/v1/me/nutrition-targets', body);
      setOverrideDraft({ daily_kcal: '', daily_protein_g: '', daily_carbs_g: '', daily_fat_g: '' });
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function clearOverrides() {
    setBusy(true);
    setError(null);
    try {
      await apiDelete('/api/v1/me/nutrition-targets');
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (error && !prefs) {
    return (
      <div role="alert" className="text-danger text-sm">
        {error}
      </div>
    );
  }
  if (!prefs || !targets) return <p className="text-muted text-sm">Chargement…</p>;

  const hasOverride = Object.values(targets.source ?? {}).some((s) => s !== 'engine');

  return (
    <div className="grid gap-lg">
      <section className="grid gap-md">
        <h2 className="text-2xl font-semibold">Préférences</h2>
        <div className="grid grid-cols-2 gap-md">
          <SelectField
            label="Thème"
            name="theme"
            value={prefs.theme}
            onChange={(v) => patchPref({ theme: v })}
            options={THEME}
          />
          <SelectField
            label="Unités"
            name="units"
            value={prefs.units}
            onChange={(v) => patchPref({ units: v })}
            options={UNITS}
          />
          <label className="flex items-center gap-sm">
            <input
              type="checkbox"
              checked={prefs.rest_timer_sound}
              onChange={(e) => patchPref({ rest_timer_sound: e.target.checked })}
            />
            <span className="text-sm text-muted">Son du minuteur de repos</span>
          </label>
        </div>
      </section>

      <section className="grid gap-md">
        <h3 className="text-xl font-semibold">
          Nutrition personnalisée{' '}
          {hasOverride ? <span className="text-xs text-accent">(custom)</span> : null}
        </h3>
        <div className="grid grid-cols-2 gap-md">
          <Stat label="Calories" value={targets.daily_kcal} unit="kcal" source={targets.source.daily_kcal} />
          <Stat label="Protéines" value={targets.daily_protein_g} unit="g" source={targets.source.daily_protein_g} />
          <Stat label="Glucides" value={targets.daily_carbs_g} unit="g" source={targets.source.daily_carbs_g} />
          <Stat label="Lipides" value={targets.daily_fat_g} unit="g" source={targets.source.daily_fat_g} />
        </div>

        <h4 className="text-md font-semibold mt-md">Définir un objectif personnalisé</h4>
        <div className="grid grid-cols-2 gap-md">
          <NumberField
            label="Calories (kcal)"
            name="override_kcal"
            value={overrideDraft.daily_kcal}
            onChange={(v) => setOverrideDraft({ ...overrideDraft, daily_kcal: v })}
            min={800}
            max={6000}
          />
          <NumberField
            label="Protéines (g)"
            name="override_protein"
            value={overrideDraft.daily_protein_g}
            onChange={(v) => setOverrideDraft({ ...overrideDraft, daily_protein_g: v })}
            min={30}
            max={400}
          />
          <NumberField
            label="Glucides (g)"
            name="override_carbs"
            value={overrideDraft.daily_carbs_g}
            onChange={(v) => setOverrideDraft({ ...overrideDraft, daily_carbs_g: v })}
            min={0}
            max={800}
          />
          <NumberField
            label="Lipides (g)"
            name="override_fat"
            value={overrideDraft.daily_fat_g}
            onChange={(v) => setOverrideDraft({ ...overrideDraft, daily_fat_g: v })}
            min={20}
            max={250}
          />
        </div>
        <div className="flex gap-sm justify-end">
          {hasOverride ? (
            <button
              type="button"
              onClick={clearOverrides}
              disabled={busy}
              className="border border-muted/30 px-md py-sm rounded-md min-h-[44px]"
            >
              Effacer les surcharges
            </button>
          ) : null}
          <button
            type="button"
            onClick={saveOverrides}
            disabled={busy}
            className="bg-accent text-white px-md py-sm rounded-md min-h-[44px] disabled:opacity-40"
          >
            {busy ? '…' : 'Enregistrer'}
          </button>
        </div>
      </section>

      {error ? (
        <p role="alert" className="text-danger text-sm">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function Stat({ label, value, unit, source }) {
  return (
    <div className="bg-bg border border-muted/30 rounded-md p-md">
      <p className="text-sm text-muted">{label}</p>
      <p className="text-xl font-semibold">
        {value} {unit}
      </p>
      <p className="text-xs text-muted">{source}</p>
    </div>
  );
}

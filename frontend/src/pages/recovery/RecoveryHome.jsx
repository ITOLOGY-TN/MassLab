// Phase 9 (012-phase9-recovery-wellbeing) T015/T010 — the recovery home: a 30-second
// daily check-in (sleep-quality stars, sliders for hours/stress/energy with one-handed
// ±buttons, MoodPicker, BodyDiagram, an optional note) plus the smart RecoveryAlerts
// panel. Form state loads from GET /recovery/checkin (options.moods / options.sore_zones
// drive the mood + body pickers so nothing is hardcoded) and saves via PUT /recovery/checkin.
// Editing is disabled for any day outside the current ISO week (data.editable === false);
// prior weeks render read-only. Premium Tailwind on the shared design tokens; large hit
// targets throughout (Constitution VI — athlete-first, one-handed ergonomics).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { getCheckin, putCheckin, getAlerts } from '../../lib/recoveryApi.js';
import StateBlock from '../../components/StateBlock.jsx';
import QuickStepper from '../../components/QuickStepper.jsx';
import MoodPicker from '../../components/recovery/MoodPicker.jsx';
import BodyDiagram from '../../components/recovery/BodyDiagram.jsx';
import RecoveryAlerts from '../../components/recovery/RecoveryAlerts.jsx';

// The blank form: every signal absent (a partial save only sends what the athlete set).
const EMPTY_FORM = {
  sleep_quality: null,
  sleep_hours: null,
  energy: null,
  stress: null,
  mood: null,
  sore_zones: [],
  note: '',
};

// Normalize a server check-in row into the form shape (nulls stay null; note → '').
function formFromCheckin(checkin) {
  if (!checkin) return { ...EMPTY_FORM };
  return {
    sleep_quality: checkin.sleep_quality ?? null,
    sleep_hours: checkin.sleep_hours ?? null,
    energy: checkin.energy ?? null,
    stress: checkin.stress ?? null,
    mood: checkin.mood ?? null,
    sore_zones: Array.isArray(checkin.sore_zones) ? checkin.sore_zones : [],
    note: checkin.note ?? '',
  };
}

// Drop empty values so the PUT body is a true partial save (omitted ≠ substituted).
function payloadFromForm(form, loggedOn) {
  const body = { logged_on: loggedOn };
  if (form.sleep_quality != null) body.sleep_quality = form.sleep_quality;
  if (form.sleep_hours != null) body.sleep_hours = form.sleep_hours;
  if (form.energy != null) body.energy = form.energy;
  if (form.stress != null) body.stress = form.stress;
  if (form.mood != null) body.mood = form.mood;
  // sore_zones is always sent: [] is an explicit "no soreness reported" (FR-003).
  body.sore_zones = form.sore_zones;
  if (form.note != null && form.note.trim() !== '') body.note = form.note;
  return body;
}

// ---- Sleep-quality stars (1–5) ----------------------------------------------
function StarRating({ value, onChange, disabled }) {
  return (
    <div
      role="radiogroup"
      aria-label="Qualité du sommeil"
      data-testid="sleep-quality"
      className="flex items-center gap-xs"
    >
      {[1, 2, 3, 4, 5].map((n) => {
        const active = (value ?? 0) >= n;
        return (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n} étoile${n > 1 ? 's' : ''}`}
            data-testid="star"
            data-value={n}
            data-active={active ? 'true' : 'false'}
            disabled={disabled}
            onClick={() => onChange(value === n ? null : n)}
            className={[
              'flex h-12 w-12 items-center justify-center rounded-lg text-2xl leading-none transition',
              active ? 'text-amber-400' : 'text-muted/40',
              disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:text-amber-300',
            ].join(' ')}
          >
            {active ? '★' : '☆'}
          </button>
        );
      })}
    </div>
  );
}

// ---- A labelled field block -------------------------------------------------
function Field({ label, hint, children }) {
  return (
    <div className="flex flex-col gap-sm rounded-lg border border-surface bg-surface/40 p-lg shadow-sm">
      <div className="flex items-baseline justify-between gap-md">
        <h3 className="text-sm font-semibold text-text">{label}</h3>
        {hint != null && <span className="text-xs tabular-nums text-muted">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

export default function RecoveryHome() {
  const [view, setView] = useState({ status: 'loading', data: null });
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [alerts, setAlerts] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  // Track the loaded check-in identity so we re-seed the form only on a real reload,
  // not on every render (which would clobber in-progress edits).
  const loadedKey = useRef(null);

  const loadCheckin = useCallback(async () => {
    try {
      const data = await getCheckin();
      setView({ status: 'ready', data });
    } catch {
      setView({ status: 'error', data: null });
    }
  }, []);

  const loadAlerts = useCallback(async () => {
    try {
      setAlerts(await getAlerts());
    } catch {
      /* alerts are non-critical; leave the panel hidden on failure */
    }
  }, []);

  useEffect(() => {
    loadCheckin();
    loadAlerts();
  }, [loadCheckin, loadAlerts]);

  // Re-seed the form when a freshly-loaded day arrives (keyed by date so edits persist).
  useEffect(() => {
    if (view.status !== 'ready' || !view.data) return;
    const key = view.data.date ?? 'today';
    if (loadedKey.current === key) return;
    loadedKey.current = key;
    setForm(formFromCheckin(view.data.checkin));
    setSavedAt(null);
  }, [view]);

  const data = view.data;
  const editable = data?.editable !== false;
  const moodOptions = data?.options?.moods ?? [];
  const soreZones = data?.options?.sore_zones ?? [];

  const selectedZones = useMemo(() => new Set(form.sore_zones), [form.sore_zones]);

  const setField = useCallback((key, value) => {
    setForm((f) => ({ ...f, [key]: value }));
    setSavedAt(null);
  }, []);

  const toggleZone = useCallback((zone) => {
    setForm((f) => {
      const next = new Set(f.sore_zones);
      if (next.has(zone)) next.delete(zone);
      else next.add(zone);
      return { ...f, sore_zones: Array.from(next) };
    });
    setSavedAt(null);
  }, []);

  const onSave = useCallback(async () => {
    const loggedOn = data?.date;
    if (!loggedOn || !editable) return;
    setSaving(true);
    setSaveError(false);
    try {
      const saved = await putCheckin(payloadFromForm(form, loggedOn));
      setForm(formFromCheckin(saved));
      setSavedAt(Date.now());
      // Re-derive alerts from the freshly-written window.
      loadAlerts();
    } catch {
      setSaveError(true);
    } finally {
      setSaving(false);
    }
  }, [data, editable, form, loadAlerts]);

  return (
    <main className="mx-auto max-w-2xl px-lg py-lg">
      <header className="mb-lg">
        <p className="mb-xs text-sm text-muted">MassLab</p>
        <div className="flex items-baseline justify-between gap-md">
          <h1 className="text-2xl font-semibold text-text">Récupération</h1>
          <Link to="/recovery/trends" className="text-xs text-accent hover:underline">
            Voir les tendances →
          </Link>
        </div>
        <p className="mt-xs text-muted">
          Fais ton point récup du jour en 30 secondes — sommeil, stress, énergie, humeur.
        </p>
      </header>

      {view.status === 'loading' && <StateBlock kind="loading" />}
      {view.status === 'error' && (
        <StateBlock
          kind="error"
          title="Erreur"
          message="Impossible de charger ton bilan de récupération."
        />
      )}

      {view.status === 'ready' && data && (
        <div className="flex flex-col gap-lg">
          <RecoveryAlerts data={alerts} />

          {!editable && (
            <div
              data-testid="readonly-banner"
              role="note"
              className="rounded-lg border border-muted/30 bg-surface/60 px-lg py-md text-sm text-muted"
            >
              Lecture seule — seule la semaine en cours peut être modifiée.
            </div>
          )}

          <fieldset
            disabled={!editable}
            data-testid="checkin-form"
            data-editable={editable ? 'true' : 'false'}
            className="m-0 flex flex-col gap-md border-0 p-0"
          >
            <Field label="Qualité du sommeil" hint={form.sleep_quality ? `${form.sleep_quality}/5` : '—'}>
              <StarRating
                value={form.sleep_quality}
                onChange={(v) => setField('sleep_quality', v)}
                disabled={!editable}
              />
            </Field>

            <Field
              label="Heures de sommeil"
              hint={form.sleep_hours != null ? `${form.sleep_hours} h` : '—'}
            >
              <QuickStepper
                value={form.sleep_hours}
                onChange={(v) => setField('sleep_hours', v)}
                step={0.5}
                min={0}
                max={24}
                suffix="h"
                testid="sleep-hours"
                disabled={!editable}
              />
            </Field>

            <div className="grid gap-md sm:grid-cols-2">
              <Field label="Stress" hint={form.stress != null ? `${form.stress}/10` : '—'}>
                <QuickStepper
                  value={form.stress}
                  onChange={(v) => setField('stress', v)}
                  step={1}
                  min={0}
                  max={10}
                  testid="stress"
                  disabled={!editable}
                />
              </Field>

              <Field label="Énergie" hint={form.energy != null ? `${form.energy}/10` : '—'}>
                <QuickStepper
                  value={form.energy}
                  onChange={(v) => setField('energy', v)}
                  step={1}
                  min={0}
                  max={10}
                  testid="energy"
                  disabled={!editable}
                />
              </Field>
            </div>

            <Field label="Humeur">
              {moodOptions.length > 0 ? (
                <MoodPicker
                  options={moodOptions}
                  value={form.mood}
                  onChange={(v) => setField('mood', v)}
                  disabled={!editable}
                />
              ) : (
                <p className="text-sm text-muted">Aucune humeur configurée.</p>
              )}
            </Field>

            <Field label="Zones courbaturées">
              {soreZones.length > 0 ? (
                <BodyDiagram
                  zones={soreZones}
                  selected={selectedZones}
                  onToggle={toggleZone}
                  disabled={!editable}
                />
              ) : (
                <p className="text-sm text-muted">Aucune zone configurée.</p>
              )}
            </Field>

            <Field label="Note (facultatif)">
              <textarea
                aria-label="Note"
                data-testid="note"
                rows={3}
                value={form.note}
                disabled={!editable}
                onChange={(e) => setField('note', e.target.value)}
                placeholder="Un ressenti, une douleur, un détail à retenir…"
                className="w-full resize-y rounded-md border border-surface bg-surface/60 px-sm py-sm text-sm text-text placeholder:text-muted/60 focus:border-accent focus:outline-none disabled:opacity-60"
              />
            </Field>
          </fieldset>

          <div className="sticky bottom-0 -mx-lg border-t border-surface bg-bg/95 px-lg py-md backdrop-blur supports-[backdrop-filter]:bg-bg/80">
            <div className="flex items-center justify-between gap-md">
              <span
                aria-live="polite"
                className="text-xs text-muted"
                data-testid="save-status"
              >
                {saveError
                  ? 'Échec de l’enregistrement.'
                  : savedAt
                    ? 'Enregistré ✓'
                    : editable
                      ? ''
                      : 'Jour passé'}
              </span>
              <button
                type="button"
                data-testid="checkin-save"
                disabled={!editable || saving}
                onClick={onSave}
                className="min-h-[44px] rounded-md bg-accent px-xl py-sm text-sm font-semibold text-white shadow-sm transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

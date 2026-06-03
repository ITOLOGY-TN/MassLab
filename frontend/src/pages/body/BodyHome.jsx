// Phase 6 (009-body-weight-measurements) T015 [US1] — /body. The morning
// weigh-in form: date (default today), weight, the seven tape-measure
// circumferences, and a note; plus a SEPARATE photo-upload control that posts
// after the numbers are saved (D-3). One-handed-friendly large inputs; every
// numeric field is optional but at least one value is required (FR-003).
//
// The weight chart (US2) mounts into the clearly-marked placeholder slot below.
import { useEffect, useMemo, useRef, useState } from 'react';
import { saveWeighIn, uploadPhoto, getWeightChart } from '../../lib/bodyTrackingApi.js';
import { linearScale, linePath, bandPath } from '../../lib/chartGeometry.js';
import { usePreferredUnit } from '../../lib/usePreferredUnit.js';
import { displayWeight, weightSuffix } from '../../lib/units.js';

// The seven optional circumferences, in head-to-toe order, with French labels.
const CIRCUMFERENCES = [
  { key: 'shoulder_cm', label: 'Épaules' },
  { key: 'neck_cm', label: 'Cou' },
  { key: 'chest_cm', label: 'Poitrine' },
  { key: 'arm_cm', label: 'Bras' },
  { key: 'waist_cm', label: 'Taille' },
  { key: 'hip_cm', label: 'Hanches' },
  { key: 'thigh_cm', label: 'Cuisse' },
];

// YYYY-MM-DD for the local "today" — read once at the boundary for the default.
function todayIso() {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}

// Parse a form string to a number, or undefined when blank (omitted field).
function num(raw) {
  if (raw === undefined || raw === null || String(raw).trim() === '') return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

// ----- US2 weight chart (FR-016–FR-020, FR-027) -----------------------------
// Hand-rolled SVG over the pure chartGeometry helpers (no charting library, D-9):
// the weight curve (linePath) plus three reference overlays from the composed
// view model — the ideal-progression zone (bandPath), a goal line at goalKg, and
// the training-phase boundary markers. With fewer than two logged entries the
// chart shows the available point(s), the reference lines, and an explicit "log
// more for a trend" note. Values stay kg/cm as the API returns them.
const CW = 360;
const CH = 200;
const CPAD_L = 8;
const CPAD_R = 8;
const CPAD_T = 14;
const CPAD_B = 24;

function chartMs(date) {
  return new Date(`${date}T00:00:00Z`).getTime();
}

function formatDay(date) {
  const [, m, d] = String(date).split('-');
  return `${d}/${m}`;
}

function WeightChart({ chart, unit = 'kg' }) {
  const points = chart?.points ?? [];
  const zone = chart?.zone ?? null;
  const goalKg = chart?.goalKg ?? null;
  const phaseMarkers = chart?.phaseMarkers ?? [];
  const hasTrend = Boolean(chart?.hasTrend);

  // Empty state: nothing logged yet — designed, not blank (FR-027).
  if (points.length === 0) {
    return (
      <div
        data-testid="weight-chart-empty"
        className="flex flex-col items-center justify-center gap-xs rounded-md border border-dashed border-muted/40 px-lg py-xl text-center"
      >
        <p className="text-base font-semibold text-text">Aucune pesée pour l’instant</p>
        <p className="text-sm text-muted">
          Enregistre ta première pesée ci-dessus pour démarrer ta courbe.
        </p>
      </div>
    );
  }

  // X domain = span of every dated element we draw (points + zone edges + markers).
  const zoneDates = zone ? [...zone.lower, ...zone.upper].map((p) => p.date) : [];
  const markerDates = phaseMarkers.map((m) => m.date);
  const allDatesMs = [...points.map((p) => p.date), ...zoneDates, ...markerDates].map(chartMs);
  const minX = Math.min(...allDatesMs);
  const maxX = Math.max(...allDatesMs);

  // Y domain = span of every plotted weight (points + zone + goal), padded a touch.
  const zoneKg = zone ? [...zone.lower, ...zone.upper].map((p) => p.kg) : [];
  const allKg = [...points.map((p) => p.kg), ...zoneKg, ...(goalKg != null ? [goalKg] : [])].filter(
    (v) => v != null,
  );
  let minY = Math.min(...allKg);
  let maxY = Math.max(...allKg);
  if (minY === maxY) {
    minY -= 1;
    maxY += 1;
  }
  const padY = (maxY - minY) * 0.08;
  minY -= padY;
  maxY += padY;

  const sx = linearScale({
    domainMin: minX,
    domainMax: maxX,
    rangeMin: CPAD_L,
    rangeMax: CW - CPAD_R,
  });
  const sy = linearScale({
    domainMin: minY,
    domainMax: maxY,
    rangeMin: CH - CPAD_B,
    rangeMax: CPAD_T,
  });

  const curvePts = points.map((p) => ({ x: sx(chartMs(p.date)), y: sy(p.kg) }));
  const band = zone
    ? bandPath({
        upper: zone.upper.map((p) => ({ x: sx(chartMs(p.date)), y: sy(p.kg) })),
        lower: zone.lower.map((p) => ({ x: sx(chartMs(p.date)), y: sy(p.kg) })),
      })
    : '';

  // Colour the latest dot by where it sits relative to the zone's current bounds
  // (inside / above / below) so "on pace" reads at a glance (acceptance #5).
  const last = points[points.length - 1];
  let statusTone = 'rgb(var(--color-accent))';
  if (zone) {
    const lowerAt = zone.lower[zone.lower.length - 1]?.kg;
    const upperAt = zone.upper[zone.upper.length - 1]?.kg;
    if (upperAt != null && last.kg > upperAt) statusTone = 'rgb(var(--color-warn))';
    else if (lowerAt != null && last.kg < lowerAt) statusTone = 'rgb(var(--color-danger))';
    else statusTone = 'rgb(var(--color-success))';
  }

  return (
    <div>
      <svg
        data-testid="weight-chart"
        viewBox={`0 0 ${CW} ${CH}`}
        className="w-full"
        role="img"
        aria-label="Courbe de poids sur le programme"
      >
        {band ? (
          <path
            data-testid="weight-chart-zone"
            d={band}
            fill="rgb(var(--color-accent))"
            opacity="0.1"
            stroke="none"
          />
        ) : null}

        {goalKg != null ? (
          <g data-testid="weight-chart-goal">
            <line
              x1={CPAD_L}
              x2={CW - CPAD_R}
              y1={sy(goalKg)}
              y2={sy(goalKg)}
              stroke="rgb(var(--color-success))"
              strokeDasharray="4 3"
              strokeWidth="1.5"
              opacity="0.85"
            />
            <text
              x={CW - CPAD_R}
              y={sy(goalKg) - 3}
              textAnchor="end"
              className="fill-success text-[9px]"
            >
              Objectif {displayWeight(goalKg, unit)} {weightSuffix(unit)}
            </text>
          </g>
        ) : null}

        {phaseMarkers.map((m, i) => (
          <g key={`${m.date}-${i}`} data-testid="weight-chart-phase-marker">
            <line
              x1={sx(chartMs(m.date))}
              x2={sx(chartMs(m.date))}
              y1={CPAD_T}
              y2={CH - CPAD_B}
              stroke="rgb(var(--color-muted))"
              strokeDasharray="1 4"
              opacity="0.5"
            />
            {m.name ? (
              <text x={sx(chartMs(m.date)) + 2} y={CPAD_T + 8} className="fill-muted text-[8px]">
                {m.name}
              </text>
            ) : null}
          </g>
        ))}

        <path
          data-testid="weight-chart-curve"
          d={linePath(curvePts)}
          fill="none"
          stroke="rgb(var(--color-accent))"
          strokeWidth="2"
        />
        {curvePts.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={i === curvePts.length - 1 ? 3.5 : 2}
            fill={i === curvePts.length - 1 ? statusTone : 'rgb(var(--color-accent))'}
          />
        ))}

        <text x={CPAD_L} y={CH - 6} className="fill-muted text-[8px]">
          {formatDay(points[0].date)}
        </text>
        <text x={CW - CPAD_R} y={CH - 6} textAnchor="end" className="fill-muted text-[8px]">
          {formatDay(last.date)}
        </text>
      </svg>

      <div className="mt-sm flex items-center justify-between text-sm">
        <span className="text-muted">
          Actuel{' '}
          <span className="font-semibold text-text">
            {displayWeight(last.kg, unit)} {weightSuffix(unit)}
          </span>
        </span>
        {goalKg != null ? (
          <span className="text-muted">
            Objectif{' '}
            <span className="font-semibold text-text">
              {displayWeight(goalKg, unit)} {weightSuffix(unit)}
            </span>
          </span>
        ) : null}
      </div>

      {!hasTrend ? (
        <p data-testid="weight-chart-low-data" className="mt-sm text-xs text-muted">
          Une seule pesée — enregistres-en d’autres pour voir une tendance.
        </p>
      ) : null}
    </div>
  );
}

export default function BodyHome() {
  const unit = usePreferredUnit();
  const defaultDate = useMemo(todayIso, []);
  const [form, setForm] = useState(() => ({
    measured_on: defaultDate,
    weight_kg: '',
    note: '',
    ...Object.fromEntries(CIRCUMFERENCES.map((c) => [c.key, ''])),
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(null);
  const [photoStatus, setPhotoStatus] = useState(null);
  const [photoError, setPhotoError] = useState(null);
  const fileRef = useRef(null);

  // The weight chart (US2) loads independently and reloads after a save so a new
  // weigh-in shows on the curve without a manual refresh (SC-002).
  const [chart, setChart] = useState({ status: 'loading', data: null });
  const [chartNonce, setChartNonce] = useState(0);

  useEffect(() => {
    let active = true;
    setChart((c) => ({ status: c.data ? 'ready' : 'loading', data: c.data }));
    getWeightChart()
      .then((data) => active && setChart({ status: 'ready', data }))
      .catch(() => active && setChart({ status: 'error', data: null }));
    return () => {
      active = false;
    };
  }, [chartNonce]);

  const set = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    setError(null);
    setSaved(null);
  };

  // FR-003 mirror: a weigh-in needs a weight or at least one circumference.
  const hasAnyValue =
    num(form.weight_kg) !== undefined || CIRCUMFERENCES.some((c) => num(form[c.key]) !== undefined);

  async function onSubmit(e) {
    e.preventDefault();
    setError(null);
    setSaved(null);
    if (!form.measured_on) {
      setError('Choisis une date.');
      return;
    }
    if (!hasAnyValue) {
      setError('Saisis au moins un poids ou une mesure.');
      return;
    }
    const payload = { measured_on: form.measured_on };
    const weight = num(form.weight_kg);
    if (weight !== undefined) payload.weight_kg = weight;
    for (const c of CIRCUMFERENCES) {
      const v = num(form[c.key]);
      if (v !== undefined) payload[c.key] = v;
    }
    if (form.note && form.note.trim() !== '') payload.note = form.note.trim();

    setSaving(true);
    try {
      const data = await saveWeighIn(payload);
      setSaved(data?.measurement ?? data);
      setChartNonce((n) => n + 1); // reflect the new point on the curve (SC-002)
    } catch (err) {
      setError(err?.message ?? 'Échec de l’enregistrement.');
    } finally {
      setSaving(false);
    }
  }

  // Photo is a dedicated action AFTER the numbers are saved (D-3): it never
  // rolls back an already-saved weigh-in.
  async function onUploadPhoto(e) {
    e.preventDefault();
    setPhotoError(null);
    setPhotoStatus(null);
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setPhotoError('Choisis une photo.');
      return;
    }
    const fd = new FormData();
    fd.append('file', file);
    fd.append('taken_on', form.measured_on);
    const weight = num(form.weight_kg);
    if (weight !== undefined) fd.append('weight_overlay_kg', String(weight));
    try {
      const data = await uploadPhoto(fd);
      setPhotoStatus(`Photo ajoutée pour le ${data?.takenOn ?? form.measured_on}.`);
      if (fileRef.current) fileRef.current.value = '';
    } catch (err) {
      setPhotoError(err?.message ?? 'Échec de l’envoi de la photo.');
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-lg py-lg">
      <header className="mb-lg">
        <h1 className="text-2xl font-semibold text-text">Corps</h1>
        <p className="mt-xs text-muted">Pesée du matin — poids, mesures et photo.</p>
      </header>

      <form
        onSubmit={onSubmit}
        className="rounded-lg border border-surface bg-surface/40 p-lg shadow-sm"
      >
        <div className="mb-lg">
          <label htmlFor="measured_on" className="mb-xs block text-sm font-medium text-muted">
            Date
          </label>
          <input
            id="measured_on"
            type="date"
            value={form.measured_on}
            max={defaultDate}
            onChange={set('measured_on')}
            className="w-full rounded-md border border-muted/30 bg-bg px-md py-md text-lg text-text focus:border-accent focus:outline-none"
          />
        </div>

        <div className="mb-lg">
          <label htmlFor="weight_kg" className="mb-xs block text-sm font-medium text-muted">
            Poids (kg)
          </label>
          <input
            id="weight_kg"
            type="number"
            inputMode="decimal"
            step="0.1"
            placeholder="—"
            value={form.weight_kg}
            onChange={set('weight_kg')}
            className="w-full rounded-md border border-muted/30 bg-bg px-md py-md text-2xl font-semibold text-text focus:border-accent focus:outline-none"
          />
        </div>

        <fieldset className="mb-lg">
          <legend className="mb-sm text-sm font-medium text-muted">Mesures (cm) — optionnel</legend>
          <div className="grid grid-cols-2 gap-md">
            {CIRCUMFERENCES.map((c) => (
              <div key={c.key}>
                <label htmlFor={c.key} className="mb-xs block text-sm text-muted">
                  {c.label}
                </label>
                <input
                  id={c.key}
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  placeholder="—"
                  value={form[c.key]}
                  onChange={set(c.key)}
                  className="w-full rounded-md border border-muted/30 bg-bg px-md py-md text-lg text-text focus:border-accent focus:outline-none"
                />
              </div>
            ))}
          </div>
        </fieldset>

        <div className="mb-lg">
          <label htmlFor="note" className="mb-xs block text-sm font-medium text-muted">
            Note
          </label>
          <textarea
            id="note"
            rows={2}
            value={form.note}
            onChange={set('note')}
            className="w-full rounded-md border border-muted/30 bg-bg px-md py-sm text-text focus:border-accent focus:outline-none"
          />
        </div>

        {error ? (
          <p role="alert" className="mb-md text-sm text-danger">
            {error}
          </p>
        ) : null}
        {saved ? (
          <p role="status" className="mb-md text-sm text-success">
            Pesée enregistrée pour le {saved.measured_on}.
          </p>
        ) : null}

        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-md bg-accent px-md py-md text-lg font-semibold text-bg disabled:opacity-50"
        >
          {saving ? 'Enregistrement…' : 'Enregistrer la pesée'}
        </button>
      </form>

      {/* Photo is a separate action, uploaded AFTER the numbers are saved (D-3). */}
      <section className="mt-lg rounded-lg border border-surface bg-surface/40 p-lg shadow-sm">
        <h2 className="text-lg font-semibold text-text">Ajouter une photo</h2>
        <p className="mt-xs text-sm text-muted">
          Liée à la date ci-dessus, avec le poids du jour en superposition.
        </p>
        <form
          onSubmit={onUploadPhoto}
          className="mt-md flex flex-col gap-md sm:flex-row sm:items-center"
        >
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            aria-label="Photo de progression"
            className="text-sm text-text"
          />
          <button
            type="submit"
            className="rounded-md border border-accent px-md py-sm font-medium text-accent"
          >
            Envoyer la photo
          </button>
        </form>
        {photoError ? (
          <p role="alert" className="mt-md text-sm text-danger">
            {photoError}
          </p>
        ) : null}
        {photoStatus ? (
          <p role="status" className="mt-md text-sm text-success">
            {photoStatus}
          </p>
        ) : null}
      </section>

      {/* US2 weight chart (FR-016–FR-020, FR-027). */}
      <section
        data-testid="weight-chart-slot"
        className="mt-lg rounded-lg border border-surface bg-surface/40 p-lg shadow-sm"
      >
        <div className="mb-md flex items-baseline justify-between">
          <h2 className="text-lg font-semibold text-text">Courbe de poids</h2>
          <span className="text-xs uppercase tracking-wide text-muted">5 mois</span>
        </div>

        {chart.status === 'loading' && <p className="text-sm text-muted">Chargement…</p>}
        {chart.status === 'error' && (
          <p role="alert" className="text-sm text-danger">
            Impossible de charger la courbe.
          </p>
        )}
        {chart.status === 'ready' && <WeightChart chart={chart.data} unit={unit} />}
      </section>
    </main>
  );
}

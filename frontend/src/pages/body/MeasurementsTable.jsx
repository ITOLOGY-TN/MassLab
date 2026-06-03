// Phase 6 (009-body-weight-measurements) T033 [US3] — /body/measurements. The
// monthly circumference table: for each measurement, the latest value per month
// (D-5) with a signed, colour-coded month-over-month delta (up/down/flat) and a
// graceful gap where a prior value is missing (FR-021–FR-023, FR-027). The API
// returns metric (cm); values + deltas are converted to the athlete's preferred
// unit for DISPLAY ONLY (FR-028, T043) — the stored/API data stays metric.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getMeasurementsTable } from '../../lib/bodyTrackingApi.js';
import { usePreferredUnit } from '../../lib/usePreferredUnit.js';
import { displayLength, lengthSuffix } from '../../lib/units.js';

// Row order + French labels for the seven circumferences (head-to-toe), matching
// the weigh-in form. The presenter keys cells by these same field names.
const FIELDS = [
  { key: 'shoulder_cm', label: 'Épaules' },
  { key: 'neck_cm', label: 'Cou' },
  { key: 'chest_cm', label: 'Poitrine' },
  { key: 'arm_cm', label: 'Bras' },
  { key: 'waist_cm', label: 'Taille' },
  { key: 'hip_cm', label: 'Hanches' },
  { key: 'thigh_cm', label: 'Cuisse' },
];

// 'YYYY-MM' → 'mois AAAA' (compact French month header).
const MONTH_NAMES = [
  'janv.',
  'févr.',
  'mars',
  'avr.',
  'mai',
  'juin',
  'juil.',
  'août',
  'sept.',
  'oct.',
  'nov.',
  'déc.',
];
function monthLabel(month) {
  const [y, m] = String(month).split('-');
  const idx = Number(m) - 1;
  return `${MONTH_NAMES[idx] ?? m} ${y}`;
}

const DIRECTION_CLASS = {
  up: 'text-success',
  down: 'text-danger',
  flat: 'text-muted',
};
const DIRECTION_GLYPH = {
  up: '▲',
  down: '▼',
  flat: '→',
};

// A single cell: the value plus a signed, colour-coded delta. A null delta (no
// prior-month value) renders the value alone — no misleading change (FR-023).
// Values and deltas convert to the athlete's preferred unit for display only
// (FR-028); `direction`/`delta` sign are preserved by the linear conversion, so
// the colour-coding is unaffected.
function DeltaCell({ cell, unit }) {
  if (!cell || cell.value == null) {
    return <span className="text-muted/50">—</span>;
  }
  const showDelta = cell.delta != null;
  const tone = DIRECTION_CLASS[cell.direction] ?? 'text-muted';
  const displayValue = displayLength(cell.value, unit);
  const displayDelta = showDelta ? displayLength(cell.delta, unit) : null;
  const signed =
    showDelta && displayDelta > 0 ? `+${displayDelta}` : showDelta ? String(displayDelta) : '';
  return (
    <div className="flex flex-col items-end">
      <span className="font-medium text-text tabular-nums">{displayValue}</span>
      {showDelta ? (
        <span className={`text-xs tabular-nums ${tone}`} data-direction={cell.direction}>
          {DIRECTION_GLYPH[cell.direction]} {signed}
        </span>
      ) : (
        <span className="text-xs text-muted/40">—</span>
      )}
    </div>
  );
}

export default function MeasurementsTable() {
  const unit = usePreferredUnit();
  const [state, setState] = useState({ status: 'loading', data: null });

  useEffect(() => {
    let active = true;
    getMeasurementsTable()
      .then((data) => active && setState({ status: 'ready', data }))
      .catch(() => active && setState({ status: 'error', data: null }));
    return () => {
      active = false;
    };
  }, []);

  const months = state.data?.months ?? [];

  return (
    <main className="mx-auto max-w-4xl px-lg py-xl">
      <header className="mb-lg flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text">Mesures</h1>
          <p className="mt-xs text-muted">
            Tour de chaque zone, mois après mois (en {lengthSuffix(unit)}).
          </p>
        </div>
        <Link to="/body" className="text-sm text-accent hover:underline">
          ← Corps
        </Link>
      </header>

      {state.status === 'loading' && <p className="text-sm text-muted">Chargement…</p>}
      {state.status === 'error' && (
        <p role="alert" className="text-sm text-danger">
          Impossible de charger les mesures.
        </p>
      )}

      {state.status === 'ready' && months.length === 0 && (
        <div
          data-testid="measurements-empty"
          className="flex flex-col items-center justify-center gap-xs rounded-lg border border-dashed border-muted/40 px-lg py-xl text-center"
        >
          <p className="text-base font-semibold text-text">Aucune mesure pour l’instant</p>
          <p className="text-sm text-muted">
            Ajoute des tours de bras, taille ou poitrine à tes pesées pour suivre ta recomposition.
          </p>
        </div>
      )}

      {state.status === 'ready' && months.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-muted/20">
          <table className="w-full text-sm" data-testid="measurements-table">
            <thead className="bg-surface text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-md py-sm text-left">Mesure</th>
                {months.map((m) => (
                  <th key={m.month} className="px-md py-sm text-right">
                    {monthLabel(m.month)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {FIELDS.map((field) => (
                <tr key={field.key} className="border-t border-muted/10">
                  <th className="px-md py-sm text-left font-medium text-text" scope="row">
                    {field.label}
                  </th>
                  {months.map((m) => (
                    <td key={m.month} className="px-md py-sm text-right">
                      <DeltaCell cell={m.fields?.[field.key]} unit={unit} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

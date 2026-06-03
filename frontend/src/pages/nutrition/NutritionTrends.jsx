// Phase 7 (010-phase7-nutrition-calories) T055 — /nutrition/trends. The trends
// dashboard reads GET /nutrition/trends and renders three hand-rolled SVG charts:
// calories over the trailing window (line, with a dashed goal line at goalKcal),
// the anchor day's macro breakdown (donut: protein / carbs / fat share of grams),
// and the weekly average protein (bars). Every panel degrades gracefully to a
// French low/no-data state — never an error (FR-020).
//
// The charts are reused as-is from Phase 5 (LineChart, BarChart) plus the Phase 7
// DonutChart; only the data is mapped into their existing prop shapes. Nutrition
// values stay metric (kcal / g) — no kg/lbs conversion here (D-4).
import { useCallback, useEffect, useState } from 'react';
import { getTrends } from '../../lib/nutritionApi.js';
import StateBlock from '../../components/StateBlock.jsx';
import LineChart from '../../components/charts/LineChart.jsx';
import BarChart from '../../components/charts/BarChart.jsx';
import DonutChart from '../../components/charts/DonutChart.jsx';

// Round for display without trailing noise (snapshots are numeric).
function round(value) {
  if (value == null) return 0;
  return Math.round(Number(value) * 10) / 10;
}

// A consistent panel wrapper so the three charts read as one premium dashboard.
function Panel({ title, hint, children }) {
  return (
    <section className="rounded-lg border border-surface bg-surface/40 p-lg shadow-sm">
      <div className="mb-md flex items-baseline justify-between gap-md">
        <h2 className="text-base font-semibold text-text">{title}</h2>
        {hint ? <span className="text-xs text-muted">{hint}</span> : null}
      </div>
      {children}
    </section>
  );
}

// ---- Calories over the window (FR-017) --------------------------------------
// The LineChart speaks Phase 5's load-series shape: we map kcal onto its primary
// (estimate) line and pass goalKcal as the dashed horizontal "record" line.
function CaloriesPanel({ calories }) {
  const points = calories?.points ?? [];
  const logged = points.filter((p) => round(p.kcal) > 0);
  const goalKcal = calories?.goalKcal ?? null;

  if (logged.length === 0) {
    return (
      <Panel title="Calories" hint="30 derniers jours">
        <p className="text-sm text-muted">
          Aucune calorie enregistrée sur la période. Commence à journaliser tes repas pour voir la
          tendance.
        </p>
      </Panel>
    );
  }

  // Map each day to the chart's series shape; the working-load (secondary) line
  // tracks the same kcal so it stays visually quiet behind the primary line.
  const loadSeries = points.map((p) => ({
    estimate_1rm_kg: round(p.kcal),
    working_load_kg: round(p.kcal),
  }));

  return (
    <Panel title="Calories" hint={`${points.length} jours`}>
      <LineChart loadSeries={loadSeries} recordKg={goalKcal != null ? round(goalKcal) : null} />
      <div className="mt-sm flex items-center justify-between text-xs text-muted">
        <span>{points[0]?.date}</span>
        {goalKcal != null ? (
          <span>
            Objectif <span className="font-medium text-warn">{round(goalKcal)} kcal/j</span>
          </span>
        ) : (
          <span>Objectif non défini</span>
        )}
        <span>{points[points.length - 1]?.date}</span>
      </div>
    </Panel>
  );
}

// ---- Macro breakdown for the day (FR-018) -----------------------------------
function MacroPanel({ macroBreakdown }) {
  const protein = round(macroBreakdown?.protein_g);
  const carbs = round(macroBreakdown?.carbs_g);
  const fat = round(macroBreakdown?.fat_g);
  const hasData = protein + carbs + fat > 0;

  const segments = [
    { value: protein, label: `Protéines ${protein} g`, tone: 'rgb(var(--color-success))' },
    { value: carbs, label: `Glucides ${carbs} g`, tone: 'rgb(var(--color-warn))' },
    { value: fat, label: `Lipides ${fat} g`, tone: 'rgb(var(--color-accent))' },
  ];

  return (
    <Panel title="Répartition des macros" hint="aujourd’hui">
      {hasData ? (
        <DonutChart segments={segments} />
      ) : (
        <p className="text-sm text-muted">
          Aucun macronutriment enregistré aujourd’hui. Ajoute un repas pour voir la répartition.
        </p>
      )}
    </Panel>
  );
}

// ---- Weekly average protein (FR-019) ----------------------------------------
function WeeklyProteinPanel({ weeklyProtein }) {
  const weeks = weeklyProtein ?? [];

  if (weeks.length === 0) {
    return (
      <Panel title="Protéines — moyenne hebdo">
        <p className="text-sm text-muted">
          Pas encore assez de données pour une moyenne hebdomadaire.
        </p>
      </Panel>
    );
  }

  const values = weeks.map((w) => round(w.avgProteinG));
  const peak = Math.max(...values);

  return (
    <Panel title="Protéines — moyenne hebdo" hint={`${weeks.length} sem.`}>
      <BarChart values={values} />
      <div className="mt-sm flex flex-wrap items-center justify-between gap-x-md gap-y-xs text-xs text-muted">
        <span>{weeks[0]?.weekStart}</span>
        <span>
          Pic <span className="font-medium text-success">{round(peak)} g/j</span>
        </span>
        <span>sem. du {weeks[weeks.length - 1]?.weekStart}</span>
      </div>
    </Panel>
  );
}

export default function NutritionTrends() {
  const [state, setState] = useState({ status: 'loading', data: null });

  const load = useCallback(async () => {
    setState({ status: 'loading', data: null });
    try {
      const data = await getTrends();
      setState({ status: 'ready', data });
    } catch {
      setState({ status: 'error', data: null });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const trends = state.data;

  return (
    <main className="mx-auto max-w-2xl px-lg py-lg">
      <header className="mb-lg">
        <p className="mb-xs text-sm text-muted">MassLab</p>
        <h1 className="text-2xl font-semibold text-text">Tendances</h1>
        <p className="mt-xs text-muted">Calories, macros et protéines au fil du temps.</p>
      </header>

      {state.status === 'loading' && <StateBlock kind="loading" />}
      {state.status === 'error' && (
        <StateBlock
          kind="error"
          title="Erreur"
          message="Impossible de charger les tendances nutritionnelles."
        />
      )}

      {state.status === 'ready' && (
        <div className="flex flex-col gap-lg">
          <CaloriesPanel calories={trends?.calories} />
          <MacroPanel macroBreakdown={trends?.macroBreakdown} />
          <WeeklyProteinPanel weeklyProtein={trends?.weeklyProtein} />
        </div>
      )}
    </main>
  );
}

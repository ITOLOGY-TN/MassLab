// Phase 11 (014-phase11-statistics) — the statistics screen: a single read-only
// composition of data the athlete already owns (Phases 0–10). Fetches the whole view
// model in one call (GET /api/v1/statistics via getStatistics) and lays out a lifetime
// metric region plus a tab switcher over the five trend families (Body / Strength /
// Attendance / Nutrition / Recovery), with an exportable monthly progress report.
//
// Mirrors DashboardHome's load/error/ready state machine: one fetch of the composed
// statistics payload, then a lifetime-metric header region (four StatMetricCards + the
// ReportButton) plus a tab switcher over the five trend families.
import { useEffect, useState } from 'react';
import { getStatistics } from '../../lib/statisticsApi.js';
import StateBlock from '../../components/StateBlock.jsx';
import StatMetricCard from '../../components/statistics/StatMetricCard.jsx';
import ReportButton from '../../components/statistics/ReportButton.jsx';
import BodyTab from './tabs/BodyTab.jsx';
import StrengthTab from './tabs/StrengthTab.jsx';
import AttendanceTab from './tabs/AttendanceTab.jsx';
import NutritionTab from './tabs/NutritionTab.jsx';
import RecoveryTab from './tabs/RecoveryTab.jsx';

// The five trend families, in display order. Labels are French; `key` matches the slice
// name in the statistics payload (metrics is the always-on header region, not a tab).
const TABS = [
  { id: 'body', label: 'Corps' },
  { id: 'strength', label: 'Force' },
  { id: 'attendance', label: 'Assiduité' },
  { id: 'nutrition', label: 'Nutrition' },
  { id: 'recovery', label: 'Récupération' },
];

export default function StatisticsHome() {
  const [view, setView] = useState({ status: 'loading', data: null });
  const [activeTab, setActiveTab] = useState(TABS[0].id);

  useEffect(() => {
    let alive = true;
    getStatistics()
      .then((data) => {
        if (alive) setView({ status: 'ready', data });
      })
      .catch(() => {
        if (alive) setView({ status: 'error', data: null });
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <main data-testid="statistics-home" className="mx-auto max-w-3xl px-lg py-lg">
      <header className="mb-xl">
        <p className="mb-xs text-xs font-semibold uppercase tracking-[0.2em] text-accent">
          MassLab
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-text">Statistiques</h1>
        <p className="mt-xs text-muted">Ta progression globale, en un coup d’œil.</p>
      </header>

      {view.status === 'loading' && <StateBlock kind="loading" />}
      {view.status === 'error' && (
        <StateBlock kind="error" title="Erreur" message="Impossible de charger tes statistiques." />
      )}

      {view.status === 'ready' && (
        <div className="flex flex-col gap-xl">
          {/* Lifetime headline metrics + the monthly-report export control. */}
          <section data-testid="stat-metrics" className="flex flex-col gap-lg">
            <h2 className="px-px text-xs font-semibold uppercase tracking-[0.14em] text-muted">
              Depuis le début
            </h2>
            <div className="grid grid-cols-2 gap-md sm:grid-cols-4">
              <StatMetricCard
                label="Poids gagné"
                value={view.data.metrics.total_weight_gained_kg}
                unit="kg"
              />
              <StatMetricCard
                label="Volume total"
                value={view.data.metrics.total_volume_kg}
                unit="kg"
              />
              <StatMetricCard
                label="Assiduité"
                value={view.data.metrics.session_completion_rate.pct}
                unit="%"
              />
              <StatMetricCard
                label="Calories / sem."
                value={view.data.metrics.avg_weekly_calories}
                unit="kcal"
              />
            </div>
            <div className="rounded-lg border border-surface bg-surface/40 p-lg shadow-sm">
              <ReportButton />
            </div>
          </section>

          {/* Tab switcher over the five trend families. */}
          <nav
            role="tablist"
            aria-label="Familles de statistiques"
            className="-mx-px flex flex-wrap gap-xs border-b border-muted/20 pb-px"
          >
            {TABS.map((tab) => {
              const selected = tab.id === activeTab;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  data-testid={`stat-tab-${tab.id}`}
                  onClick={() => setActiveTab(tab.id)}
                  className={
                    'rounded-t-md px-md py-sm text-sm font-medium transition-colors ' +
                    (selected
                      ? 'border-b-2 border-accent bg-surface/60 text-text'
                      : 'border-b-2 border-transparent text-muted hover:bg-surface/40 hover:text-accent')
                  }
                >
                  {tab.label}
                </button>
              );
            })}
          </nav>

          {/* Per-tab chart panel, fed its slice of the statistics payload. */}
          <section data-testid="stat-tab-panel" role="tabpanel">
            {activeTab === 'body' && <BodyTab body={view.data.body} />}
            {activeTab === 'strength' && <StrengthTab strength={view.data.strength} />}
            {activeTab === 'attendance' && <AttendanceTab attendance={view.data.attendance} />}
            {activeTab === 'nutrition' && <NutritionTab nutrition={view.data.nutrition} />}
            {activeTab === 'recovery' && <RecoveryTab recovery={view.data.recovery} />}
          </section>
        </div>
      )}
    </main>
  );
}

// Phase 10 (013-phase10-dashboard) — the home-screen dashboard: a single
// read-only composition of data the athlete already owns (Phases 0–9). Fetches
// the whole view model in one call (GET /api/v1/dashboard via getDashboard) and
// lays out six tile slots: today's session card, the 7-day week overview, four
// quick-metric cards, a 30-day weight sparkline, up to three smart alerts, and
// the quote of the day.
//
// TILE WIRING (T016/T025/T032/T037): the Foundation placeholders are replaced by
// the real tile components, each fed its slice of the `getDashboard` payload.
// Every slot still tolerates missing/cold-start data without erroring
// (FR-018/SC-009) — a brand-new athlete with nothing logged still gets a
// fully-rendered page: the per-tile components return their own empty/null shape,
// and this page supplies a neutral fallback frame when a component renders
// nothing. Mirrors RecoveryHome's load/error/ready state machine + StateBlock.
import { useEffect, useState } from 'react';
import { getDashboard } from '../../lib/dashboardApi.js';
import StateBlock from '../../components/StateBlock.jsx';
import TodaySessionCard from '../../components/dashboard/TodaySessionCard.jsx';
import WeekStrip from '../../components/dashboard/WeekStrip.jsx';
import MetricCard from '../../components/dashboard/MetricCard.jsx';
import AlertList from '../../components/dashboard/AlertList.jsx';
import QuoteCard from '../../components/dashboard/QuoteCard.jsx';
import LineChart from '../../components/charts/LineChart.jsx';

// A neutral cold-start frame: shown only when a tile's own component renders
// nothing (its source is empty), so the one-glance layout never collapses.
function EmptyTile({ testid, message }) {
  return (
    <section
      data-testid={testid}
      className="flex items-center rounded-lg border border-dashed border-muted/25 bg-surface/40 p-lg text-sm text-muted"
    >
      {message ?? 'Aucune donnée pour le moment.'}
    </section>
  );
}

// A small labelled wrapper so a tile group reads as a section at a glance.
function TileGroup({ title, children, testid }) {
  return (
    <section data-testid={testid} className="flex flex-col gap-md">
      <h2 className="px-px text-xs font-semibold uppercase tracking-[0.14em] text-muted">
        {title}
      </h2>
      {children}
    </section>
  );
}

// French-formatted signed number (e.g. "+2.2", "−400").
function signed(n, digits = 0) {
  if (n == null || !Number.isFinite(n)) return null;
  const rounded = Number(n.toFixed(digits));
  const abs = Math.abs(rounded).toLocaleString('fr-FR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  if (rounded > 0) return `+${abs}`;
  if (rounded < 0) return `−${abs}`;
  return abs;
}

// Map the dashboard weight sparkline ({ points: [{ date, weight_kg }], goal_kg })
// onto the shared LineChart's `loadSeries` shape. The weight series becomes the
// primary line; the goal line reuses the chart's dashed horizontal record rule.
function sparklineSeries(sparkline) {
  const points = sparkline?.points ?? [];
  return points
    .filter((p) => p?.weight_kg != null)
    .map((p) => ({ estimate_1rm_kg: p.weight_kg, working_load_kg: p.weight_kg }));
}

export default function DashboardHome() {
  const [view, setView] = useState({ status: 'loading', data: null });

  useEffect(() => {
    let alive = true;
    getDashboard()
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

  const data = view.data;
  const metrics = data?.metrics ?? {};
  const sparkline = data?.sparkline ?? null;
  const series = sparklineSeries(sparkline);

  // ── US2 metric-card props, mapped from `metrics.*`; null sub-objects flag
  //    their tile empty so cold-start athletes still get a rendered card. ──
  const weight = metrics.weight ?? null;
  const calories = metrics.calories ?? null;
  const streak = metrics.streak ?? null;
  const phase = metrics.phase ?? null;

  const weightDelta = weight ? signed(weight.delta_kg, 1) : null;
  const caloriesDelta = calories ? signed(calories.delta_kcal, 0) : null;
  const daysRemaining = phase?.days_remaining;

  return (
    <main className="mx-auto max-w-3xl px-lg py-lg">
      <header className="mb-xl">
        <p className="mb-xs text-xs font-semibold uppercase tracking-[0.2em] text-accent">
          MassLab
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-text">Accueil</h1>
        <p className="mt-xs text-muted">Ton tableau de bord du jour, en un coup d’œil.</p>
      </header>

      {view.status === 'loading' && <StateBlock kind="loading" />}
      {view.status === 'error' && (
        <StateBlock
          kind="error"
          title="Erreur"
          message="Impossible de charger ton tableau de bord."
        />
      )}

      {view.status === 'ready' && (
        <div data-testid="dashboard-grid" className="flex flex-col gap-xl">
          {/* US1 — today's session + the 7-day week strip. */}
          <TileGroup title="Aujourd’hui" testid="group-today">
            {data?.today ? (
              <div data-testid="tile-today">
                <TodaySessionCard today={data.today} />
              </div>
            ) : (
              <EmptyTile testid="tile-today" message="Pas de séance prévue aujourd’hui." />
            )}

            {data?.week?.days?.length ? (
              <div data-testid="tile-week">
                <WeekStrip week={data.week} />
              </div>
            ) : (
              <EmptyTile testid="tile-week" message="Semaine en cours." />
            )}
          </TileGroup>

          {/* US2 — four quick-metric cards + the 30-day weight sparkline. */}
          <TileGroup title="Mes chiffres" testid="group-metrics">
            <div data-testid="tile-metrics" className="grid grid-cols-2 gap-md">
              <MetricCard
                testId="metric-weight"
                label="Poids"
                value={weight ? weight.current_kg.toLocaleString('fr-FR') : null}
                unit={weight ? 'kg' : undefined}
                delta={
                  weight
                    ? `${weightDelta} kg depuis ${weight.start_kg.toLocaleString('fr-FR')} kg`
                    : null
                }
                deltaTone={!weight ? 'neutral' : weight.delta_kg >= 0 ? 'up' : 'down'}
                empty={!weight}
                emptyText="Pas encore de mesures de poids"
              />

              <MetricCard
                testId="metric-calories"
                label="Calories (hier)"
                value={calories ? Math.round(calories.yesterday_kcal).toLocaleString('fr-FR') : null}
                unit={calories ? 'kcal' : undefined}
                delta={
                  calories
                    ? `${caloriesDelta} kcal vs ${Math.round(calories.target_kcal).toLocaleString('fr-FR')}`
                    : null
                }
                deltaTone={!calories ? 'neutral' : calories.over ? 'over' : 'under'}
                empty={!calories}
                emptyText="Aucun repas logué hier"
              />

              <MetricCard
                testId="metric-streak"
                label="Série de séances"
                value={streak ? streak.count : 0}
                unit={(streak ? streak.count : 0) > 1 ? 'séances' : 'séance'}
                hint="d’affilée"
                empty={false}
              />

              <MetricCard
                testId="metric-phase"
                label="Phase actuelle"
                value={phase ? phase.name : null}
                hint={
                  phase && Number.isFinite(daysRemaining)
                    ? `${daysRemaining} jour${daysRemaining > 1 ? 's' : ''} restant${daysRemaining > 1 ? 's' : ''}`
                    : undefined
                }
                empty={!phase}
                emptyText="Aucun programme actif"
              />
            </div>

            {/* 30-day weight sparkline (reuses the shared LineChart; the goal line
                is drawn via the chart's dashed horizontal record rule). */}
            {sparkline?.has_data && series.length ? (
              <section
                data-testid="tile-sparkline"
                className="flex flex-col gap-sm rounded-lg border border-muted/20 bg-surface p-lg shadow-sm"
              >
                <div className="flex items-baseline justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
                    Poids — {sparkline.days ?? 30} jours
                  </h3>
                  {sparkline.goal_kg != null ? (
                    <span className="flex items-center gap-xs text-xs text-muted">
                      <span aria-hidden="true" className="inline-block h-px w-4 bg-warn" />
                      Objectif {sparkline.goal_kg.toLocaleString('fr-FR')} kg
                    </span>
                  ) : null}
                </div>
                <LineChart loadSeries={series} recordKg={sparkline.goal_kg ?? null} />
              </section>
            ) : (
              <EmptyTile
                testid="tile-sparkline"
                message="Pas encore de mesures de poids sur 30 jours."
              />
            )}
          </TileGroup>

          {/* US3 — up to three prioritized smart alerts (or an all-clear state). */}
          <TileGroup title="À surveiller" testid="group-alerts">
            <div data-testid="tile-alerts">
              <AlertList data={data} />
            </div>
          </TileGroup>

          {/* US4 — quote of the day (renders its own graceful placeholder when null). */}
          <TileGroup title="Citation du jour" testid="group-quote">
            <div data-testid="tile-quote">
              <QuoteCard data={data} />
            </div>
          </TileGroup>
        </div>
      )}
    </main>
  );
}

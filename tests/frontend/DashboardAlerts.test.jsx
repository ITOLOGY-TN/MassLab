import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AlertList from '../../frontend/src/components/dashboard/AlertList.jsx';

// Phase 10 (013-phase10-dashboard) T028 — frontend smoke for the dashboard smart-alert
// list: it renders up to three severity-styled, linked cards and an encouraging
// all-clear state without error. Shape mirrors the `alerts` array of GET /dashboard
// (contracts/openapi.yaml DashboardView): each alert is
// { kind, message_key, context, link }, capped at three in the fixed priority order
// (low_sleep_high_stress → no_session → calorie_deficit → ready_to_add_load →
// creatine_streak_broken). AlertList carries the alerts inside the composed dashboard
// payload, so the mocked getDashboard data is fed in via the `data` prop.
//
// AlertList renders `Link`s for alerts that carry a `link`, so the tree is wrapped in a
// MemoryRouter.

function renderAlerts(data) {
  return render(
    <MemoryRouter>
      <AlertList data={data} />
    </MemoryRouter>,
  );
}

// A mocked getDashboard payload's `alerts` slice — three of the five kinds in priority
// order, each with a context + in-app link.
const THREE_ALERTS = {
  alerts: [
    {
      kind: 'low_sleep_high_stress',
      message_key: 'dashboard.alert.low_sleep_high_stress',
      context: { avg_sleep: 5.5, avg_stress: 8 },
      link: '/recovery',
    },
    {
      kind: 'no_session',
      message_key: 'dashboard.alert.no_session',
      context: { days: 3 },
      link: '/journal',
    },
    {
      kind: 'ready_to_add_load',
      message_key: 'dashboard.alert.ready_to_add_load',
      context: { exercise: 'Développé couché' },
      link: '/load-tracking',
    },
  ],
};

describe('DashboardAlerts (frontend smoke)', () => {
  it('renders up to three severity-styled alert cards', () => {
    renderAlerts(THREE_ALERTS);

    const section = screen.getByTestId('dashboard-alerts');
    expect(section).toHaveAttribute('data-all-clear', 'false');

    const cards = screen.getAllByTestId('dashboard-alert');
    expect(cards).toHaveLength(3);

    // Each alert carries its kind + a severity for styling.
    expect(cards[0]).toHaveAttribute('data-kind', 'low_sleep_high_stress');
    expect(cards[0]).toHaveAttribute('data-severity', 'warning');
    expect(cards[1]).toHaveAttribute('data-kind', 'no_session');
    expect(cards[2]).toHaveAttribute('data-kind', 'ready_to_add_load');
    expect(cards[2]).toHaveAttribute('data-severity', 'success');

    // Linked alerts target their in-app module.
    expect(cards[1].closest('a')).toHaveAttribute('href', '/journal');

    // French copy via the locale seam (not the raw message_key), with context numbers.
    expect(screen.getByText('Sommeil bas, stress élevé')).toBeInTheDocument();
    expect(screen.getByText('Aucune séance récente')).toBeInTheDocument();
    expect(
      screen.getByText("Pas de séance terminée depuis 3 jours. C'est le moment de reprendre."),
    ).toBeInTheDocument();
  });

  it('never renders more than three cards even if the payload carries more', () => {
    renderAlerts({
      alerts: [
        ...THREE_ALERTS.alerts,
        {
          kind: 'creatine_streak_broken',
          message_key: 'dashboard.alert.creatine_streak_broken',
          context: {},
          link: '/supplements',
        },
      ],
    });
    expect(screen.getAllByTestId('dashboard-alert')).toHaveLength(3);
  });

  it('renders an encouraging all-clear state when there are no alerts', () => {
    renderAlerts({ alerts: [] });

    const section = screen.getByTestId('dashboard-alerts');
    expect(section).toHaveAttribute('data-all-clear', 'true');
    expect(screen.getByText('Tout roule')).toBeInTheDocument();
    expect(screen.queryByTestId('dashboard-alert')).toBeNull();
  });

  it('treats a missing alerts array as all-clear without error', () => {
    renderAlerts({});
    expect(screen.getByTestId('dashboard-alerts')).toHaveAttribute('data-all-clear', 'true');
  });

  it('renders nothing when the dashboard data has not loaded yet', () => {
    const { container } = renderAlerts(null);
    expect(container).toBeEmptyDOMElement();
  });
});

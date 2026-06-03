import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import RecoveryAlerts from '../../frontend/src/components/recovery/RecoveryAlerts.jsx';

// Phase 9 (012-phase9-recovery-wellbeing) T021/T025 — frontend smoke for the smart
// recovery alert banner: it renders the seeded, severity-styled alerts and the
// encouraging all-clear state without error. Shape mirrors GET /recovery/alerts:
// { all_clear, alerts:[{ kind, severity, message_key, context }] }.

const SEEDED = {
  all_clear: false,
  alerts: [
    {
      kind: 'high_stress',
      severity: 'warning',
      message_key: 'recovery.alert.high_stress',
      context: { days: 3, threshold: 7 },
    },
    {
      kind: 'reduce_volume',
      severity: 'advice',
      message_key: 'recovery.alert.reduce_volume',
      context: { avg_sleep: 5.5, avg_energy: 3 },
    },
    {
      kind: 'full_rest',
      severity: 'warning',
      message_key: 'recovery.alert.full_rest',
      context: { date: '2026-06-03', signals: 3, sore_zones: 4 },
    },
  ],
};

describe('RecoveryAlerts (frontend smoke)', () => {
  it('renders the seeded alerts severity-styled', () => {
    render(<RecoveryAlerts data={SEEDED} />);

    const banner = screen.getByTestId('recovery-alerts');
    expect(banner).toHaveAttribute('data-all-clear', 'false');

    const cards = screen.getAllByTestId('recovery-alert');
    expect(cards).toHaveLength(3);

    // Each alert carries its kind + severity for styling.
    expect(cards[0]).toHaveAttribute('data-kind', 'high_stress');
    expect(cards[0]).toHaveAttribute('data-severity', 'warning');
    expect(cards[1]).toHaveAttribute('data-severity', 'advice');

    // French copy via the locale seam (not the raw message_key).
    expect(screen.getByText('Stress élevé')).toBeInTheDocument();
    expect(screen.getByText('Réduis le volume')).toBeInTheDocument();
    expect(screen.getByText('Repos complet conseillé')).toBeInTheDocument();
  });

  it('renders the encouraging all-clear state', () => {
    render(<RecoveryAlerts data={{ all_clear: true, alerts: [] }} />);

    const banner = screen.getByTestId('recovery-alerts');
    expect(banner).toHaveAttribute('data-all-clear', 'true');
    expect(screen.getByText('Tout est au vert')).toBeInTheDocument();
    expect(screen.queryByTestId('recovery-alert')).toBeNull();
  });

  it('treats an empty alert list as all-clear even without the flag', () => {
    render(<RecoveryAlerts data={{ alerts: [] }} />);
    expect(screen.getByTestId('recovery-alerts')).toHaveAttribute('data-all-clear', 'true');
  });

  it('renders nothing when no data has loaded yet', () => {
    const { container } = render(<RecoveryAlerts data={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});

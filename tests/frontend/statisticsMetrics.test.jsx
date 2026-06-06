// Phase 11 (014-phase11-statistics) US1 — frontend smoke for the headline metric tile.
// StatMetricCard is rendered directly (NOT StatisticsHome) with a populated value and
// with the cold-start `empty` flag; both must render without error and expose
// data-empty so the parent's layout can style them. Uses plain DOM assertions
// (getByText / getAttribute / queryByText), matching the working convention in the
// sibling statisticsBodyStrength / statisticsANR frontend tests.
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import StatMetricCard from '../../frontend/src/components/statistics/StatMetricCard.jsx';

describe('StatMetricCard — headline metric tile (US1 frontend smoke)', () => {
  it('renders the label, value and unit when populated', () => {
    render(<StatMetricCard label="Volume total" value="12 500" unit="kg" />);

    const card = screen.getByTestId('stat-metric-card');
    expect(card.getAttribute('data-empty')).toBe('false');
    expect(screen.getByText('Volume total')).toBeTruthy();
    expect(screen.getByText('12 500')).toBeTruthy();
    expect(screen.getByText('kg')).toBeTruthy();
  });

  it('renders a muted empty state when empty', () => {
    render(<StatMetricCard label="Poids pris" value={null} unit="kg" empty />);

    const card = screen.getByTestId('stat-metric-card');
    expect(card.getAttribute('data-empty')).toBe('true');
    expect(screen.getByText('Poids pris')).toBeTruthy();
    // The dash placeholder stands in for the missing value.
    expect(screen.getByText('—')).toBeTruthy();
  });

  it('treats a null value as empty even without the explicit flag', () => {
    render(<StatMetricCard label="Calories / sem." value={null} />);
    expect(screen.getByTestId('stat-metric-card').getAttribute('data-empty')).toBe('true');
  });
});

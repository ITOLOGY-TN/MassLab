import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

// Phase 11 (014-phase11-statistics) US4 — frontend smoke for the monthly PDF
// export control. statisticsApi.getReport and pdfReport.generateReportPdf are
// mocked (no network, no real jsPDF/canvas): clicking "Exporter PDF" fetches the
// month-scoped report and hands it to the PDF builder, without error.
vi.mock('../../frontend/src/lib/statisticsApi.js', () => ({
  getReport: vi.fn(),
}));
vi.mock('../../frontend/src/lib/pdfReport.js', () => ({
  generateReportPdf: vi.fn(),
}));

import { getReport } from '../../frontend/src/lib/statisticsApi.js';
import { generateReportPdf } from '../../frontend/src/lib/pdfReport.js';
import ReportButton from '../../frontend/src/components/statistics/ReportButton.jsx';

const REPORT = {
  period: { month: '2026-05', from: '2026-05-01', to: '2026-05-31', label: 'mai 2026' },
  summary: {
    volume_kg: 3500,
    sessions_completed: 3,
    weight_change_kg: 2,
    avg_daily_calories: 2200,
    avg_sleep_hours: 7.5,
  },
  lifetime: {
    total_weight_gained_kg: 4.5,
    total_volume_kg: 120000,
    session_completion_pct: 80,
    avg_weekly_calories: 18000,
  },
  topProgressions: [{ exercise_id: 12, name: 'Développé couché', gain_kg: 10 }],
  weightSeries: [{ date: '2026-05-02', weight_kg: 80 }],
  recommendations: [{ key: 'ready_to_add_load', message: 'Augmente la charge.' }],
};

beforeEach(() => {
  vi.clearAllMocks();
  getReport.mockResolvedValue(REPORT);
  generateReportPdf.mockResolvedValue(undefined);
});

describe('ReportButton — monthly PDF export (US4 frontend smoke)', () => {
  it('renders the month picker and export button', () => {
    render(<ReportButton />);
    expect(screen.getByTestId('report-button')).toBeInTheDocument();
    expect(screen.getByTestId('report-month')).toBeInTheDocument();
    expect(screen.getByTestId('report-export')).toBeInTheDocument();
  });

  it('fetches the report and generates the PDF on export (default month)', async () => {
    render(<ReportButton />);

    fireEvent.click(screen.getByTestId('report-export'));

    await waitFor(() => expect(getReport).toHaveBeenCalledTimes(1));
    // No month selected ⇒ undefined (backend resolves last completed month).
    expect(getReport).toHaveBeenCalledWith(undefined);
    await waitFor(() => expect(generateReportPdf).toHaveBeenCalledTimes(1));
    expect(generateReportPdf).toHaveBeenCalledWith(REPORT);
    // No error surfaced.
    expect(screen.queryByTestId('report-error')).toBeNull();
  });

  it('passes the chosen month through to getReport', async () => {
    render(<ReportButton />);

    fireEvent.change(screen.getByTestId('report-month'), { target: { value: '2026-05' } });
    fireEvent.click(screen.getByTestId('report-export'));

    await waitFor(() => expect(getReport).toHaveBeenCalledTimes(1));
    expect(getReport).toHaveBeenCalledWith('2026-05');
  });
});

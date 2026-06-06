// Phase 11 (014-phase11-statistics) US4 — the monthly PDF export control.
// A month picker (defaults empty = the most recently completed month, resolved by
// the backend) plus an "Exporter PDF" button. On click it fetches the month-scoped
// report and hands it to the client-side PDF builder. Read-only: no writes.
import { useState } from 'react';
import { getReport } from '../../lib/statisticsApi.js';
import { generateReportPdf } from '../../lib/pdfReport.js';

export default function ReportButton() {
  const [month, setMonth] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function handleExport() {
    setBusy(true);
    setError(null);
    try {
      const report = await getReport(month || undefined);
      await generateReportPdf(report);
    } catch {
      setError('Échec de la génération du PDF. Réessaie.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section data-testid="report-button" className="flex flex-wrap items-end gap-md">
      <label className="flex flex-col gap-xs text-sm text-muted">
        <span>Mois</span>
        <input
          type="month"
          data-testid="report-month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          disabled={busy}
          className="rounded-md border border-border bg-surface px-md py-sm text-text"
        />
      </label>
      <button
        type="button"
        data-testid="report-export"
        onClick={handleExport}
        disabled={busy}
        className="rounded-md bg-accent px-lg py-sm font-semibold text-white shadow-sm transition hover:brightness-110 disabled:opacity-60"
      >
        {busy ? 'Génération…' : 'Exporter PDF'}
      </button>
      {error ? (
        <p data-testid="report-error" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </section>
  );
}

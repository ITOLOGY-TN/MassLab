import { useState } from 'react';
import { apiPost, apiUpload, apiGetBlob } from '../../lib/api.js';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';

const RESET_TOKEN = 'RESET-MASSLAB';

const MODULES = [
  { value: 'sessions', label: 'Séances' },
  { value: 'body_measurements', label: 'Mensurations' },
  { value: 'nutrition_logs', label: 'Journal nutrition' },
  { value: 'supplements', label: 'Suppléments' },
  { value: 'recovery', label: 'Récupération' },
  { value: 'calculator_results', label: 'Historique des calculs' },
  { value: 'preferences', label: 'Préférences (réinit. par défaut)' },
  { value: 'all', label: 'Tout réinitialiser (sauf le profil)' },
];

function downloadBlob(content, filename, type) {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function DataSettings() {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);

  // Import state
  const [importPreview, setImportPreview] = useState(null);
  const [importFile, setImportFile] = useState(null);
  const [importDialog, setImportDialog] = useState(false);

  // Reset state
  const [resetModule, setResetModule] = useState('sessions');
  const [resetExportFirst, setResetExportFirst] = useState(true);
  const [resetDialog, setResetDialog] = useState(false);

  async function exportJson() {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const res = await apiPost('/api/v1/data/export/json', {});
      const filename = `masslab-backup-${new Date().toISOString().slice(0, 10)}.json`;
      downloadBlob(JSON.stringify(res.data, null, 2), filename, 'application/json');
      setStatus('Sauvegarde JSON téléchargée.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function exportCsv() {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const blob = await apiGetBlob('/api/v1/data/export/sessions.csv', 'text/csv');
      downloadBlob(
        blob,
        `masslab-sessions-${new Date().toISOString().slice(0, 10)}.csv`,
        'text/csv',
      );
      setStatus('Sessions CSV téléchargées.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function onPickImportFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setStatus(null);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const counts = Object.fromEntries(
        Object.entries(parsed)
          .filter(([k, v]) => k !== '_export' && Array.isArray(v))
          .map(([k, v]) => [k, v.length]),
      );
      setImportFile(file);
      setImportPreview({
        schema_version: parsed._export?.schema_version,
        exported_at: parsed._export?.exported_at,
        engine_version: parsed._export?.engine_version,
        counts,
      });
    } catch (err) {
      setError(`Fichier invalide : ${err.message}`);
    }
  }

  async function confirmImport() {
    setImportDialog(false);
    if (!importFile) return;
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', importFile);
      const res = await apiUpload('/api/v1/data/import', fd);
      setStatus(`Restauration terminée (schéma v${res.data.schema_version_applied}).`);
      setImportPreview(null);
      setImportFile(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function confirmReset() {
    setResetDialog(false);
    setBusy(true);
    setError(null);
    try {
      const res = await apiPost('/api/v1/data/reset', {
        module: resetModule,
        confirm_token: RESET_TOKEN,
        export_first: resetExportFirst && resetModule === 'all',
      });
      if (res.data.export_url) {
        // Honour the "Export first" toggle by triggering a download from the
        // base64 data: URL the backend returns.
        const a = document.createElement('a');
        a.href = res.data.export_url;
        a.download = `masslab-pre-reset-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
      }
      setStatus(`Réinitialisation effectuée (${resetModule}).`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-lg">
      <h2 className="text-2xl font-semibold">Données</h2>

      <section className="grid gap-sm">
        <h3 className="text-xl font-semibold">Exporter</h3>
        <p className="text-sm text-muted">
          Téléchargez une sauvegarde JSON de toutes vos données ou un CSV des séances.
        </p>
        <div className="flex gap-sm">
          <button
            type="button"
            onClick={exportJson}
            disabled={busy}
            className="bg-accent text-white px-md py-sm rounded-md min-h-[44px] disabled:opacity-40"
          >
            Sauvegarde JSON
          </button>
          <button
            type="button"
            onClick={exportCsv}
            disabled={busy}
            className="border border-muted/30 px-md py-sm rounded-md min-h-[44px] disabled:opacity-40"
          >
            Sessions (CSV)
          </button>
        </div>
      </section>

      <section className="grid gap-sm">
        <h3 className="text-xl font-semibold">Importer</h3>
        <p className="text-sm text-muted">
          Restaurez une sauvegarde JSON. <strong>Attention :</strong> remplace toutes vos données
          par celles du fichier.
        </p>
        <input type="file" accept="application/json" onChange={onPickImportFile} />
        {importPreview ? (
          <div className="bg-bg border border-muted/30 rounded-md p-md">
            <p className="font-semibold">Aperçu</p>
            <p className="text-sm text-muted">
              Schéma v{importPreview.schema_version} · {importPreview.exported_at}
            </p>
            <ul className="text-sm mt-sm grid grid-cols-2">
              {Object.entries(importPreview.counts).map(([k, v]) => (
                <li key={k}>
                  {k}: <strong>{v}</strong>
                </li>
              ))}
            </ul>
            <div className="flex justify-end mt-md">
              <button
                type="button"
                onClick={() => setImportDialog(true)}
                disabled={busy}
                className="bg-danger text-white px-md py-sm rounded-md min-h-[44px] disabled:opacity-40"
              >
                Restaurer
              </button>
            </div>
          </div>
        ) : null}
      </section>

      <section className="grid gap-sm">
        <h3 className="text-xl font-semibold">Réinitialiser</h3>
        <p className="text-sm text-muted">
          Effacez un module précis ou tout sauf le profil. Action irréversible.
        </p>
        <div className="flex gap-sm items-center">
          <select
            value={resetModule}
            onChange={(e) => setResetModule(e.target.value)}
            className="bg-bg border border-muted/30 text-text rounded-md px-md py-sm min-h-[44px]"
          >
            {MODULES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
          {resetModule === 'all' ? (
            <label className="flex items-center gap-xs text-sm text-muted">
              <input
                type="checkbox"
                checked={resetExportFirst}
                onChange={(e) => setResetExportFirst(e.target.checked)}
              />
              Exporter d'abord
            </label>
          ) : null}
          <button
            type="button"
            onClick={() => setResetDialog(true)}
            disabled={busy}
            className="bg-danger text-white px-md py-sm rounded-md min-h-[44px] disabled:opacity-40"
          >
            Réinitialiser
          </button>
        </div>
      </section>

      {error ? (
        <p role="alert" className="text-danger text-sm">
          {error}
        </p>
      ) : null}
      {status ? (
        <p role="status" className="text-success text-sm">
          {status}
        </p>
      ) : null}

      <ConfirmDialog
        open={importDialog}
        title="Restaurer la sauvegarde ?"
        description="Toutes vos données actuelles seront remplacées. Cette action est irréversible."
        confirmToken={RESET_TOKEN}
        confirmLabel="Restaurer"
        onConfirm={confirmImport}
        onCancel={() => setImportDialog(false)}
      />
      <ConfirmDialog
        open={resetDialog}
        title="Confirmer la réinitialisation"
        description={`Module : ${resetModule}. Tapez le jeton pour confirmer.`}
        confirmToken={RESET_TOKEN}
        confirmLabel="Réinitialiser"
        onConfirm={confirmReset}
        onCancel={() => setResetDialog(false)}
      />
    </div>
  );
}

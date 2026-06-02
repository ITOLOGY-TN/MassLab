// Phase 4 (007-session-journal) — frontend auto-save cadence. The timer runs in
// the browser, so this is a Vite build var (mirrors VITE_API_BASE in api.js).
// Constitution VI: auto-save fires at least every 30 s. No backend config key.
const parsed = Number(import.meta.env?.VITE_SESSION_AUTOSAVE_INTERVAL_MS);
export const SESSION_AUTOSAVE_INTERVAL_MS = Number.isFinite(parsed) && parsed > 0 ? parsed : 30000;

// Phase 11 (014-phase11-statistics) — thin fetch wrappers for the read-only
// statistics composition surface. Mirrors dashboardApi.js: callers get the
// unwrapped `{ data }`.
import { apiGet } from './api.js';

// Composed statistics view model (lifetime metrics + all-module trends).
export const getStatistics = () => apiGet('/api/v1/statistics').then((r) => r.data);

// Monthly progress report payload (the frontend renders it to a PDF). `month`
// is an optional YYYY-MM string; omitted ⇒ the current month.
export const getReport = (month) =>
  apiGet('/api/v1/statistics/report' + (month ? '?month=' + month : '')).then((r) => r.data);

// Phase 9 (012-phase9-recovery-wellbeing) — thin fetch wrappers for the recovery
// surfaces (daily check-in form, smart contextual alerts, monthly trend visuals).
// Mirrors supplementsApi.js: callers get the unwrapped `{ data }`.
import { apiGet, apiPut } from './api.js';

// Daily check-in form state (saved check-in or null) + allowed options + editable flag.
export const getCheckin = (date) =>
  apiGet(`/api/v1/recovery/checkin${date ? `?date=${encodeURIComponent(date)}` : ''}`).then(
    (r) => r.data,
  );

// Save the day's check-in (upsert; current edit window only).
export const putCheckin = (body) =>
  apiPut('/api/v1/recovery/checkin', body).then((r) => r.data);

// Smart contextual alerts recomputed on read from the recent check-in window.
export const getAlerts = () => apiGet('/api/v1/recovery/alerts').then((r) => r.data);

// Monthly trend visuals: energy heatmap, sleep-vs-performance scatter, 30-day overlay.
export const getTrends = (month) =>
  apiGet(`/api/v1/recovery/trends${month ? `?month=${encodeURIComponent(month)}` : ''}`).then(
    (r) => r.data,
  );

// Phase 8 (011-phase8-supplements) — thin fetch wrappers for the supplement
// surfaces (daily checklist, taken toggle, weekly grid, weekly self-assessment).
// Mirrors nutritionApi.js: callers get the unwrapped `{ data }`.
import { apiGet, apiPost, apiPut } from './api.js';

// Daily checklist: cards + taken-state + per-supplement streak.
export const getChecklist = (date) =>
  apiGet(`/api/v1/supplements/checklist${date ? `?date=${encodeURIComponent(date)}` : ''}`).then(
    (r) => r.data,
  );

// Toggle a supplement's taken state for a day (current ISO week only).
export const toggleIntake = ({ supplement_id, logged_on, taken }) =>
  apiPost('/api/v1/supplements/intake', { supplement_id, logged_on, taken }).then((r) => r.data);

// Weekly grid: supplements × 7 days, each cell taken/missed/upcoming.
export const getGrid = (week) =>
  apiGet(`/api/v1/supplements/grid${week ? `?week=${encodeURIComponent(week)}` : ''}`).then(
    (r) => r.data,
  );

// Current-week self-assessment + the trend window.
export const getAssessments = () =>
  apiGet('/api/v1/supplements/assessments').then((r) => r.data);

// Save the current ISO week's self-assessment (upsert; current week only).
export const putAssessment = (body) =>
  apiPut('/api/v1/supplements/assessment', body).then((r) => r.data);

// Phase 5 (008-load-tracking) — thin fetch wrappers for the read-only Load
// Tracking views. Mirrors programApi.js: callers get the unwrapped `{ data }`.
import { apiGet } from './api.js';

export const fetchOverview = () => apiGet('/api/v1/load-tracking/overview').then((r) => r.data);

export const fetchExerciseProgress = (id) =>
  apiGet(`/api/v1/load-tracking/exercises/${id}`).then((r) => r.data);

export const fetchPhaseComparison = () =>
  apiGet('/api/v1/load-tracking/phase-comparison').then((r) => r.data);

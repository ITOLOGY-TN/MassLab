// Phase 7 (010-phase7-nutrition-calories) — thin fetch wrappers for the
// nutrition surfaces (daily log, food search/create, template-plan loader,
// hydration, trends). Mirrors bodyTrackingApi.js: callers get the unwrapped
// `{ data }`.
import { apiGet, apiPost, apiPatch, apiDelete } from './api.js';

// Composed day view (meal slots + subtotals + progress bars + hydration).
export const getDay = (date) =>
  apiGet(`/api/v1/nutrition/day${date ? `?date=${encodeURIComponent(date)}` : ''}`).then(
    (r) => r.data,
  );

// Log a food into a meal slot (snapshots computed macros).
export const logEntry = (body) => apiPost('/api/v1/nutrition/log', body).then((r) => r.data);

// Edit a log entry's quantity (recomputes the macro snapshot).
export const editEntry = (id, quantityG) =>
  apiPatch(`/api/v1/nutrition/log/${id}`, { quantity_g: quantityG }).then((r) => r.data);

// Remove a log entry.
export const deleteEntry = (id) => apiDelete(`/api/v1/nutrition/log/${id}`);

// Search/list foods (optional case-insensitive name filter + category).
export const searchFoods = ({ q, category } = {}) => {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (category) params.set('category', category);
  const qs = params.toString();
  return apiGet(`/api/v1/foods${qs ? `?${qs}` : ''}`).then((r) => r.data);
};

// Create a custom food in the athlete's catalogue (or reconcile a duplicate).
export const createFood = (body) => apiPost('/api/v1/foods', body).then((r) => r.data);

// Pre-fill the day from the program's template meal plan.
export const loadPlan = (date, mode) =>
  apiPost('/api/v1/nutrition/load-plan', mode ? { date, mode } : { date }).then((r) => r.data);

// Add (or undo) water for a day; backend clamps total ≥ 0.
export const addHydration = (date, deltaMl) =>
  apiPost('/api/v1/nutrition/hydration', { date, delta_ml: deltaMl }).then((r) => r.data);

// Nutrition trends (calories window + macro breakdown + weekly avg protein).
export const getTrends = (date) =>
  apiGet(`/api/v1/nutrition/trends${date ? `?date=${encodeURIComponent(date)}` : ''}`).then(
    (r) => r.data,
  );

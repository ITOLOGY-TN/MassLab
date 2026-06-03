// Phase 6 (009-body-weight-measurements) — thin fetch wrappers for the body
// weight/measurements/photos surfaces. Mirrors loadTrackingApi.js: callers get
// the unwrapped `{ data }`.
import { apiGet, apiPost, apiUpload, apiDelete } from './api.js';

// Weigh-in capture reuses POST /body-measurements (cascades to body composition
// + program regen). Returns the full { measurement, body_composition, program_id }.
export const saveWeighIn = (body) => apiPost('/api/v1/body-measurements', body).then((r) => r.data);

// Weigh-in history (date-descending).
export const getHistory = (limit = 365) =>
  apiGet(`/api/v1/body-measurements?limit=${limit}`).then((r) => r.data);

export const getWeightChart = () =>
  apiGet('/api/v1/body-tracking/weight-chart').then((r) => r.data);

export const getMeasurementsTable = () =>
  apiGet('/api/v1/body-tracking/measurements-table').then((r) => r.data);

export const listPhotos = () => apiGet('/api/v1/body-tracking/photos').then((r) => r.data);

export const uploadPhoto = (formData) =>
  apiUpload('/api/v1/body-tracking/photos', formData).then((r) => r.data);

export const deletePhoto = (id) => apiDelete(`/api/v1/body-tracking/photos/${id}`);

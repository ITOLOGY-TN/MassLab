// Phase 4 (007-session-journal) — thin fetch wrappers for the Session Journal
// write surface. Mirrors programApi.js: callers get the unwrapped `{ data }`.
import { apiGet, apiPost, apiPut, apiDelete } from './api.js';

export const fetchActiveSession = () => apiGet('/api/v1/sessions/active').then((r) => r.data);

export const startSession = (dayOfWeek) =>
  apiPost('/api/v1/sessions', dayOfWeek ? { day_of_week: dayOfWeek } : {}).then((r) => r.data);

export const fetchSession = (id) => apiGet(`/api/v1/sessions/${id}`).then((r) => r.data);

export const saveSessionSets = (id, sets) =>
  apiPut(`/api/v1/sessions/${id}/sets`, { sets }).then((r) => r.data);

export const finishSession = (id, body) =>
  apiPost(`/api/v1/sessions/${id}/finish`, body ?? {}).then((r) => r.data);

export const discardSession = (id) => apiDelete(`/api/v1/sessions/${id}`);

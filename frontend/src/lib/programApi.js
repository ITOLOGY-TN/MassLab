// Phase 3 — thin fetch wrappers for the read-only Training Program views.
// Each endpoint returns the `{ data }` envelope; callers get the unwrapped body.
import { apiGet } from './api.js';

export const fetchProgramWeek = () => apiGet('/api/v1/program/week').then((r) => r.data);

export const fetchProgramDay = (dayOfWeek) =>
  apiGet(`/api/v1/program/day/${dayOfWeek}`).then((r) => r.data);

export const fetchProgramExercise = (id) =>
  apiGet(`/api/v1/program/exercises/${id}`).then((r) => r.data);

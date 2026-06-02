// Phase 3 — thin fetch wrappers for the Training Program views + enrichment.
// Read endpoints return the `{ data }` envelope; callers get the unwrapped body.
import { apiGet, apiPost, apiDelete, apiUpload } from './api.js';

export const fetchProgramWeek = () => apiGet('/api/v1/program/week').then((r) => r.data);

export const fetchProgramDay = (dayOfWeek) =>
  apiGet(`/api/v1/program/day/${dayOfWeek}`).then((r) => r.data);

export const fetchProgramExercise = (id) =>
  apiGet(`/api/v1/program/exercises/${id}`).then((r) => r.data);

// ---- US4 enrichment ------------------------------------------------------
export const listExercises = () => apiGet('/api/v1/exercises').then((r) => r.data);

function fileForm(file) {
  const fd = new FormData();
  fd.append('file', file);
  return fd;
}

export const uploadExerciseImage = (id, file) =>
  apiUpload(`/api/v1/exercises/${id}/media/image`, fileForm(file));
export const clearExerciseImage = (id) => apiDelete(`/api/v1/exercises/${id}/media/image`);

export const setExerciseVideoUrl = (id, video_url) =>
  apiPost(`/api/v1/exercises/${id}/media/video`, { video_url });
export const uploadExerciseVideo = (id, file) =>
  apiUpload(`/api/v1/exercises/${id}/media/video`, fileForm(file));
export const clearExerciseVideo = (id) => apiDelete(`/api/v1/exercises/${id}/media/video`);

export const addAlternative = (id, alternativeId) =>
  apiPost(`/api/v1/exercises/${id}/alternatives`, { alternative_exercise_id: alternativeId });
export const removeAlternative = (id, altId) =>
  apiDelete(`/api/v1/exercises/${id}/alternatives/${altId}`);

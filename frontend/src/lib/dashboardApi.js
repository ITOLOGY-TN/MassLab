// Phase 10 (013-phase10-dashboard) — thin fetch wrapper for the read-only
// dashboard composition surface. Mirrors recoveryApi.js: callers get the
// unwrapped `{ data }`.
import { apiGet } from './api.js';

// Composed dashboard view model (today's snapshot across all modules).
export const getDashboard = () => apiGet('/api/v1/dashboard').then((r) => r.data);

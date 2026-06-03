// Phase 6 (T043, FR-028) — a tiny shared hook the body screens use to read the
// athlete's kg/lbs preference (Phase 2 `GET /me/preferences` → `data.units`) for
// DISPLAY-ONLY conversion. Stored and API values stay metric; only what the eye
// sees changes. Defaults to 'kg' before the preference resolves and on any
// failure, so a screen never blocks or errors on the preference fetch.
import { useEffect, useState } from 'react';
import { apiGet } from './api.js';

export function usePreferredUnit() {
  const [unit, setUnit] = useState('kg');

  useEffect(() => {
    let active = true;
    apiGet('/api/v1/me/preferences')
      .then((res) => {
        if (!active) return;
        const u = res?.data?.units;
        if (u === 'kg' || u === 'lbs') setUnit(u);
      })
      .catch(() => {
        // Preference unavailable — metric is the safe, stored default.
      });
    return () => {
      active = false;
    };
  }, []);

  return unit;
}

// Phase 4 — elapsed-time helpers anchored to the server-authoritative
// `started_at` (research D-12) so a resumed/reloaded session shows true elapsed
// time, not time-since-resume.
import { useEffect, useState } from 'react';

export function elapsedSeconds(startedAt, now = Date.now()) {
  if (!startedAt) return 0;
  return Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000));
}

/** ISO weekday: Monday = 1 … Sunday = 7. Matches weekly_plan_slots.day_of_week. */
export function isoDayOfWeek(date) {
  const js = new Date(date).getDay();
  return js === 0 ? 7 : js;
}

export function formatDuration(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(sec).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Live elapsed seconds, ticking every second from `startedAt`. */
export function useElapsed(startedAt) {
  const [secs, setSecs] = useState(() => elapsedSeconds(startedAt));
  useEffect(() => {
    setSecs(elapsedSeconds(startedAt));
    if (!startedAt) return undefined;
    const id = setInterval(() => setSecs(elapsedSeconds(startedAt)), 1000);
    return () => clearInterval(id);
  }, [startedAt]);
  return secs;
}

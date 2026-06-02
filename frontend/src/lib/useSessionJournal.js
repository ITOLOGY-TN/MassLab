// Phase 4 — Session Journal state machine + auto-save (FR-017..FR-020, D-5).
// States: loading | idle | prompt (stale prior-day) | active | summary | error.
// Auto-save flushes the full set list every SESSION_AUTOSAVE_INTERVAL_MS and on
// each completion; it never finishes the session.
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchActiveSession,
  startSession,
  saveSessionSets,
  finishSession,
  discardSession,
} from './journalApi.js';
import { SESSION_AUTOSAVE_INTERVAL_MS } from './sessionConfig.js';

function flattenSets(session) {
  const out = [];
  for (const ex of session?.exercises ?? []) {
    for (const s of ex.sets ?? []) {
      out.push({
        exercise_id: ex.exercise_id,
        set_number: s.set_number,
        weight_kg: Number(s.weight_kg) || 0,
        reps: Number(s.reps) || 0,
        rpe: s.rpe ?? null,
        completed: Boolean(s.completed),
      });
    }
  }
  return out;
}

export function useSessionJournal() {
  const [status, setStatus] = useState('loading');
  const [session, setSession] = useState(null);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState(null);
  const sessionRef = useRef(null);
  const dirty = useRef(false);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    let active = true;
    fetchActiveSession()
      .then((s) => {
        if (!active) return;
        if (!s) {
          setStatus('idle');
        } else {
          sessionRef.current = s;
          setSession(s);
          setStatus(s.stale ? 'prompt' : 'active');
        }
      })
      .catch(() => {
        if (active) {
          setStatus('error');
          setError('load');
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const flush = useCallback(async () => {
    const s = sessionRef.current;
    if (!s || !dirty.current) return;
    dirty.current = false;
    try {
      await saveSessionSets(s.session_id, flattenSets(s));
    } catch {
      dirty.current = true; // retry on the next tick
    }
  }, []);

  useEffect(() => {
    if (status !== 'active') return undefined;
    const id = setInterval(() => {
      flush();
    }, SESSION_AUTOSAVE_INTERVAL_MS);
    return () => clearInterval(id);
  }, [status, flush]);

  const applyMutation = useCallback((mutator) => {
    const prev = sessionRef.current;
    if (!prev) return;
    const next = mutator(prev);
    sessionRef.current = next;
    dirty.current = true;
    setSession(next);
    return next;
  }, []);

  const mutateExercise = useCallback(
    (exerciseId, fn) =>
      applyMutation((prev) => ({
        ...prev,
        exercises: prev.exercises.map((ex) => (ex.exercise_id === exerciseId ? fn(ex) : ex)),
      })),
    [applyMutation],
  );

  const updateSet = useCallback(
    (exerciseId, setNumber, patch) =>
      mutateExercise(exerciseId, (ex) => ({
        ...ex,
        sets: ex.sets.map((s) => (s.set_number === setNumber ? { ...s, ...patch } : s)),
      })),
    [mutateExercise],
  );

  const addSet = useCallback(
    (exerciseId) =>
      mutateExercise(exerciseId, (ex) => {
        const nextNum = ex.sets.reduce((m, s) => Math.max(m, s.set_number), 0) + 1;
        const seed = ex.suggested_target_kg ?? ex.previous_weight_kg ?? 0;
        return {
          ...ex,
          sets: [
            ...ex.sets,
            {
              set_number: nextNum,
              weight_kg: seed,
              reps: ex.target_reps_low ?? 0,
              rpe: null,
              completed: false,
            },
          ],
        };
      }),
    [mutateExercise],
  );

  const removeSet = useCallback(
    (exerciseId, setNumber) =>
      mutateExercise(exerciseId, (ex) => ({
        ...ex,
        sets: ex.sets.filter((s) => s.set_number !== setNumber),
      })),
    [mutateExercise],
  );

  const completeSet = useCallback(
    async (exerciseId, setNumber) => {
      updateSet(exerciseId, setNumber, { completed: true });
      await flush(); // persist immediately on completion
    },
    [updateSet, flush],
  );

  const start = useCallback(async (dayOfWeek) => {
    setStatus('loading');
    try {
      const s = await startSession(dayOfWeek);
      sessionRef.current = s;
      setSession(s);
      setStatus('active');
    } catch (e) {
      setError(e);
      setStatus('error');
    }
  }, []);

  const resume = useCallback(() => setStatus('active'), []);

  const discard = useCallback(async () => {
    const s = sessionRef.current;
    if (s) {
      try {
        await discardSession(s.session_id);
      } catch {
        /* ignore — best effort */
      }
    }
    sessionRef.current = null;
    setSession(null);
    setStatus('idle');
  }, []);

  const finish = useCallback(
    async (note, energyRating) => {
      const s = sessionRef.current;
      if (!s) return;
      await flush();
      const sum = await finishSession(s.session_id, {
        note: note || null,
        energy_rating: energyRating ?? null,
      });
      setSummary(sum);
      setStatus('summary');
    },
    [flush],
  );

  const reset = useCallback(() => {
    sessionRef.current = null;
    setSession(null);
    setSummary(null);
    setStatus('idle');
  }, []);

  return {
    status,
    session,
    summary,
    error,
    start,
    resume,
    discard,
    updateSet,
    addSet,
    removeSet,
    completeSet,
    finish,
    flush,
    reset,
  };
}

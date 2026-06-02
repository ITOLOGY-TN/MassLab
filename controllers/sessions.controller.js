// Phase 4 (007-session-journal) — the Session Journal write path. Thin
// orchestration: read DAOs, hand plain data to the pure sessionJournal/* +
// engine helpers, return the `{ data }` envelope. The finish handler is the
// SOLE trigger of the Phase 1 engine (progression + 1RM + audit), mirroring
// controllers/progressionFlags.controller.js + oneRepMaxRecords.controller.js
// (research D-6). Auto-save (PUT /sets) never touches the engine (D-5).
import { HttpError } from '../middleware/errorHandler.js';
import {
  validate,
  sessionStartSchema,
  setInputSchema,
  upsertSetsSchema,
  finishSessionSchema,
} from '../services/engine/inputSchemas.js';
import { resolveConstants } from '../services/engine/resolveConstants.js';
import { evaluateForAthlete } from '../services/progressionEngine.js';
import { oneRepMax } from '../services/engine/oneRepMax.js';
import { writeAudit } from '../services/engine/auditWriter.js';
import { ENGINE_VERSION } from '../services/engine/constants.js';
import { bodySegmentFor } from '../services/engine/bodySegment.js';
import { heaviestCompletedSet } from '../services/engine/exerciseHistory.js';
import { totalVolume } from '../services/engine/sessionTotals.js';
import { detectPersonalRecords } from '../services/engine/personalRecords.js';
import { isoDayOfWeek, isSameAppDay } from '../services/sessionJournal/calendar.js';
import { currentTrainingPhase } from '../services/sessionJournal/currentPhase.js';
import { buildSessionView } from '../services/sessionJournal/sessionView.js';
import { buildPostSessionSummary } from '../services/sessionJournal/summaryView.js';

function isCompleted(s) {
  return Boolean(s) && s.completed === true && Number(s.weight_kg) > 0 && Number(s.reps) > 0;
}

export function sessionsController({ daos }) {
  // Gather everything the SessionView needs and compose it (research D-9/D-13).
  async function composeView(athleteId, session, now) {
    const [slots, muscleGroups, exercises, activeFlags, phases, athlete, overrides] =
      await Promise.all([
        daos.weeklyPlan.listSlotsWithExercises(athleteId),
        daos.muscleGroups.listForAthlete(athleteId, { includeArchived: true }),
        daos.exercises.listForAthlete({ athleteId, includeArchived: true }),
        daos.progressionFlags.findActiveForAthlete(athleteId),
        daos.trainingPhases.listForAthlete({ athleteId }),
        daos.athletes.findById(athleteId),
        daos.appConfig.getOverridesFor(athleteId),
      ]);

    const constants = resolveConstants(overrides);
    const slot = session.day_of_week
      ? (slots.find((s) => s.day_of_week === session.day_of_week) ?? null)
      : null;
    const mg = slot ? muscleGroups.find((g) => g.id === slot.muscle_group_id) : null;
    const muscleGroup = slot
      ? {
          name: mg?.name ?? 'Unassigned',
          color: slot.display_color ?? mg?.display_color ?? '#6b7280',
        }
      : null;

    const exercisesById = new Map(
      exercises.map((e) => [
        e.id,
        {
          slug: e.slug,
          name: e.name,
          is_active: e.is_active,
          targeted_muscles: e.targeted_muscles,
        },
      ]),
    );
    const activeFlagByExerciseId = new Map();
    for (const f of activeFlags) {
      if (f.scope_kind === 'exercise') activeFlagByExerciseId.set(Number(f.scope_ref), f);
    }

    const plannedExercises = slot?.exercises ?? [];
    const exerciseIds = new Set([
      ...plannedExercises.map((pe) => pe.exercise_id),
      ...(session.sets ?? []).map((s) => s.exercise_id),
    ]);
    const historyByExerciseId = new Map(
      await Promise.all(
        [...exerciseIds].map(async (exId) => [
          exId,
          await daos.sessions.recentSessionsForExercise(athleteId, exId, { limit: 5 }),
        ]),
      ),
    );

    const phase = currentTrainingPhase({
      phases,
      programStartDate: athlete?.program_start_date,
      now,
    });
    const restSeconds = Number(phase?.rest_seconds) || 0;
    const stale = session.started_at ? !isSameAppDay(session.started_at, now) : false;

    return buildSessionView({
      session,
      plannedExercises,
      exercisesById,
      muscleGroup,
      historyByExerciseId,
      activeFlagByExerciseId,
      restSeconds,
      constants,
      stale,
    });
  }

  async function loadOwnedSession(athleteId, idParam) {
    const id = Number(idParam);
    if (!Number.isInteger(id))
      throw new HttpError(404, 'NOT_FOUND', 'Session id must be an integer.');
    const session = await daos.sessions.getByIdWithSets(athleteId, id);
    if (!session) throw new HttpError(404, 'NOT_FOUND', `Session ${id} not found.`);
    return session;
  }

  return {
    // GET /api/v1/sessions/active — resume / prompt source (FR-019/FR-019a).
    async getActive(req, res, next) {
      try {
        const session = await daos.sessions.findActiveForAthlete(req.athleteId);
        if (!session) return res.json({ data: null });
        res.json({ data: await composeView(req.athleteId, session, new Date()) });
      } catch (err) {
        next(err);
      }
    },

    // POST /api/v1/sessions — start today's (or a chosen) day (FR-001..FR-003).
    async start(req, res, next) {
      try {
        const body = validate(sessionStartSchema, req.body ?? {});
        const existing = await daos.sessions.findActiveForAthlete(req.athleteId);
        if (existing) {
          throw new HttpError(
            409,
            'ACTIVE_SESSION_EXISTS',
            'An in-progress session already exists. Resume or discard it first.',
          );
        }
        const now = new Date();
        const dayOfWeek = body.day_of_week ?? isoDayOfWeek(now);
        const session = await daos.sessions.startSession(req.athleteId, {
          day_of_week: dayOfWeek,
          started_at: now.toISOString(),
        });
        session.sets = [];
        res.status(201).json({ data: await composeView(req.athleteId, session, now) });
      } catch (err) {
        next(err);
      }
    },

    // GET /api/v1/sessions/:id — resume a specific session.
    async get(req, res, next) {
      try {
        const session = await loadOwnedSession(req.athleteId, req.params.id);
        res.json({ data: await composeView(req.athleteId, session, new Date()) });
      } catch (err) {
        next(err);
      }
    },

    // DELETE /api/v1/sessions/:id — discard (e.g. a stale prior-day session).
    async discard(req, res, next) {
      try {
        const session = await loadOwnedSession(req.athleteId, req.params.id);
        await daos.sessions.discardSession(req.athleteId, session.id);
        res.status(204).end();
      } catch (err) {
        next(err);
      }
    },

    // PUT /api/v1/sessions/:id/sets — idempotent bulk auto-save (D-5).
    async upsertSets(req, res, next) {
      try {
        const session = await loadOwnedSession(req.athleteId, req.params.id);
        if (session.ended_at) {
          throw new HttpError(409, 'SESSION_ALREADY_FINISHED', 'This session is already finished.');
        }
        const body = validate(upsertSetsSchema, req.body ?? {});
        const sets = await daos.sessions.upsertSets(req.athleteId, session.id, body.sets);
        const volume = totalVolume(sets);
        await daos.sessions.setRunningVolume(req.athleteId, session.id, volume);
        res.json({
          data: {
            sets: sets.map((s) => ({
              set_id: s.id,
              exercise_id: s.exercise_id,
              set_number: s.set_number,
              weight_kg: Number(s.weight_kg),
              reps: s.reps,
              rpe: s.rpe ?? null,
              completed: Boolean(s.completed),
            })),
            total_volume_kg: volume,
          },
        });
      } catch (err) {
        next(err);
      }
    },

    // POST /api/v1/sessions/:id/sets — log a single set.
    async addSet(req, res, next) {
      try {
        const session = await loadOwnedSession(req.athleteId, req.params.id);
        if (session.ended_at) {
          throw new HttpError(409, 'SESSION_ALREADY_FINISHED', 'This session is already finished.');
        }
        const body = validate(setInputSchema, req.body ?? {});
        const row = await daos.sessions.insertSet(req.athleteId, session.id, body);
        res.status(201).json({
          data: {
            set_id: row.id,
            set_number: row.set_number,
            weight_kg: Number(row.weight_kg),
            reps: row.reps,
            rpe: row.rpe ?? null,
            completed: Boolean(row.completed),
          },
        });
      } catch (err) {
        next(err);
      }
    },

    // PATCH /api/v1/sessions/:id/sets/:setId — edit a logged set.
    async updateSet(req, res, next) {
      try {
        const session = await loadOwnedSession(req.athleteId, req.params.id);
        if (session.ended_at) {
          throw new HttpError(409, 'SESSION_ALREADY_FINISHED', 'This session is already finished.');
        }
        const setId = Number(req.params.setId);
        if (!Number.isInteger(setId))
          throw new HttpError(404, 'NOT_FOUND', 'Set id must be an integer.');
        const body = validate(setInputSchema, req.body ?? {});
        const row = await daos.sessions.updateSet(req.athleteId, session.id, setId, {
          exercise_id: body.exercise_id,
          set_number: body.set_number,
          weight_kg: body.weight_kg,
          reps: body.reps,
          rpe: body.rpe ?? null,
          completed: Boolean(body.completed),
        });
        if (!row) throw new HttpError(404, 'NOT_FOUND', `Set ${setId} not found.`);
        res.json({
          data: {
            set_id: row.id,
            set_number: row.set_number,
            weight_kg: Number(row.weight_kg),
            reps: row.reps,
            rpe: row.rpe ?? null,
            completed: Boolean(row.completed),
          },
        });
      } catch (err) {
        next(err);
      }
    },

    // DELETE /api/v1/sessions/:id/sets/:setId — remove a logged set.
    async deleteSet(req, res, next) {
      try {
        const session = await loadOwnedSession(req.athleteId, req.params.id);
        const setId = Number(req.params.setId);
        if (!Number.isInteger(setId))
          throw new HttpError(404, 'NOT_FOUND', 'Set id must be an integer.');
        await daos.sessions.deleteSet(req.athleteId, session.id, setId);
        res.status(204).end();
      } catch (err) {
        next(err);
      }
    },

    // POST /api/v1/sessions/:id/finish — discard incomplete, finalize, run engine (D-6/D-7).
    async finish(req, res, next) {
      try {
        const session = await loadOwnedSession(req.athleteId, req.params.id);
        if (session.ended_at) {
          throw new HttpError(409, 'SESSION_ALREADY_FINISHED', 'This session is already finished.');
        }
        const body = validate(finishSessionSchema, req.body ?? {});
        const now = new Date();

        const completedSets = (session.sets ?? []).filter(isCompleted);
        const performedExerciseIds = [...new Set(completedSets.map((s) => s.exercise_id))];

        const overrides = await daos.appConfig.getOverridesFor(req.athleteId);
        const constants = resolveConstants(overrides);
        const exercises = await daos.exercises.listForAthlete({
          athleteId: req.athleteId,
          includeArchived: true,
        });
        const exMetaById = new Map(exercises.map((e) => [e.id, e]));

        // PR detection — compare THIS session's completed sets against prior
        // history, BEFORE the finish inserts new 1RM records (D-10).
        const personalRecords = [];
        for (const exId of performedExerciseIds) {
          const sessionCompletedSets = completedSets.filter((s) => s.exercise_id === exId);
          const priorSessions = (
            await daos.sessions.recentSessionsForExercise(req.athleteId, exId, { limit: 100 })
          ).filter((s) => s.id !== session.id);
          const priorHeaviest = heaviestCompletedSet(priorSessions.flatMap((s) => s.sets ?? []));
          const priorRecords = await daos.oneRepMaxRecords.listForAthlete({
            athleteId: req.athleteId,
            exerciseId: exId,
          });
          const priorBestEstimate = priorRecords.length
            ? Math.max(...priorRecords.map((r) => Number(r.primary_estimate_kg)))
            : null;
          personalRecords.push(
            ...detectPersonalRecords({
              exerciseId: exId,
              name: exMetaById.get(exId)?.name ?? null,
              sessionCompletedSets,
              priorHeaviestCompletedSet: priorHeaviest,
              priorBestEstimate1rmKg: priorBestEstimate,
              constants,
            }),
          );
        }

        // 1. Finalize the session (discard incomplete, set ended_at + volume).
        const finalized = await daos.sessions.finishSession(req.athleteId, session.id, {
          note: body.note ?? null,
          energy_rating: body.energy_rating ?? null,
          total_volume_kg: totalVolume(completedSets),
          ended_at: now.toISOString(),
        });

        // 2. Run the Phase 1 engine once, over the now-finalized history (D-6).
        const slots = await daos.weeklyPlan.listSlotsWithExercises(req.athleteId);
        const exercisesById = {};
        for (const e of exercises) {
          exercisesById[e.id] = {
            id: e.id,
            slug: e.slug,
            muscle_group: null,
            body_segment: bodySegmentFor(e),
          };
        }
        for (const slot of slots) {
          for (const ex of slot.exercises ?? []) {
            if (exercisesById[ex.exercise_id]) exercisesById[ex.exercise_id].muscle_group = null;
          }
        }

        const history = await daos.sessions.historyForEngine(req.athleteId);
        const candidates = evaluateForAthlete({
          sessions: history.sessions,
          sets: history.sets,
          weeklyPlan: slots,
          exercisesById,
          constants,
          now,
        });
        let progressionFlagsUpdated = 0;
        for (const c of candidates) {
          const row = await daos.progressionFlags.supersedeAndInsert(
            { athleteId: req.athleteId, scopeKind: c.scope_kind, scopeRef: c.scope_ref },
            c.flag,
          );
          if (row) progressionFlagsUpdated += 1;
        }

        // 3. 1RM record per performed exercise, from its session feed set.
        let oneRepMaxRecordsCreated = 0;
        for (const exId of performedExerciseIds) {
          const feed = heaviestCompletedSet(completedSets.filter((s) => s.exercise_id === exId));
          if (!feed) continue;
          const orm = oneRepMax({
            weight_kg: Number(feed.weight_kg),
            reps: Number(feed.reps),
            constants,
          });
          const record = await daos.oneRepMaxRecords.insert({
            athlete_id: req.athleteId,
            exercise_id: exId,
            source_weight_kg: Number(feed.weight_kg),
            source_reps: Number(feed.reps),
            primary_estimate_kg: orm.primary_estimate_kg,
            epley_kg: orm.epley_kg,
            brzycki_kg: orm.brzycki_kg,
            lander_kg: orm.lander_kg,
            lombardi_kg: orm.lombardi_kg,
            percentage_table: orm.percentage_table,
            reduced_confidence: orm.reduced_confidence,
            engine_version: ENGINE_VERSION,
            resolved_constants: constants,
          });
          oneRepMaxRecordsCreated += 1;
          await writeAudit({
            daos,
            athleteId: req.athleteId,
            calculator: 'one_rep_max',
            reason: 'session_finish',
            inputs: {
              session_id: session.id,
              exercise_id: exId,
              source_weight_kg: Number(feed.weight_kg),
              source_reps: Number(feed.reps),
            },
            outputs: orm,
            resolvedConstants: constants,
            engineVersion: ENGINE_VERSION,
            producedRecord: { kind: 'one_rep_max_records', id: record.id },
          });
        }

        // 4. One audit row for the progression evaluation.
        await writeAudit({
          daos,
          athleteId: req.athleteId,
          calculator: 'progression_eval',
          reason: 'session_finish',
          inputs: {
            session_id: session.id,
            exercise_count: performedExerciseIds.length,
            set_count: completedSets.length,
          },
          outputs: { active_flag_count: progressionFlagsUpdated },
          resolvedConstants: constants,
          engineVersion: ENGINE_VERSION,
        });

        res.json({
          data: buildPostSessionSummary({
            session: finalized,
            completedSets,
            exercisesById: exMetaById,
            personalRecords,
            engineCounts: {
              progression_flags_updated: progressionFlagsUpdated,
              one_rep_max_records_created: oneRepMaxRecordsCreated,
            },
          }),
        });
      } catch (err) {
        next(err);
      }
    },
  };
}

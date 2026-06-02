# Quickstart — Phase 4: Session Journal

**Feature**: `007-session-journal` | **Date**: 2026-06-02

The operator's / developer's guide to what Phase 4 adds and how to exercise it. It assumes Phase 0–3 are in place (schedule configured, exercises seeded, calculator + progression engine available, Phase 3 read views live).

---

## What ships

| Surface | Route | Type |
| ------- | ----- | ---- |
| Resume / prompt source | `GET /api/v1/sessions/active` | read (composed) |
| Start today's / a chosen day | `POST /api/v1/sessions` | write |
| Get session for resume | `GET /api/v1/sessions/:id` | read (composed) |
| Auto-save (bulk set upsert) | `PUT /api/v1/sessions/:id/sets` | write (idempotent) |
| Log / edit / remove one set | `POST`/`PATCH`/`DELETE /api/v1/sessions/:id/sets[/:setId]` | write |
| Finish (triggers engine) | `POST /api/v1/sessions/:id/finish` | write |
| Discard (stale session) | `DELETE /api/v1/sessions/:id` | write |
| Frontend journal | `/journal` | one-handed logging screen |

Two forward-only migrations on existing tables (`session_journal_entries.day_of_week`; `session_sets` per-exercise uniqueness), one optional frontend Vite config var, **no new runtime dependency** and **no new table**. The `daos.sessions` slot is already wired in `app.js`; Phase 4 extends that DAO and adds the routes/controller.

---

## 1. Apply the migrations

```bash
supabase db push    # applies the two new session migrations to the cloud project (or local CLI stack)
```

Verify:

```sql
-- new column
select column_name from information_schema.columns
  where table_name = 'session_journal_entries' and column_name = 'day_of_week';
-- new per-exercise uniqueness
select conname from pg_constraint where conname = 'session_sets_session_exercise_set_number_key';
```

RLS is unchanged — the existing `session_journal_*_own` / `session_sets_*_own` policies (keyed on `athlete_id`) already cover the new column.

## 2. Configure the auto-save cadence (frontend, optional)

```dotenv
# frontend build env (Vite) — optional; defaults to 30000 in frontend/src/lib/sessionConfig.js
VITE_SESSION_AUTOSAVE_INTERVAL_MS=30000   # browser auto-save cadence; constitution mandates ≤ 30 s
```

Consumed only by the in-browser timer (no backend key); the app runs without it.

## 3. Log a session (write path)

```bash
# Is there an in-progress session to resume? (null on a clean slate)
curl -s localhost:3000/api/v1/sessions/active | jq '.data'

# Start today's session (omit day_of_week to use today's ISO weekday; pass 1–7 for an ad-hoc day)
SID=$(curl -s -X POST localhost:3000/api/v1/sessions -H 'content-type: application/json' -d '{}' | jq '.data.session_id')

# Inspect the loaded plan: previous weight + suggested target per exercise
curl -s localhost:3000/api/v1/sessions/$SID | jq '.data.exercises[] | {name, target_sets, previous_weight_kg, suggested_target_kg}'

# Auto-save the current set list (idempotent — this is what the 30 s timer sends)
curl -s -X PUT localhost:3000/api/v1/sessions/$SID/sets -H 'content-type: application/json' -d '{
  "sets": [
    { "exercise_id": 101, "set_number": 1, "weight_kg": 72.5, "reps": 8, "rpe": 8, "completed": true },
    { "exercise_id": 101, "set_number": 2, "weight_kg": 75.0, "reps": 6, "completed": false }
  ]
}' | jq '.data | {n: (.sets|length), total_volume_kg}'

# Completing a set with weight/reps 0 is rejected
curl -s -X PUT localhost:3000/api/v1/sessions/$SID/sets -H 'content-type: application/json' \
  -d '{"sets":[{"exercise_id":101,"set_number":1,"weight_kg":0,"reps":0,"completed":true}]}' | jq '.error.code'
# → "VALIDATION_FAILED"

# Finish — discards incomplete sets, runs the engine once, returns the summary
curl -s -X POST localhost:3000/api/v1/sessions/$SID/finish -H 'content-type: application/json' \
  -d '{"note":"felt strong","energy_rating":4}' | jq '.data | {duration_seconds, total_volume_kg, top_performance, prs: .personal_records, engine}'

# Finishing again is rejected
curl -s -X POST localhost:3000/api/v1/sessions/$SID/finish -d '{}' | jq '.error.code'   # → "SESSION_ALREADY_FINISHED"
```

Discard a stale prior-day session instead of resuming:

```bash
curl -s -X DELETE localhost:3000/api/v1/sessions/$SID -o /dev/null -w '%{http_code}\n'   # → 204
```

## 4. Confirm the engine ran (Phase 3 stays current)

After finishing, Phase 3's read surfaces reflect the new session immediately:

```bash
# Last weight + progression now populated on the day row
curl -s localhost:3000/api/v1/program/day/1 | jq '.data.exercises[] | {name, last_weight_kg, progression}'
# Estimated 1RM + recommended load now non-null on the exercise detail
curl -s localhost:3000/api/v1/program/exercises/101 | jq '.data.history | {has_history, estimated_1rm_kg, recommended_load_kg}'
```

A new audit row and (when a rule fired) a superseded progression flag and a fresh 1RM record exist:

```sql
select calculator, reason from calculation_results order by created_at desc limit 3;  -- expect reason='session_finish'
select scope_ref, flag_type, is_active from progression_flags where is_active order by created_at desc limit 5;
select exercise_id, primary_estimate_kg from one_rep_max_records order by created_at desc limit 3;
```

## 5. Frontend

```bash
cd frontend && npm run dev    # Vite dev server proxies /api to :3000
```

Navigate to `/journal`:

- On a training day, the screen auto-detects today's session; tap **Start** (or it resumes an in-progress same-day session automatically). A prior-day unfinished session shows a **resume-or-discard** prompt.
- Each exercise shows the previous weight and a suggested target. Per set: weight with **±2.5** buttons, reps with **±1**, optional RPE, and a **complete** check. One-handed, large hit targets.
- Completing a set auto-starts the **rest timer** (from the current phase's `rest_seconds`) with audio beeps near the end and at zero; mute/unsupported audio falls back to the visual countdown.
- The **session timer** at the top runs from the real `started_at` (correct even after a reload).
- Work is auto-saved every 30 s and on each completion — close the tab and reopen to confirm nothing is lost.
- **Finish** opens the summary: duration, total volume, top performance, any new PRs, a note field, and a 1–5 energy rating.

---

## How to verify the key behaviors

| Behavior | How to check |
| -------- | ------------ |
| Today auto-detection (FR-001) | On a configured day, `/journal` proposes that day's plan; on a rest day it offers any-day start (FR-002) |
| One-handed logging (SC-002) | Record a full set using only ±2.5 / ±1 / complete — no keyboard |
| Never lose progress (SC-004) | Log sets, reload `/journal` → same-day session resumes with all sets; exactly one session per day |
| Prior-day prompt (FR-019a) | Leave a session unfinished overnight (or set `started_at` to yesterday) → resume/discard prompt, never silent |
| Auto-save idempotency (D-5) | Re-`PUT` the same set list twice → identical stored state, no duplicates |
| Discard incomplete on finish (FR-025a) | Finish with an incomplete set present → it is not in history; volume excludes it |
| Engine on finish (SC-007) | After finish, Phase 3 day/exercise reflect new last-weight, 1RM, progression |
| Finish-once (D-6) | Second finish → 409 SESSION_ALREADY_FINISHED; no duplicate 1RM/audit rows |
| Top performance / PR (SC-006) | Log a set heavier than the prior best → summary flags it; verify duration & volume match completed sets |
| Rest timer audio fallback (FR-016) | Mute the device → countdown still completes; logging unaffected |

---

## Test commands

```bash
npm test                                          # full suite (unit + integration + contract + frontend)
npx vitest run tests/unit/engine.sessionTotals.test.js       # totalVolume, topPerformance
npx vitest run tests/unit/engine.personalRecords.test.js     # PR detection (weight + 1RM)
npx vitest run tests/unit/sessionJournal.calendar.test.js    # isoDayOfWeek, isSameAppDay
npx vitest run tests/unit/sessionJournal.currentPhase.test.js
npx vitest run tests/unit/sessionJournal.sessionView.test.js # suggested target / resume composition
npx vitest run tests/integration/sessions.lifecycle.test.js  # start → autosave → finish → engine side effects
npx vitest run tests/contract/sessions.contract.test.js
```

Integration tests that hit Supabase auto-skip when `.env` is missing or the project is unreachable (offline fallback), consistent with Phase 0–3.

---

## Boundaries (what Phase 4 does NOT do)

- Does **not** reinvent any formula — 1RM uses the existing engine `oneRepMax`, progression uses `evaluateForAthlete`, the suggested target uses the Phase 3 `recommendWorkingLoad`.
- Does **not** run the engine on auto-save — only on explicit finish (D-5/D-6).
- Does **not** persist incomplete sets, rest-timer overrides, or elapsed time — completed sets and `started_at` are the only durable state (D-7, D-12).
- Does **not** rebuild the schedule, muscle groups, or exercise data — it reads Phase 2/3 configuration.
- Does **not** add Load Tracking charts or the progression overview table — that is Phase 5.

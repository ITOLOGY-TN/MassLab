---
description: 'Dependency-ordered tasks for Phase 3 — Training Program & Exercise Library'
---

# Tasks: Phase 3 — Training Program & Exercise Library

**Input**: Design documents from `/specs/006-training-program-library/`
**Prerequisites**: plan.md ✅, spec.md ✅ (clarified 2026-06-02), research.md ✅ (D-1…D-9), data-model.md ✅, contracts/openapi.yaml ✅, quickstart.md ✅

**Tests**: INCLUDED. Constitution Principle V mandates test-first for all domain logic (engine helpers + view-model presenters + any surfaced number). UI views ship smoke tests. Engine/presenter tests are written to FAIL first, then made green.

**Branch**: `006-training-program-library`

## Format: `[ID] [P?] [Story] Description with file path`

- **[P]** = parallelizable (different files, no dependency on an incomplete task).
- **[Story]** = US1/US2/US3/US4 (Setup/Foundational/Polish carry no story label).
- Paths are repo-relative and exact.

---

## ⚡ Ultracode / Workflow Execution Guide

This task list is authored for **ultracode** execution (multi-agent `Workflow` orchestration + xhigh effort). Recommended shape when implementing:

1. **Phase 1 + 2 (Setup + Foundational)** → run as a `Workflow` with two stages:
   - Stage A (`parallel`): the four independent legs — config (T001–T002), migration (T004), the three DAOs (T006–T008), the frontend route scaffold (T003). These touch disjoint files.
   - Stage B (`pipeline` per engine helper): each engine helper is a **test-first pair** — write failing test → implement → adversarially verify the math against the spec rule. Run the three helpers (exerciseHistory, loadRecommendation, oneRepMax-invariant) as parallel pipelines.
   - Barrier before user stories: T009 (dao wiring) + T015 (controller/route mount) must complete.
2. **Phase 3–6 (US1→US4)** → one `pipeline` item per user story; each item runs its `presenter-test → presenter-impl → endpoint → contract/integration → frontend → smoke` chain. US1 and US2/US3 share the engine/DAO foundation but their presenters/endpoints/views are disjoint files, so the four stories pipeline concurrently. **US4 depends on US3** (it edits the same `ExerciseDetail.jsx` and exercises surface) — keep US4 after US3 in its pipeline lane.
3. **Adversarial verify** (xhigh): for every task that produces or asserts a number (T010–T014, T023–T024, T030–T032, T035), spawn an independent verifier agent that tries to **refute** the result against the spec FR + the D-decision before marking it done.
4. **Phase 7 (Polish)** → final `parallel` sweep + a completeness critic ("what FR/edge-case/empty-state is untested?").

Concurrency note: keep file-mutating agents on disjoint paths (the layout below guarantees this) or use `isolation: 'worktree'` if two agents must touch `exercises.controller.js` / `App.jsx` at once. T038–T039 both edit `exercises.controller.js` → run them **sequentially**, not in parallel.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Config + route scaffolding that later phases build on. No business logic.

- [X] T001 [P] Add Phase 3 config keys to `config/schema.js` with documented defaults: `EXERCISE_MEDIA_MAX_BYTES` (default 26214400), `EXERCISE_MEDIA_IMAGE_TYPES` (default `image/jpeg,image/png,image/webp`), `EXERCISE_MEDIA_VIDEO_TYPES` (default `video/mp4,video/webm`), `YOUTUBE_EMBED_HOST` (default `https://www.youtube-nocookie.com`). Mirror them (no real values) in `.env.example`. (research D-8, Constitution III)
- [X] T002 [P] Extend `tests/unit/config.schema.test.js` to assert the four new keys parse from strings, apply defaults when absent, and reject malformed `EXERCISE_MEDIA_MAX_BYTES`.
- [X] T003 [P] Add the `/program` route tree to `frontend/src/App.jsx` (routes `/program`, `/program/day/:dayOfWeek`, `/program/exercises/:id` with placeholder components) and add a "Program" link to the `Shell` nav. Keep placeholders until US views land.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Database, data-access boundary, pure engine helpers, and the controller/route mount that ALL `/program/*` stories depend on.

**⚠️ CRITICAL**: No `/program/*` user-story endpoint can be implemented until T009 (dao wiring) and T015 (controller mount) are done. Engine helpers (T010–T014) block US2/US3.

### Database

- [X] T004 Create migration `supabase/migrations/<timestamp>_init_exercise_alternatives.sql`: table per data-model.md (`athlete_id`, `exercise_id`, `alternative_exercise_id`, `display_order`, `created_at`), `CHECK (exercise_id <> alternative_exercise_id)`, `UNIQUE (athlete_id, exercise_id, alternative_exercise_id)`, both FKs `ON DELETE CASCADE`, index `(athlete_id, exercise_id, display_order)`, and `exercise_alternatives_select_own` + `exercise_alternatives_modify_own` RLS in the same file. (research D-6, D-7; Constitution I)
- [X] T005 Apply T004 to the dev Supabase project and verify table + both RLS policies exist (per quickstart.md §1). Forward-only, replayable from empty.

### Data-access (only Supabase-importing layer — Constitution II)

- [X] T006 [P] Create `services/dataAccess/sessions.dao.js` — READ-ONLY: `recentSessionsForExercise(athleteId, exerciseId, { limit = 5 })` (join `session_journal_entries` + `session_sets`, order `started_at DESC`) and `latestSessionWithSets(athleteId, exerciseId)`. No write methods. (research D-5; FR-026)
- [X] T007 [P] Create `services/dataAccess/exerciseAlternatives.dao.js` — `listForSource(athleteId, exerciseId)` (join `exercises` for name/slug/is_active, order `display_order`), `add(athleteId, exerciseId, altId, displayOrder)` (map `23505` → `409 CONFLICT`), `remove(athleteId, exerciseId, altId)`. (research D-6)
- [X] T008 [P] Extend `services/dataAccess/exercises.dao.js` with `getByIdForAthlete(athleteId, id)` and media helpers `setImage`/`clearImage`/`setVideo`/`clearVideo` (write `media_image_url` / `media_video_url`). No slug rederivation. (research D-8)
- [X] T009 Wire `sessions` and `exerciseAlternatives` DAOs into the resolved `daos` map in `app.js` so controllers receive them via `{ daos }`.

### Engine (pure, TEST-FIRST — write the test, see it fail, then implement)

- [X] T010 [P] Write FAILING unit tests `tests/unit/engine.exerciseHistory.test.js`: `heaviestCompletedSet` (ignores `completed=false` and non-positive weight/reps, tie-break = first), `lastWeightUsed` (heaviest completed set in most-recent session only; null when none), `recentSessions` (≤5, most-recent-first). (FR-009, FR-016, FR-027; D-2)
- [X] T011 [P] Implement `services/engine/exerciseHistory.js` (pure: explicit inputs, no clock/IO) to make T010 green.
- [X] T012 [P] Write FAILING unit tests `tests/unit/engine.loadRecommendation.test.js`: `add_load` flag → `lastWeightKg + load_increment` (upper vs lower by body segment); any other/none flag → hold `lastWeightKg`; `null` when no history. Constants via `resolveConstants`. (FR-018; D-3)
- [X] T013 [P] Implement `services/engine/loadRecommendation.js` (pure) to make T012 green.
- [X] T014 [P] Add unit test `tests/unit/engine.oneRepMax.detailFeed.test.js` pinning that the detail-page 1RM equals `oneRepMax({ weight, reps }).primary_estimate_kg` fed by `heaviestCompletedSet` (no Epley-only path, no records read). (FR-017; D-1)

### Backend + frontend scaffold (shared by all read stories)

- [X] T015 Create `routes/trainingProgram.routes.js` + `controllers/trainingProgram.controller.js` with three stubbed read handlers (`getWeek`, `getDay`, `getExercise`) and mount the router at `/api/v1/program` in `app.js`. (research D-9; Constitution IV)
- [X] T016 [P] Create `frontend/src/lib/programApi.js` (typed fetch wrappers for the three `/program/*` GETs reusing the existing `apiGet`) and a shared `frontend/src/components/StateBlock.jsx` for loading / empty / error states reused by all three views.

**Checkpoint**: Foundation ready — US1–US4 can proceed (US1 needs only T015/T016; US2/US3 also need T006/T009/T010-T014; US4 also needs T004/T007/T008).

---

## Phase 3: User Story 1 — Weekly planning view (Priority: P1) 🎯 MVP

**Goal**: Show the configured week as training-day cards + compact rest separators, each card showing muscle group, color, and exercise count; tapping a card opens the day.

**Independent Test**: With the default 5-day split, `/program` shows 5 cards + 2 rest separators in week order with correct counts; changing the schedule in Settings and reloading reflects it; zero training days → empty-week state.

- [X] T017 [P] [US1] Write FAILING unit test `tests/unit/trainingProgram.weekView.test.js`: 7 ordered entries, `kind` training/rest derivation, `exercise_count` (incl. 0), `empty=true` on zero training days, muscle-group ref resolution. (FR-001…FR-006)
- [X] T018 [US1] Implement `services/trainingProgram/weekView.js` (pure: assemble `WeekView` from slots + per-slot exercise counts + muscle-groups) to make T017 green.
- [X] T019 [US1] Implement `getWeek` in `controllers/trainingProgram.controller.js` (read `weeklyPlan` + `muscleGroups` DAOs, call `weekView`, return `{ data }`). Wire `GET /program/week` in `routes/trainingProgram.routes.js`.
- [X] T020 [P] [US1] Contract test `tests/contract/program.week.contract.test.js` validating the response against `contracts/openapi.yaml` `WeekView` (7 entries, envelope, empty flag). PLUS an integration assertion in `tests/integration/program.week.reflect.test.js`: after a `PUT /me/schedule` change, `GET /program/week` reflects the new day/muscle-group/count on the next read with no stale labels (automates **SC-002**). (remediation G1)
- [X] T021 [P] [US1] Build `frontend/src/pages/program/ProgramWeek.jsx` + `frontend/src/components/DayCard.jsx` + `frontend/src/components/RestSeparator.jsx` (Frontend Design skill; Tailwind tokens; large tap targets; empty-week CTA to Settings). Replace the Phase-1 placeholder route.
- [X] T022 [P] [US1] Frontend smoke test `tests/frontend/program.week.test.jsx`: renders cards + separators from a stub week, renders empty-week state, card tap navigates to `/program/day/:d`.

**Checkpoint**: US1 fully functional and demoable as MVP independent of US2–US4.

---

## Phase 4: User Story 2 — Day detail with progress context (Priority: P1)

**Goal**: For one day, list exercises in order with target sets/reps, last weight used, and a ready/stable/regressing indicator; rows open the exercise detail.

**Independent Test**: Open a day with an ordered list → exercises in `position` order with target sets/reps; with seeded session history the row shows the heaviest completed set as last weight and the indicator matching the active flag; with no history both show neutral empty states; archived exercise shows a marker; empty day shows "no exercises".

- [X] T023 [P] [US2] Write FAILING unit test `tests/unit/trainingProgram.dayView.test.js`: ordering by `position`; `last_weight_kg` via `exerciseHistory`; progression mapping (`add_load`→ready, `regression`→regressing, else stable — D-4); `is_active=false` marker; `empty_exercises=true`. (FR-007…FR-012)
- [X] T024 [US2] Implement `services/trainingProgram/dayView.js` (pure: compose weekly-plan exercises + `lastWeightUsed` + active-flag mapping) to make T023 green.
- [X] T025 [US2] Implement `getDay` in `controllers/trainingProgram.controller.js` (validate `dayOfWeek` 1–7 → 404 otherwise; read slot/exercises/sessions/flags DAOs; call `dayView`). Wire `GET /program/day/:dayOfWeek`.
- [X] T026 [P] [US2] Contract test `tests/contract/program.day.contract.test.js` against `DayView` (incl. rest/empty day returns 200, out-of-range → 404).
- [X] T027 [P] [US2] Integration test `tests/integration/program.day.history.test.js`: seed a session + sets → `last_weight_kg` = heaviest completed set; warm-up/incomplete excluded; no-history path → null + stable.
- [X] T028 [P] [US2] Build `frontend/src/pages/program/ProgramDay.jsx` + `frontend/src/components/ProgressionBadge.jsx` (ordered rows, target sets/reps, last weight, indicator, archived marker, empty states; rows link to exercise detail).
- [X] T029 [P] [US2] Frontend smoke test `tests/frontend/program.day.test.jsx`: ordered rows from stub, empty-history neutral state, empty-day state, row tap navigates.

**Checkpoint**: US1 + US2 both independently functional.

---

## Phase 5: User Story 3 — Exercise detail page (Priority: P2)

**Goal**: Full exercise reference — name, muscles, instructions, technique, image, video (YouTube embed or uploaded), alternatives, last-5 sessions, engine 1RM, recommended load — with graceful empty states.

**Independent Test**: Open an exercise → static content always renders; media renders when present; linked alternatives list and navigate; with history, last-5 + 1RM + load rec render and the 1RM feed matches the day-view last-weight (SC-003); with no history those sections show empty states.

- [X] T030 [P] [US3] Write FAILING unit test `tests/unit/trainingProgram.exerciseView.test.js`: static always present; `media.video.kind` classification (youtube/upload/null); alternatives incl. `is_active` archived flag; `history` null/empty when no sets; `estimated_1rm_kg` + `recommended_load_kg` from the same heaviest set. (FR-013…FR-019; D-1, D-3, D-7)
- [X] T031 [P] [US3] Implement `services/trainingProgram/mediaClassifier.js` (pure) exporting BOTH `classifyVideo(media_video_url)` (youtube vs upload vs null) and `normalizeYoutubeUrl(url, embedHost)` (watch/share URL → `YOUTUBE_EMBED_HOST` embed URL). This is the **single source of truth** for YouTube normalization, reused by the write path (T038). Unit test `tests/unit/trainingProgram.mediaClassifier.test.js` covers watch/share/embed/short (`youtu.be`) forms + non-YouTube passthrough. (D-8; remediation D1)
- [X] T032 [US3] Implement `services/trainingProgram/exerciseView.js` (pure: compose exercise static + `mediaClassifier` + alternatives + `recentSessions` + `oneRepMax` + `loadRecommendation`) to make T030 green.
- [X] T033 [US3] Implement `getExercise` in `controllers/trainingProgram.controller.js` (read exercises/alternatives/sessions/flags DAOs; 404 when not owned). Wire `GET /program/exercises/:id`.
- [X] T034 [P] [US3] Contract test `tests/contract/program.exercise.contract.test.js` against `ExerciseView` (history nullability, media shape, alternatives).
- [X] T035 [P] [US3] Integration test `tests/integration/program.exercise.detail.test.js`: alternatives listed (incl. an archived target with marker); history rollup; SC-003 consistency (detail `estimated_1rm_kg` derives from the same heaviest set the day view reports as `last_weight_kg`).
- [X] T036 [P] [US3] Build `frontend/src/pages/program/ExerciseDetail.jsx` (static content, image, YouTube `youtube-nocookie` `<iframe>` + native `<video>` for uploads, alternatives links, last-5 list, 1RM, load rec, all empty states).
- [X] T037 [P] [US3] Frontend smoke test `tests/frontend/program.exerciseDetail.test.jsx`: static renders with no history (empty states); media + alternatives render when stubbed; alternative link navigates.

**Checkpoint**: US1 + US2 + US3 browsable end-to-end (read-only enrichment shows seeded/existing media + alternatives).

---

## Phase 6: User Story 4 — Manage exercise enrichment: media & alternatives (Priority: P3)

**Goal**: Attach/clear an image, set a YouTube link or upload a local video, and link/unlink alternatives — all reflected on the detail page; invalid actions rejected.

**Independent Test**: Add image, set YouTube link, upload video, link two alternatives → all persist and appear on detail; self-link and duplicate rejected (409); oversize/unsupported upload rejected (413/415) with prior media preserved; each item removable.

> **Depends on US3** (edits the same `ExerciseDetail.jsx` + the exercises surface). T038 and T039 both edit `exercises.controller.js`/`routes/exercises.routes.js` → run them **sequentially**.

- [X] T038 [US4] Implement exercise **media** endpoints in `controllers/exercises.controller.js` + `routes/exercises.routes.js`: `POST/DELETE /exercises/:id/media/image` and `POST/DELETE /exercises/:id/media/video` (multipart via reused `multer` memory storage for files; JSON `video_url` branch for YouTube → normalize by calling `normalizeYoutubeUrl` from `services/trainingProgram/mediaClassifier.js` (T031), NOT a second copy; validate type/size against config; on reject return canonical `413`/`415` and PRESERVE existing media; store via `photoStorage` + `exercises.dao` media helpers). (FR-020, FR-021, FR-024; D-8; remediation D1)
- [X] T039 [US4] Implement **alternatives** endpoints in `controllers/exercises.controller.js` + `routes/exercises.routes.js`: `GET/POST /exercises/:id/alternatives`, `DELETE /exercises/:id/alternatives/:alternativeId` (self-link → `409 SELF_LINK_FORBIDDEN`, duplicate → `409 CONFLICT` via DAO; one-directional). (FR-022, FR-023; D-6)
- [X] T040 [P] [US4] Integration test `tests/integration/exercise.alternatives.test.js`: add → list ordered; self-link reject; duplicate reject; remove; cascade cleanup when an exercise is hard-deleted; RLS isolation (another athlete cannot read/modify). ALSO add a cross-athlete case asserting the three `/program/*` read endpoints (`/program/week`, `/program/day/:d`, `/program/exercises/:id`) never return another athlete's data (FR-025) — extend here or in `tests/integration/tenant.scoping.test.js`. (remediation G2)
- [X] T041 [P] [US4] Integration test `tests/integration/exercise.media.test.js`: image upload happy; local video upload happy; YouTube URL → stored as nocookie embed; oversize → 413 with prior media intact; wrong type → 415 with prior media intact; clear → 204.
- [X] T042 [P] [US4] Contract tests `tests/contract/exercise.media.contract.test.js` + `tests/contract/exercise.alternatives.contract.test.js` against the openapi paths.
- [X] T043 [P] [US4] Build `frontend/src/components/ExerciseMediaEditor.jsx` (image upload, video URL/upload toggle, clear) and wire into `ExerciseDetail.jsx`.
- [X] T044 [P] [US4] Build `frontend/src/components/AlternativesEditor.jsx` (pick exercise, link/unlink, surface self/duplicate errors) and wire into `ExerciseDetail.jsx`.
- [X] T045 [P] [US4] Frontend smoke test `tests/frontend/program.enrichment.test.jsx`: media editor calls upload/clear; alternatives editor calls add/remove and shows the conflict message.
- [ ] T046 [P] [US4] (Optional demo data) Add a few alternative links + sample media references to `seed/exercises.seed.json` so the detail page is populated on a fresh seed.

**Checkpoint**: All four user stories independently functional; enrichment round-trips.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T047 [P] Run the `quickstart.md` curl flows end-to-end against dev Supabase; fix any drift between contract and implementation.
- [X] T048 [P] Run `npm test` (unit + contract + integration + frontend) and `npx eslint .`; ensure green.
- [X] T049 [P] Update the Phase 3 section of `CLAUDE.md` (new `services/trainingProgram/` pure presenter boundary; read-only `sessions.dao.js`; `exercise_alternatives` table + one-directional rule; exercise media handling + config keys).
- [X] T050 [P] Frontend Design skill polish pass on the three screens (tokens, hit targets, motion, designed empty states) and record which decisions were applied (Constitution VI review requirement).
- [X] T051 Verify performance budgets against dev Supabase: `/program/day` ≤ 500 ms, `/program/exercises/:id` ≤ 700 ms server-side (plan Performance Goals).
- [X] T052 Append a Phase 3 entry to `.specify/memory/compliance-log.md` auditing the six principles (esp. I tenant scoping + RLS on `exercise_alternatives`, II layering, III config-driven media limits, V test-first engine/presenters). Record the **pre-existing localization-seam deviation** (Operational Standard: user-facing copy is hardcoded across all frontend phases; no strings/i18n catalog exists yet) as a tracked, project-wide follow-up — NOT introduced by Phase 3, not a Phase 3 blocker. (remediation C1)

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (Ph1)**: no deps — start immediately (T001–T003 fully parallel).
- **Foundational (Ph2)**: after Setup. T004→T005 sequential (migrate then verify). T006/T007/T008 parallel. T009 after T006/T007. T010–T014 parallel test-first pairs. T015 after controller files exist. T016 parallel.
- **US1 (Ph3)**: needs T015, T016. Independent of US2–US4.
- **US2 (Ph4)**: needs T009, T010–T011 (history), T015, T016.
- **US3 (Ph5)**: needs T007, T009, T010–T014, T015, T016.
- **US4 (Ph6)**: needs T004/T005, T007, T008, and **US3** (shared `ExerciseDetail.jsx`).
- **Polish (Ph7)**: after all targeted stories.

### Story independence

- US1, US2, US3 are independently testable read stories (disjoint presenter/endpoint/view files).
- US4 layers writes onto the US3 surface — sequence US4 after US3.

### Within a story

- Presenter test (FAIL) → presenter impl → controller endpoint → contract/integration tests → frontend view → smoke test.

### Parallelizable sets

- Ph1: {T001, T002, T003}
- Ph2: {T006, T007, T008} · {T010+T011, T012+T013, T014} · {T016}
- Ph3: {T020, T021, T022} after T019
- Ph4: {T026, T027, T028, T029} after T025
- Ph5: {T031} ∥ {T030} then T032; {T034, T035, T036, T037} after T033
- Ph6: {T040, T041, T042, T043, T044, T045, T046} after T038→T039 (T038, T039 sequential)
- Ph7: {T047, T048, T049, T050, T052} ∥ ; T051 standalone

---

## Parallel Example: Foundational engine helpers (test-first)

```text
# Three independent test-first pipelines, run concurrently:
Pipeline A: T010 (write failing exerciseHistory tests) → T011 (implement) → verify
Pipeline B: T012 (write failing loadRecommendation tests) → T013 (implement) → verify
Pipeline C: T014 (oneRepMax detail-feed invariant test) → verify
# Meanwhile, disjoint DAO + scaffold agents:
Agent: T006 sessions.dao.js   Agent: T007 exerciseAlternatives.dao.js   Agent: T008 exercises.dao media helpers
```

## Parallel Example: User stories after Foundational

```text
Lane US1: T017→T018→T019→{T020,T021,T022}
Lane US2: T023→T024→T025→{T026,T027,T028,T029}
Lane US3: T030/T031→T032→T033→{T034,T035,T036,T037}
Lane US4: (after US3) T038→T039→{T040..T046}
```

---

## Implementation Strategy

### MVP first

1. Ph1 Setup → Ph2 Foundational (at least T015/T016 + the engine helpers).
2. Ph3 US1 (week view) → **validate + demo** as MVP.

### Incremental delivery

US1 (week) → US2 (day) → US3 (exercise detail) → US4 (enrichment). Each adds value without breaking the previous.

### Ultracode/workflow

Run Setup+Foundational as one workflow (parallel legs + test-first pipelines), then a four-lane story workflow with adversarial verification on every numeric task, closing with a polish + completeness-critic sweep. See the **Ultracode / Workflow Execution Guide** at the top.

---

## Task Count

- **Total**: 52 tasks (T001–T052)
- **Setup**: 3 · **Foundational**: 13 · **US1**: 6 · **US2**: 7 · **US3**: 8 · **US4**: 9 · **Polish**: 6
- **Test tasks**: 18 (engine/presenter unit, contract, integration, frontend smoke) — test-first for all domain logic per Constitution V.
- **Post-analysis remediation (2026-06-02)** folded into existing tasks (no renumber): D1 shared YouTube normalizer (T031↔T038), G1 SC-002 reflection integration test (T020), G2 `/program/*` tenant isolation test (T040), A1/A2 spec wording (FR-016/017/018), C1 localization-seam follow-up logged (T052).

## Notes

- `[P]` = different files, no incomplete dependency. Two tasks editing the same file are never both `[P]` (e.g. T038/T039 on `exercises.controller.js`).
- No `@supabase/supabase-js` import outside `services/dataAccess/*`; presenters + engine stay pure.
- Every new domain row is `athlete_id`-scoped with RLS in its migration.
- Verify each domain-logic test FAILS before implementing.
- Commit after each task or logical group; stop at any checkpoint to validate a story independently.

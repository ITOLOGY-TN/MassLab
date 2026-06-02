# Implementation Plan: Phase 3 — Training Program & Exercise Library

**Branch**: `006-training-program-library` | **Date**: 2026-06-02 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/006-training-program-library/spec.md`

## Summary

Phase 3 is the **browse-and-consult layer** over the training data that Phases 0–2 already model and Phase 1 already computes. It ships three read-centric screens — a **weekly planning view** (training-day cards + rest separators), a **day detail view** (ordered exercises with last weight + progression indicator), and an **exercise detail page** (instructions, technique, media, alternatives, last-5 sessions, engine 1RM, load recommendation) — plus the only two genuinely new mutating capabilities of the phase: **exercise media uploads** (image + local video, reusing the Phase 0 `photoStorage` adapter) and **alternative-exercise links** (one new athlete-scoped table).

Everything history-derived (last weight, last-5 sessions, estimated 1RM, recommended working load) is computed **read-only** from already-logged `session_journal_entries` + `session_sets`, which Phase 4 will populate; until then every such surface renders a deterministic empty state. The numeric outputs — heaviest-completed-set selection, the engine 1RM feed, and the load recommendation — are extracted into **pure, test-first functions** under `services/engine/` (Constitution V).

Backend adds **1 forward-only migration** (`exercise_alternatives` table + RLS), **1 read-only session DAO** (`services/dataAccess/sessions.dao.js` — first reader of the Phase 0 session tables), a small `exercise_alternatives` DAO, an exercise-media upload path (multipart, bounded by config), and a new `services/trainingProgram/` pure presenter boundary that assembles the day/exercise view models from DAO output + engine functions. Frontend adds one new top-level route tree at `/program` with three views, built through the Frontend Design skill on the existing Tailwind tokens. No data is captured here; no engine formula is reinvented.

## Technical Context

**Language/Version**: Node.js 20+ (dev runs 22.x), JavaScript ES2022 ESM. React 18.3 frontend via Vite.

**Primary Dependencies** (all already installed in Phase 0–2 unless noted):

- Backend: `express`, `@supabase/supabase-js` (DAO layer only), `pino` / `pino-http`, `dotenv`, `zod`, `cors`, and `multer@^1.4` (added in Phase 2 for JSON import — **reused** here for the exercise-media multipart upload, no new dependency). The view-model presenters and engine helpers are pure JavaScript.
- Frontend: `react`, `react-dom`, `vite`, `tailwindcss`, `react-router-dom@^6`. **No new frontend runtime dependency.** YouTube embeds use a plain `<iframe>` against the privacy-enhanced `youtube-nocookie.com` host (no SDK); uploaded video uses the native `<video>` element. `@dnd-kit/*` (Phase 2) is **not** needed — Phase 3 does not reorder (reorder already exists at `POST /me/schedule/slots/:slotId/exercises/reorder`).

**Storage**: Supabase PostgreSQL (cloud project; local CLI stack is the offline fallback). Phase 3 ships **1 new migration**: the `exercise_alternatives` table (`athlete_id`, `exercise_id`, `alternative_exercise_id`, `display_order`, timestamps) with a self-link CHECK, a unique `(athlete_id, exercise_id, alternative_exercise_id)` index, FKs to `exercises`, and its `*_select_own` / `*_modify_own` RLS in the same file. Exercise media reuses the existing `exercises.media_image_url` / `exercises.media_video_url` columns — **no schema change** for media. Uploaded bytes go through the `photoStorage` adapter (filesystem default).

**Testing**: Vitest. Per Constitution V, the numeric/recommendation logic is unit-tested first (red → green → refactor):

- `services/engine/exerciseHistory.js` (new, pure): `heaviestCompletedSet(sets)`, `lastWeightUsed(sessionsWithSets)`, `recentSessions(sessionsWithSets, n=5)` — selection rules from FR-009/FR-016/FR-027 (ignore incomplete/invalid sets; most-recent-session scoping; tie-breaks).
- `services/engine/loadRecommendation.js` (new, pure): `recommendWorkingLoad({ lastWeightKg, activeFlag, constants })` — FR-018 (add_load → last + `load_increment_{upper,lower}_kg`; else hold; null when no history).
- `services/engine/oneRepMax.js` (existing): a new unit test pins that the detail-page 1RM equals `oneRepMax({ weight, reps }).primary_estimate_kg` fed by `heaviestCompletedSet` (FR-017, clarification Q1).
- `services/trainingProgram/dayView.js` + `weekView.js` + `exerciseView.js` (new, pure presenters): unit tests assert correct assembly + empty-state shapes from synthetic DAO output, with **no** I/O.
- Integration: `exercise_alternatives` CRUD + self-link/duplicate rejection (FR-023) + cascade-cleanup when an alternative is deleted (edge case); media upload happy path + oversize/unsupported rejection preserving prior media (FR-024); RLS isolation for `exercise_alternatives`.
- Contract: every new `/api/v1/*` path in `contracts/openapi.yaml` via Supertest.
- Frontend smoke (RTL + jsdom): week view renders cards + rest separators from a stub schedule; day view renders ordered rows + empty history state; exercise detail renders static content + history empty states; media/alternative edit controls render and call their endpoints.

**Target Platform**: Local dev on macOS/Linux today; future deploy to a hosted Node container behind a Vite static bundle. No new platform requirements.

**Project Type**: Web application — same layout as Phase 0–2 (`/routes`, `/controllers`, `/services`, `/middleware`, `/config`, `/frontend`). Phase 3 introduces one new pure service sub-directory `services/trainingProgram/` (view-model presenters) and two new engine helpers under the existing `services/engine/` boundary. All Supabase imports remain confined to `services/dataAccess/*` (Constitution II).

**Performance Goals** (from Success Criteria + Operational Standards):

- Weekly planning view first paint ≤ 1 s on the target laptop/mobile browser; reflects a schedule change within one reload (SC-002).
- Day detail assembly (schedule slot + exercises + last-weight + flags) ≤ 500 ms server-side; the per-exercise history read is a single indexed query over `session_sets (athlete_id, exercise_id)`.
- Exercise detail assembly (static + last-5 sessions + 1RM + load rec + alternatives) ≤ 700 ms server-side.
- Navigation week → exercise instructions in ≤ 2 taps (SC-007).
- Background number-crunching (1RM, load rec) stays off the UI thread — it runs server-side in pure functions (Operational Standards: performance).

**Constraints**:

- **Read-only on history** (FR-026): Phase 3 never writes `session_journal_entries` / `session_sets`; it only reads them. The new `sessions.dao.js` exposes read methods only.
- **No engine reinvention**: 1RM uses `services/engine/oneRepMax.js`; the progression indicator reads existing `progression_flags`; load recommendation reuses the Phase 1 `load_increment_*` constants via `resolveConstants`. No new formula is introduced under `services/engine/` beyond pure selection/recommendation glue.
- **Determinism**: all new engine/presenter functions are pure — explicit inputs, explicit outputs, no time/random/globals. "Most recent session" ordering is driven by `started_at` supplied by the DAO, not by reading the clock inside a pure function.
- **Tenant scoping** (Constitution I): `exercise_alternatives` carries `athlete_id NOT NULL` and ships RLS in its migration; every DAO call is parameterised by `req.athleteId`; no endpoint accepts an athlete id from the body.
- **Layering** (Constitution II): no `@supabase/supabase-js` import outside `services/dataAccess/*`; `services/trainingProgram/*` and `services/engine/*` take DAO output as injected data and never import the Supabase client. Dependency direction is one-way: `controllers → trainingProgram (+ engine) → dataAccess`.
- **Media handling**: upload size/type bounded by config (new `EXERCISE_MEDIA_MAX_BYTES`, `EXERCISE_MEDIA_IMAGE_TYPES`, `EXERCISE_MEDIA_VIDEO_TYPES` keys with documented defaults — Constitution III); rejected uploads preserve the existing media URL (FR-024). YouTube is referenced by URL only, never downloaded.
- **Archived exercises** stay viewable (edge case): list/detail endpoints accept an `include_archived`-style read and the day view marks archived rows rather than hiding them.

**Scale/Scope**: 1 athlete; 1 new table (`exercise_alternatives`); ~6 new/extended `/api/v1/` endpoints (program week, day detail, exercise detail, exercise alternatives add/remove, exercise media upload/clear); ~3 config keys; ~1,600 LOC backend (DAOs + presenters + engine helpers + controllers + routes + migration); ~1,700 LOC frontend (3 views + cards/badges + media + alternatives editor); ~1,800 LOC tests.

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

Reviewed against `.specify/memory/constitution.md` v1.1.1:

- **I. Multi-Tenant-Ready Data Model (NON-NEGOTIABLE)** — **PASS**. The new `exercise_alternatives` table carries `athlete_id NOT NULL` from migration day one and ships `exercise_alternatives_select_own` + `exercise_alternatives_modify_own` policies in the same SQL file, indirected through `athletes.auth_user_id = auth.uid()` per the established pattern. The read-only `sessions.dao.js` only reads existing tables (already RLS-protected) and is always parameterised by `req.athleteId`. No new endpoint trusts a caller-supplied tenant id.

- **II. Layered Architecture & Separation of Concerns** — **PASS**. Routes stay thin; controllers orchestrate; the new `services/trainingProgram/` presenters and `services/engine/` helpers are pure (no I/O, no globals); the new `sessions.dao.js` and `exerciseAlternatives.dao.js` are the only Phase 3 modules importing the Supabase client. The frontend reaches every surface through `/api/v1/` and never touches the secret key.

- **III. Configuration over Hardcoding (NON-NEGOTIABLE)** — **PASS**. Media size/type limits and the YouTube embed host are config-driven (new `config/schema.js` keys with defaults + `.env.example` entries); no athlete data, URLs, or limits are hardcoded in services. The `photoStorage` root continues to come from config. No new secret is introduced.

- **IV. Versioned API Contract** — **PASS**. All new endpoints live under `/api/v1/` (`contracts/openapi.yaml`), reuse the `{ data: ... }` success envelope and the Phase 0 canonical error envelope, and are additive within v1. Deletes/clears return 204. The exercise-detail response is a composed read model (additive), not a breaking change to the existing `/exercises` contract.

- **V. Test-First for Domain Logic (NON-NEGOTIABLE)** — **PASS**. Every number surfaced as a recommendation is produced by a pure function tested first: `exerciseHistory.js` (last weight, recent sessions selection), `loadRecommendation.js` (working-load rule), and the `oneRepMax` detail-feed invariant. The presenters in `services/trainingProgram/` are pure and unit-tested against synthetic DAO output. UI views are exempt from strict TDD but ship smoke tests (render + primary interaction) per Principle V.

- **VI. Athlete-First UX** — **PASS**. The three screens each answer a real pre/post-session question (what's this week / what do I do today / how do I do this exercise and what should I lift). Frontend goes through the Frontend Design skill on the existing Tailwind tokens; no ad-hoc CSS. Navigation week → exercise is ≤ 2 taps. Empty states are designed, not blank. (No journal/auto-save flow is introduced here — that is Phase 4 — so the one-handed/auto-save standards do not yet apply, but media controls use large hit targets consistent with the design system.)

**Post-design re-check (after Phase 1 artifacts of this plan)**: still **PASS** —

- `data-model.md` defines exactly one new table (`exercise_alternatives`) with `athlete_id` + RLS in the same migration, plus the read-only view models composed over existing tables; no new tenant-unscoped data.
- `contracts/openapi.yaml` keeps every path under `/api/v1/` with the `{ data }` / canonical-error envelopes; new fields are additive.
- The source layout keeps Supabase imports inside `services/dataAccess/*`, engine math inside `services/engine/*`, and view assembly inside the pure `services/trainingProgram/*`; no `models/` directory is added.
- Performance budgets hold: day/exercise assembly is a small bounded set of indexed reads (schedule slots, weekly_plan_exercises, exercises, one indexed `session_sets` read per exercise, active `progression_flags`), each measured in the tens of ms range in Phase 1/2.

No principle violations; no Complexity Tracking entries required.

## Project Structure

### Documentation (this feature)

```text
specs/006-training-program-library/
├── plan.md              # This file (/speckit-plan output)
├── spec.md              # Feature specification (clarified 2026-06-02)
├── research.md          # Phase 0 of plan — D-numbered decisions + rationale
├── data-model.md        # Phase 1 of plan — 1 new table + read view models
├── quickstart.md        # Phase 1 of plan — operator's guide to the 3 screens + flows
├── contracts/
│   └── openapi.yaml     # Phase 1 of plan — new /api/v1/* endpoints
├── checklists/
│   └── requirements.md  # From /speckit-specify (passing)
└── tasks.md             # Created later by /speckit-tasks (NOT this command)
```

### Source Code (repository root)

Phase 3 extends the Phase 0–2 layout. **Bold** = new in Phase 3; everything else already exists.

```text
masslab/
├── routes/
│   ├── exercises.routes.js              # extended: media upload/clear + alternatives sub-routes
│   └── trainingProgram.routes.js        # NEW: /program/week, /program/day/:dayOfWeek, /program/exercises/:id
├── controllers/
│   ├── exercises.controller.js          # extended: uploadMedia, clearMedia, addAlternative, removeAlternative
│   └── trainingProgram.controller.js    # NEW
├── services/
│   ├── engine/
│   │   ├── exerciseHistory.js           # NEW pure: heaviestCompletedSet, lastWeightUsed, recentSessions
│   │   ├── loadRecommendation.js        # NEW pure: recommendWorkingLoad
│   │   └── oneRepMax.js                 # reused (new detail-feed unit test)
│   ├── trainingProgram/                 # NEW pure presenter boundary
│   │   ├── weekView.js                  # assemble week cards + rest separators from schedule
│   │   ├── dayView.js                   # ordered exercises + last weight + flag indicator
│   │   └── exerciseView.js              # static + history + 1RM + load rec + alternatives
│   ├── dataAccess/
│   │   ├── sessions.dao.js              # NEW read-only reader of session_journal_entries + session_sets
│   │   ├── exerciseAlternatives.dao.js  # NEW
│   │   ├── exercises.dao.js             # extended: setMedia / clearMedia helpers
│   │   ├── weeklyPlan.dao.js            # reused (slots + weekly_plan_exercises reads)
│   │   ├── progressionFlags.dao.js      # reused (active flag per exercise)
│   │   └── muscleGroups.dao.js          # reused
│   └── photoStorage/                    # reused (put/get/delete/url) for exercise media
├── config/
│   └── schema.js                        # extended: EXERCISE_MEDIA_MAX_BYTES + type allowlists + youtube host
├── supabase/migrations/
│   └── <ts>_init_exercise_alternatives.sql   # NEW
├── seed/
│   └── exercises.seed.json              # optionally extended: a few alternative links + sample media
└── frontend/src/
    ├── pages/program/
    │   ├── ProgramWeek.jsx              # NEW /program
    │   ├── ProgramDay.jsx               # NEW /program/day/:dayOfWeek
    │   └── ExerciseDetail.jsx           # NEW /program/exercises/:id
    ├── components/
    │   ├── DayCard.jsx / RestSeparator.jsx / ProgressionBadge.jsx   # NEW
    │   ├── ExerciseMediaEditor.jsx / AlternativesEditor.jsx          # NEW
    │   └── (reuse existing NumberField, ConfirmDialog, design tokens)
    └── App.jsx                          # extended: /program route tree
```

**Structure Decision**: Web application, identical top-level layout to Phase 0–2. The one architectural addition is the pure `services/trainingProgram/` presenter boundary, which exists so controllers stay thin and the view-assembly logic (which composes DAO reads + engine numbers + empty-state rules) is unit-testable without I/O. The first read-only `sessions.dao.js` is introduced here and will be shared with (not owned by) Phase 4's journal write path.

## Complexity Tracking

> No Constitution Check violations. No entries required.

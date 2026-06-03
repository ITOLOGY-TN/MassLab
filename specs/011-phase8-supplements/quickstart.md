# Phase 8 Quickstart — Supplements

**Feature**: `011-phase8-supplements` · **Date**: 2026-06-03

An operator's guide to the four supplement surfaces, how to bring them up locally, and how to verify them. Phase 8 is **write-heavy**: it ships **2 migrations / 2 new tables** and reuses the existing seeded `supplements` catalogue read-only.

## What ships

| Surface | Route | Backed by |
|---------|-------|-----------|
| Daily checklist (5 cards, one-tap toggle, per-supplement streak, creatine hero) | `/supplements` | `GET /api/v1/supplements/checklist`, `POST /api/v1/supplements/intake` |
| Weekly grid (7 days × N supplements, taken/missed/upcoming) | `/supplements` (below the cards) | `GET /api/v1/supplements/grid` |
| Weekly self-assessment (energy/recovery/sleep/strength, 1–5) | `/supplements` (form) | `GET /api/v1/supplements/assessments`, `PUT /api/v1/supplements/assessment` |
| Assessment trend (4 lines over recent weeks) | `/supplements/trends` | `GET /api/v1/supplements/assessments` |

## Prerequisites

1. **Apply the migrations** (required — contract/integration tests skip until applied):
   - `supabase/migrations/20260603000004_init_supplement_intake_log.sql`
   - `supabase/migrations/20260603000005_init_supplement_weekly_assessment.sql`

   Apply via your Supabase workflow (cloud project is the default; local CLI stack is the offline fallback — see the memory note on backend Supabase). Both ship their `*_own` RLS in-file.

2. **Seed is already in place**: the five supplements are seeded per athlete by `seed/runSeed.js` (Phase 0). Phase 8 adds **no new seed** — adherence starts empty and is created by the athlete.

3. **Config** (optional — safe defaults): add to `.env` / `.env.example` only if overriding:
   - `SUPPLEMENT_PRIMARY_SLUG=creatine-monohydrate`
   - `SUPPLEMENT_ASSESSMENT_TREND_WEEKS=12`

## Bring it up

```bash
npm install          # no new dependency in Phase 8
npm start            # API on $PORT
# in another shell:
cd frontend && npm run dev
```

Open `/supplements`.

## Smoke walk-through (matches the spec's user stories)

1. **US1 — check off today** (`POST /supplements/intake`): tap a card → it shows taken; tap again → not taken. Reload → state persists. Tapping the same card twice never creates a second record (idempotent, SC-002).
2. **US2 — streaks** (`GET /supplements/checklist`): with a few consecutive taken days, the card's streak counter equals the run ending today; the creatine card is rendered most prominently. A fully-elapsed missed day resets that supplement's streak; today not-yet-taken does **not** break it. Streaks never count days before `program_start_date`.
3. **US3 — weekly grid** (`GET /supplements/grid`): the grid shows taken (logged), missed (elapsed, no record), upcoming (today not-yet-taken + future days). Navigate to a prior week (read-only) or a future week (all upcoming).
4. **US4 — weekly self-assessment** (`PUT /supplements/assessment`, `GET /supplements/assessments`): rate the four dimensions 1–5 and save; re-saving updates in place (one row per ISO week). `/supplements/trends` plots the four dimensions chronologically. Empty state renders cleanly with no data.

## Editable-window rules (from the 2026-06-03 clarifications)

- **Intake is editable for the current ISO week only** (Monday–Sunday). Toggling a day in a prior week → `422 OUTSIDE_EDIT_WINDOW`; a future day → `422 FUTURE_DATE`. Prior weeks stay visible in the grid but immutable.
- **Self-assessment edits target the current ISO week only** — the server derives the week from its clock; the client cannot write another week, so elapsed weeks are read-only history.
- **Weeks are ISO weeks** (Monday start), consistent with the rest of the app.

## Verify with tests

```bash
npm test -- supplementStreaks          # streak math: today-not-taken, gap reset, program-start anchor, never-taken=0
npm test -- supplementGrid             # cell status: taken/missed/upcoming incl. future-as-upcoming
npm test -- supplements                # presenters + contract (skips live tests until migrations applied)
```

- **Unit (pure, test-first)**: `supplementStreaks`, `supplementGrid`, `week` helpers, and the three presenters — no I/O, synthetic inputs.
- **Contract**: every `/api/v1/supplements/*` path; **probes for `supplement_intake_log` and skips until the migration is applied** (Phase 4/7 pattern).
- **Integration**: toggle on/off + idempotency; current-week-only + future-date rejection (422); streak across a sequence; grid statuses; assessment one-row-per-week + elapsed-week read-only; rating range (400); RLS probes on both new tables; cleans up in `try/finally`.
- **Frontend smoke**: toggle → taken + streak; creatine prominence; grid renders; assessment save; trend renders; empty states.

## Boundaries (what Phase 8 does NOT do)

- Does **not** edit the supplements catalogue (add/remove/rename/reorder) — Phase 2 Settings.
- Does **not** run any calculator/progression engine and does **not** write `calculation_results` — adherence is recording, not calculation (FR-020).
- Does **not** surface streaks on the dashboard (Phase 10) or in global statistics (Phase 11).
- Is **not** the Phase 9 daily recovery check-in — the weekly four-dimension self-assessment is a distinct, supplement-adjacent surface.

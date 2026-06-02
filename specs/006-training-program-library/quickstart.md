# Quickstart — Phase 3: Training Program & Exercise Library

**Feature**: `006-training-program-library` | **Date**: 2026-06-02

This is the operator's / developer's guide to what Phase 3 adds and how to exercise it. It assumes Phase 0–2 are in place (schedule configured, exercises seeded, calculator engine + progression flags available).

---

## What ships

| Surface | Route | Type |
| ------- | ----- | ---- |
| Weekly planning view | `GET /api/v1/program/week` → frontend `/program` | read-only composed |
| Day detail | `GET /api/v1/program/day/:dayOfWeek` → frontend `/program/day/:d` | read-only composed |
| Exercise detail | `GET /api/v1/program/exercises/:id` → frontend `/program/exercises/:id` | read-only composed |
| Exercise image upload/clear | `POST`/`DELETE /api/v1/exercises/:id/media/image` | mutating |
| Exercise video set/clear | `POST`/`DELETE /api/v1/exercises/:id/media/video` | mutating |
| Alternatives list/add/remove | `GET`/`POST /api/v1/exercises/:id/alternatives`, `DELETE …/:altId` | mutating |

One new migration (`exercise_alternatives`), three new config keys, no new runtime dependency.

---

## 1. Apply the migration

```bash
# Against the cloud project or the local CLI stack
supabase db push          # or: psql "$SUPABASE_DB_URL" -f supabase/migrations/<ts>_init_exercise_alternatives.sql
```

Verify the table + RLS exist:

```sql
select tablename from pg_tables where tablename = 'exercise_alternatives';
select polname from pg_policies where tablename = 'exercise_alternatives';  -- expect *_select_own, *_modify_own
```

## 2. Add the config keys

Append to `.env` (and `.env.example` documents them, no real values):

```dotenv
EXERCISE_MEDIA_MAX_BYTES=26214400
EXERCISE_MEDIA_IMAGE_TYPES=image/jpeg,image/png,image/webp
EXERCISE_MEDIA_VIDEO_TYPES=video/mp4,video/webm
```

All three have defaults in `config/schema.js`, so the app boots without them; set them to override.

## 3. Browse the week (read path)

```bash
curl -s localhost:3000/api/v1/program/week | jq '.data.days[] | {day_of_week, kind, mg: .muscle_group.name, n: .exercise_count}'
```

Expected (default 5-day split): five `training` entries with muscle group + count, two `rest` entries. With zero training days configured, `.data.empty == true`.

```bash
# A single day
curl -s localhost:3000/api/v1/program/day/1 | jq '.data.exercises[] | {name, position, last_weight_kg, progression}'
```

Before Phase 4 logs any sessions, `last_weight_kg` is `null` and `progression` is `stable` (empty state) — this is correct, not a bug.

```bash
# Exercise detail
curl -s localhost:3000/api/v1/program/exercises/101 | jq '{name, alts: .data.alternatives, hist: .data.history.has_history, e1rm: .data.history.estimated_1rm_kg}'
```

## 4. Enrich an exercise (mutating path)

```bash
# Image upload
curl -s -X POST localhost:3000/api/v1/exercises/101/media/image -F file=@bench.jpg | jq .data

# YouTube video by URL
curl -s -X POST localhost:3000/api/v1/exercises/101/media/video \
  -H 'content-type: application/json' \
  -d '{"video_url":"https://www.youtube.com/watch?v=rT7DgCr-3pg"}' | jq .data.video
# → { "kind": "youtube", "url": "https://www.youtube-nocookie.com/embed/rT7DgCr-3pg" }

# Local video upload (alternative to URL)
curl -s -X POST localhost:3000/api/v1/exercises/101/media/video -F file=@bench.mp4 | jq .data.video

# Link an alternative
curl -s -X POST localhost:3000/api/v1/exercises/101/alternatives \
  -H 'content-type: application/json' -d '{"alternative_exercise_id":145}' | jq .data

# Self-link → 409 SELF_LINK_FORBIDDEN
curl -s -X POST localhost:3000/api/v1/exercises/101/alternatives \
  -H 'content-type: application/json' -d '{"alternative_exercise_id":101}' | jq .error.code

# Duplicate → 409 CONFLICT
# Oversize/wrong-type upload → 413 / 415, and the previous media is preserved
```

## 5. Frontend

```bash
cd frontend && npm run dev    # Vite dev server proxies /api to :3000
```

Navigate to `/program`:

- **Week** → tap a day card → **Day detail** → tap an exercise row → **Exercise detail**. (≤ 2 taps from week to instructions, SC-007.)
- Rest days render as compact separators, not cards.
- On the exercise detail page, the media editor and alternatives editor let you attach/clear an image, set a YouTube link or upload a video, and link/unlink alternatives.

---

## How to verify the key behaviors

| Behavior | How to check |
| -------- | ------------ |
| Schedule change reflects (SC-002) | Change days in `/settings/schedule`, reload `/program` → cards/separators match |
| Empty history empty states (SC-004) | With no sessions, every exercise detail still renders static content; history sections show empty states |
| Day/detail consistency (SC-003) | Once sessions exist, `last_weight_kg` on the day row == the heaviest completed set feeding `estimated_1rm_kg` on the detail page |
| Self/duplicate link rejection (SC-006) | The two curl calls above return 409 |
| Upload guard (SC-006) | Post a >limit file or a `.txt` → 413/415, prior media unchanged |
| Archived alternative (D-7) | Soft-delete an exercise that is an alternative → it still lists with an archived marker, no broken link |

---

## Test commands

```bash
npm test                                   # full suite (unit + integration + contract + frontend)
npx vitest run tests/unit/engine.exerciseHistory.test.js
npx vitest run tests/unit/engine.loadRecommendation.test.js
npx vitest run tests/unit/trainingProgram.dayView.test.js
npx vitest run tests/contract/program.contract.test.js
```

Integration tests that hit Supabase auto-skip when `.env` is missing or the project is unreachable (offline fallback).

---

## Boundaries (what Phase 3 does NOT do)

- Does **not** capture sessions, sets, weights, or RPE — that is Phase 4 (Session Journal). Phase 3 only reads them.
- Does **not** recompute progression — it reads the active `progression_flags` written by the Phase 1 engine.
- Does **not** introduce a new 1RM formula — it surfaces the engine's existing `primary_estimate_kg`.
- Does **not** rebuild schedule configuration — it consumes Phase 2's `/me/schedule`.

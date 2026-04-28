# MassLab — Project Roadmap

## Executive Summary

MassLab is a local web application for tracking a 5-month muscle-building program. Built with Node.js + Express + SQLite + Vanilla JS. Runs 100% offline at http://localhost:3000. No login required — single user for now.

The app currently serves one athlete: 29 years old, 173cm, 58kg, ectomorph, intermediate lifter, 5 sessions/week, goal of +6 to +8kg of muscle in 5 months. Every screen must answer a real question the athlete has before, during, or after a session.

**Design:**  Use the **Frontend Design skill** for all UI work — the result must feel premium and sport-focused, never generic.

**Architecture philosophy — built to scale:** The app is local-first today, but the architecture must be written as if it will go online tomorrow and serve multiple users. This is non-negotiable. The future vision is a SaaS platform where any user can sign up, enter their personal data (age, weight, morphotype, goals, schedule, equipment), and receive a fully generated program (training, nutrition, supplements, recovery) tailored to their profile — exactly like the one built for the current athlete. Every architectural decision made now must support that future without a full rewrite.

---

## Phase 0: Foundation

Set up the full project structure, database schema, and seed all initial data so every subsequent phase has something real to work with.

**Architecture constraints — mandatory, not optional:**
- **Every database table must have an `athlete_id` foreign key** from day one — even in single-user mode. Data is never global. This is the single most important decision for future multi-user support.
- **Authentication layer stubbed in** — even if no login screen exists yet, the middleware slot must exist and be bypassable via a config flag (`SINGLE_USER_MODE=true` in `.env`). When multi-user is needed, only that flag changes and the middleware activates.
- **All business logic in controllers/services, never in routes** — routes are thin, just HTTP. This makes the API reusable for a future mobile app or third-party client.
- **Program generation logic isolated in a `/services/programGenerator.js` module** — takes an athlete profile object as input, returns a complete program (training plan, nutrition targets, supplement stack, recovery guidelines). Currently called once with the hardcoded athlete profile, but designed to be called for any profile. This is the core engine of the future SaaS.
- **Environment-based config** — database path, port, and feature flags come from `.env`, never hardcoded. Makes the switch from local SQLite to PostgreSQL (for cloud hosting) a configuration change, not a code change.
- **No hardcoded athlete data anywhere in the codebase** — the current athlete's data lives in the database seed only, injected through the program generator.

**What gets built in this phase:**
- Node.js + Express server, strict MVC architecture with a service layer (`/routes`, `/controllers`, `/services`, `/models`, `/public`, `/data`)
- All API routes under `/api/v1/`
- Complete database schema with `athlete_id` on every relevant table: athlete profiles, exercises, weekly plan, training phases, session journal, sets logged, body weight, measurements, nutrition log, food database, supplements, recovery log, app config, quotes
- `.env` file with `SINGLE_USER_MODE=true`, `PORT=3000`, `DB_PATH=./data/masslab.db`
- Single-user bypass middleware (reads `SINGLE_USER_MODE` and auto-injects athlete ID 1 on every request)
- `/services/programGenerator.js` — takes athlete profile, returns full program structure. Seeded with the current athlete's program as the first generated plan.
- Seed data on first launch: full exercise library (18+ exercises with instructions), 5-day weekly plan, 3 training phases with parameters, 5-meal daily nutrition plan, 5 supplements with dosage and timing, 50 common foods with macros, 30 motivational quotes in French
- `npm install && npm start` must work immediately after this phase

---

---

---

## Phase 1: Calculators Engine

The scientific backbone of the entire app. These calculators feed directly into the program generator (`/services/programGenerator.js`) and must be implemented as reusable service functions — not just UI widgets. Every result they produce is stored in the athlete profile and used across all other modules (nutrition targets, session parameters, progression thresholds).

**1. BMR — Basal Metabolic Rate**
- Formula: Mifflin-St Jeor (most accurate for general population)
  - Men: `(10 × weight_kg) + (6.25 × height_cm) − (5 × age) + 5`
  - Women: `(10 × weight_kg) + (6.25 × height_cm) − (5 × age) − 161`
- Inputs: weight (kg), height (cm), age, biological sex
- Output: kcal/day at complete rest

**2. TDEE — Total Daily Energy Expenditure**
- Formula: `BMR × activity multiplier`
- Activity levels selectable by the athlete:
  - Sedentary (desk job, no exercise): × 1.2
  - Lightly active (1–3 sessions/week): × 1.375
  - Moderately active (3–5 sessions/week): × 1.55 ← default for current athlete
  - Very active (6–7 sessions/week): × 1.725
  - Extremely active (physical job + daily training): × 1.9
- Output: maintenance calories
- **For muscle gain (bulk):** TDEE + 300 to 500 kcal surplus (configurable, default +400)
- Calorie target stored in athlete profile and used as the goal in the Nutrition module

**3. Macronutrient Calculator**
- Calculated from total calorie target, adjusted by goal (bulk / cut / maintain) and morphotype:
  - Protein: 2.2g × lean body mass (kg) — prioritized first, never compromised
  - Fat: minimum 25% of total calories for hormonal health
  - Carbohydrates: remaining calories after protein and fat are set
- Morphotype adjustment:
  - Ectomorph: carbs pushed higher (up to 55% of calories) to support fast metabolism
  - Endomorph: fat slightly higher, carbs moderately lower
  - Mesomorph: balanced split
- Outputs: daily targets for protein (g), carbs (g), fat (g) — stored in athlete profile, used as goals in the Nutrition module

**4. One-Rep Max (1RM) Calculator**
- Multiple formulas calculated and displayed side by side, averaged into one result:
  - Epley: `weight × (1 + reps / 30)`
  - Brzycki: `weight × (36 / (37 − reps))`
  - Lander: `(100 × weight) / (101.3 − 2.67123 × reps)`
  - Lombardi: `weight × reps^0.10`
- Inputs: weight lifted (kg), reps performed — warn if reps > 10 (accuracy degrades)
- Output: estimated 1RM in kg, linkable to any exercise in the library
- Auto-generated training percentage table: recommended working weight at 60% / 70% / 75% / 80% / 85% / 90% of 1RM with corresponding rep ranges
- Used automatically in Phase 4 (Load Tracking) after every logged session

**5. Progressive Overload Rule Engine**
- Runs automatically in the background after every logged session — not a manual calculator:
  - **Double progression:** all sets completed at top of rep range for 2 consecutive sessions → flag exercise as "ready to add load" (+2.5 kg upper body / +5 kg lower body, configurable)
  - **Volume stagnation:** weekly volume per muscle group (sets × reps × load) unchanged for 3 weeks → flag stagnation
  - **Deload detection:** average RPE ≥ 9 across a full week, or 2+ exercises regressing → suggest deload week (volume −30%, intensity maintained)
  - **Monthly trend:** calculates % increase in estimated 1RM per exercise month over month — used in the Statistics module to show if the athlete is on pace for their goal
- All flags surface as smart alerts on the Dashboard (Phase 2) and in the Load Tracking module (Phase 5)

**6. Body Composition Estimator**
- Estimates body fat % from available measurements using the US Navy formula (if waist + neck + height available) or a BMI-based fallback
- Derives lean body mass (kg) — used by the Macronutrient Calculator to set protein targets more precisely
- Recalculated automatically every time a new weight or measurement entry is logged

**7. Program Auto-Generator (ties all calculators together)**
- Lives in `/services/programGenerator.js`
- Inputs: complete athlete profile (age, sex, weight, height, morphotype, goal, activity level, sessions per week, available equipment, any injuries)
- Process: runs BMR → TDEE → macros → estimates initial 1RM ranges per exercise category based on experience level → selects appropriate training split → sets phase parameters
- Output: complete ready-to-use program (training plan, daily calorie + macro targets, supplement recommendations, recovery guidelines)
- Called once for the current athlete during seed. In future multi-user mode, called on every new user signup or profile update.

**Implementation requirement:** all calculator logic lives in pure stateless functions inside `/services/calculators.js` — no side effects, fully testable. The UI exposes a "Calculators" section where the athlete can run any calculator manually and see live results. The same functions are called internally by the program generator.

---

## Phase 2: Settings & Data Management

- Edit athlete profile (name, age, height, starting weight, program start date, target weight)
- **Weekly schedule configuration**: choose number of training days (1–7), assign which days of the week are active, assign a muscle group to each active day — changes apply immediately across the whole app
- App preferences: light/dark theme toggle, rest timer sounds on/off, kg/lbs units, custom nutrition targets
- Exercise manager: add, edit, delete exercises and reorganize the weekly plan
- Data export: full JSON backup, CSV of sessions only
- Data import: restore from JSON backup
- Selective reset per module or full reset with double confirmation

---

## Phase 3: Training Program & Exercise Library

Browse the full program and consult each exercise in detail.

- The weekly schedule is fully dynamic: the athlete chooses how many training days per week (default: 5) and which days of the week are active vs rest — configurable from Settings at any time. The app adapts all logic that depends on the schedule (today's session auto-detection, dashboard alerts, streak counting, attendance heatmap) to whatever configuration is set.
- Weekly planning view: shows only the configured training days as cards (e.g. Mon / Tue / Wed / Fri / Sat), each with muscle group, color badge, and exercise count. Rest days appear as a compact visual separator, not a full card.
- Each training slot is assignable: the athlete picks which muscle group goes on which day. Pre-loaded with the default 5-day split (Chest+Triceps / Back+Biceps / Legs Quads / Shoulders+Traps / Legs Hams+Glutes) but fully editable — muscle groups can be swapped, merged, or renamed.
- Day detail view: ordered exercise list with last weight used and progression indicator (ready to increase / stable / regressing)
- Exercise detail page: name, targeted muscles, step-by-step instructions, key technique points, image (uploadable), YouTube embed or local video upload, alternative exercises, last 5 sessions with this exercise, current load recommendation and estimated 1RM (Epley formula)

---

---

## Phase 4: Session Journal

The most-used screen. Must work fast with one hand during a workout.

- Auto-detects today's session based on the athlete's configured weekly schedule (not a hardcoded 7-day map)
- Live session timer running at the top
- One exercise at a time with previous weight shown and suggested target weight
- Per-set input: weight (kg) with +2.5 / -2.5 quick buttons, reps with +1 / -1, optional RPE 1–10, completion checkbox
- Rest timer: auto-starts on set completion, countdown based on current phase (90s / 120s / 150s), audio beep at 10s and 0s via Web Audio API
- Auto-save every 30 seconds
- Post-session summary: total duration, total volume lifted, top performance, new PRs detected, general note, energy rating 1–5

---

---

## Phase 5: Load Tracking & Progression Algorithm

The expert muscle-building module. Tells the athlete exactly when to add weight.

- Overview table: every exercise with current load, all-time record, last session volume, trend, and progression status
- Progression status logic:
  - 🟢 "Add +2.5 kg" — completed all sets at max reps in 2 consecutive sessions
  - 🟡 "Maintain" — normal progression
  - 🟠 "Stagnation" — no progress for 3 weeks
  - 🔴 "Regression" — load lower than 2 weeks ago
- Per-exercise detail: load over time chart (line), volume per session chart (bars), last 10 sessions table, estimated 1RM, 8-week projection (dotted line), all-time record annotation
- Phase comparison radar chart: average load per muscle group across phases

---

---

## Phase 6: Body Weight & Measurements

Track the full physical transformation.

- Morning weigh-in form: weight, optional measurements (arm, chest, thighs, shoulders, waist), note, photo upload
- Main chart: 5-month weight curve with ideal progression zone, goal line, phase markers, and milestone annotations
- Monthly measurements table with color-coded deltas vs previous month
- Photo gallery: grid by date with weight overlay, full-screen view, side-by-side before/after comparison

---

---

## Phase 7: Nutrition & Calories

Daily food log with automatic macro calculation.

- 4 live progress bars at the top: calories (3300 kcal), protein (175g), carbs (430g), fat (90g)
- 5 meal slots (breakfast, lunch, pre-workout snack, dinner, evening snack) with food search and gram-based input
- "Load daily plan" button to pre-fill with the program's template meal plan
- Hydration tracker: goal 3L/day, quick-add buttons (+250ml, +500ml, +1L), circular gauge
- Trend charts: calories over 30 days with goal line, daily macro breakdown pie, weekly protein trend

---

---

## Phase 8: Supplements

Daily checklist with streak tracking.

- 5 supplement cards: Creatine 5g, Serious Mass, Vitamin D3, Magnesium, Omega-3 — each with toggle, recommended time, and individual streak counter
- Creatine streak displayed prominently (most critical supplement)
- Weekly grid: 7 days × 5 supplements, color-coded (taken / missed / upcoming)
- Weekly self-assessment: energy, recovery, sleep quality, strength — rated 1–5 with trend chart

---

---

## Phase 9: Recovery & Wellbeing

30-second daily check-in with smart analysis.

- Daily form: sleep quality (stars), hours slept (slider), stress level (slider), energy level (slider), mood (emoji picker), sore muscle zones (clickable SVG body diagram)
- Smart contextual alerts based on patterns: high cortisol warning, reduced session volume recommendation, full rest suggestion
- Charts: monthly energy heatmap calendar, sleep vs performance scatter plot, 30-day overlapping curves (energy, stress, sleep)

---

---

## Phase 10: Dashboard

The home screen. Gives the athlete a complete picture of their day in one glance.

- Today's session card: muscle group, first 3 exercises, CTA button to start the session
- 4 quick metric cards: current weight vs start, yesterday's calories vs target (3300 kcal), consecutive session streak, current phase with days remaining
- 30-day weight sparkline with goal line
- Smart alerts (max 3 at a time): ready to increase load on an exercise, calorie deficit detected, no session in X days, creatine streak broken, low sleep + high stress detected
- Quote of the day (rotates daily)
- Compact 7-day week overview with session done / to do / rest indicators

---

---

## Phase 11: Statistics & Global Progress

Full transformation overview with PDF export.

- Key metric cards: total weight gained, total volume lifted since start, session completion rate, average weekly calories
- Tabs: Body (weight + measurements curves), Strength (top 5 exercise progressions, volume per week, muscle group radar), Attendance (GitHub-style contribution heatmap), Nutrition (weekly calorie trends), Recovery (sleep averages, stress vs weight correlation)
- Monthly PDF report export using jsPDF: summary stats, top 3 load progressions, weight chart screenshot, auto-generated recommendations for next month
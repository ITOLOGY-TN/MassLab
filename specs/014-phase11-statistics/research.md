# Phase 0 Research — Phase 11: Statistics & Global Progress

Resolves the design unknowns for a **read-only analytics + reporting** layer. Format per decision: **Decision / Rationale / Alternatives considered**. There were no open `NEEDS CLARIFICATION` markers from the spec (the three computed-chart ambiguities were resolved in the 2026-06-06 clarification session and are reflected in D-4/D-5/D-6).

---

## D-1 — Boundary: read-only aggregation + on-demand report, no persistence, no engine, no AI

**Decision**: Phase 11 ships **0 migrations, 0 new tables, 0 new DAO**. It adds composed read endpoints under `/api/v1/statistics` that fan out existing athlete-scoped reads and hand plain data to pure presenters. It **never writes**, **never re-runs** the calculators/progression engine/`programGenerator`, writes **no** `calculation_results`/`auditWriter`, and contains **no AI**. The PDF report is generated **client-side on demand and downloaded** — it persists nothing.

**Rationale**: Identical in spirit to Phase 5 (load-tracking) and Phase 10 (dashboard): statistics surface numbers other modules already own, so re-deriving or persisting them would duplicate authority and risk drift. The Constitution's AI boundary (FR-020, Governance) holds through Phase 11; "auto-generated recommendations" must therefore be deterministic. A GET that changes no row counts is verifiable (SC-011).

**Alternatives considered**: (a) A materialized `statistics_snapshot` table refreshed on write — rejected: adds persistence, cache-invalidation, and a write path for a view that is cheap to compose on read for one athlete. (b) Server-side PDF rendering (headless browser) — rejected as heavier infra; PLAN names jsPDF (a frontend lib), so client-side assembly is the intended path (D-10).

## D-2 — Surface existing module outputs; only six pieces are genuinely new

**Decision**: Map each tab/metric to an existing reader/chart and re-derive nothing a module already owns. The genuinely new derived logic is exactly six pure helpers: the four headline metrics, the abs-kg progression ranking, the muscle-group progress %, the attendance grading, the stress-weight pairing, and the report recommendations.

| Surface | Source (reused) |
| --- | --- |
| Weight curve + goal (Body) | `bodyTracking/weightChartView.js#build` |
| Measurement curves (Body) | `bodyMeasurements.dao` + `engine/measurementDeltas.js` |
| Progression series (Strength) | `oneRepMaxRecords.dao#seriesForAthlete` (working weight = `source_weight_kg`) → **new** `exerciseImprovements.js` ranks |
| Weekly volume (Strength) | `sessions.dao#dailyTrainingVolumes` → ISO-week sum via `supplements/week.js` |
| Muscle-group radar (Strength) | exercise→group map (`exercises.dao`+`muscleGroups.dao`, as `phaseRadarView` does) → **new** `muscleGroupProgress.js` |
| Attendance heatmap | `sessions.dao#dailyTrainingVolumes` → **new** `attendanceHeatmap.js` grades |
| Nutrition weekly trend | `nutritionLogs.dao` + `engine/nutritionTrends.js#caloriesByDay` + `nutrition/targets.js#resolveTargets` |
| Recovery sleep avg + stress/weight | `recovery.dao` + `body_measurements` → **new** `stressWeightSeries.js`; sleep averaging from check-ins |
| Headline metrics | **new** `statisticsMetrics.js` over the above DAOs |
| Report recommendations | `progressionFlags.dao` + nutrition/recovery signals → **new** `reportRecommendations.js` |

**Rationale**: Maximizes reuse, keeps authoritative computations in their owning modules, and confines new, test-first logic to a small, well-bounded surface.

**Alternatives considered**: Re-computing e1RM/targets/series inside statistics — rejected (duplication + drift risk; violates "surface, don't re-derive").

## D-3 — Endpoint shape: one composed overview + one month-scoped report

**Decision**: Two additive GETs.
- `GET /api/v1/statistics` → `{ data: { metrics, body, strength, attendance, nutrition, recovery } }` — the whole screen in one parallel-fan-out fetch (Phase 10 pattern).
- `GET /api/v1/statistics/report?month=YYYY-MM` → `{ data: { period, summary, lifetime, topProgressions, weightSeries, recommendations } }` — month-scoped; `month` optional, defaulting to the **most recently completed calendar month**.

**Rationale**: The screen is conceptually one transformation view, so a single composed read keeps the client simple and renders all tabs from one payload (read-only, single athlete → size is fine). The report is parameterised by month and feeds the client-side PDF, so it is a separate, cacheable resource. "Since start" anchors on `program_start_date` (D-12).

**Alternatives considered**: Per-tab endpoints (Phase 5 load-tracking had three) — viable but unnecessary here since the tabs share the same fan-out and there is no heavy per-tab cost for one athlete; one fetch is simpler and avoids waterfalls. A single endpoint that also returns the report — rejected: the report is month-parameterised and should not bloat the default screen load.

## D-4 — Top-N progressions ranked by absolute working-weight gain (kg) (clarification)

**Decision**: "Most-improved" = largest **absolute increase in working weight (kg)** since `program_start_date`. For each exercise, the working-weight series is `one_rep_max_records.source_weight_kg` over time (= heaviest completed working set per finished session, per the Phase 5 doc); the improvement = `latest − earliest` within the program window. The Strength tab shows the top `STATISTICS_TOP_EXERCISES` (5); the report shows the top `STATISTICS_REPORT_TOP_PROGRESSIONS` (3). The trend lines plot the same working-weight series. Fewer qualifiers → a shorter list.

**Rationale**: Chosen in the 2026-06-06 clarification. `source_weight_kg` is already the persisted per-session working load (Phase 5 D-1), so the metric is reusable and consistent with what the athlete actually lifted. Absolute kg is the most concrete "I added weight to the bar" read.

**Alternatives considered**: e1RM gain (`primary_estimate_kg`), % gain, or volume gain — all rejected in the clarification (recorded in spec). e1RM remains available as the series if a future change wants it.

## D-5 — Muscle-group radar = progress % per group, now vs start (clarification)

**Decision**: Each radar axis is the **relative strength progress (%)** for a muscle group: aggregate the group's exercises' working weight at the program-start window vs. the latest window and compute the % change. Exercise→group mapping reuses the `exercises.dao`/`muscleGroups.dao` map (as `loadTracking/phaseRadarView` builds it). A group with too few data points renders at the origin (0%), never a misleading value.

**Rationale**: Chosen in the 2026-06-06 clarification. A "global progress" screen should show where the athlete improved most/least, which a progress-% radar conveys directly; Phase 5's existing radar shows a current-load snapshot per phase, so this is a deliberately different, progress-oriented view.

**Alternatives considered**: Current strength/load per group (reuses Phase 5's metric) or total volume per group — rejected in the clarification (recorded in spec).

## D-6 — Attendance heatmap graded by daily training volume (clarification)

**Decision**: The contribution heatmap shades each day by a **graded intensity derived from that day's training volume** (GitHub-style). `sessions.dao#dailyTrainingVolumes(athleteId, { from: programStart, to: today })` gives per-day `total_volume_kg`; `attendanceHeatmap.js#gradeByVolume` maps each day to level `0…STATISTICS_HEATMAP_LEVELS` (4): `0` = no completed session (empty shade), `1…N` = quantile buckets of the nonzero volumes. Reuses `chartGeometry.calendarMonth` + the `CalendarHeatmap` component. Rest days and future days read as the empty shade, never "missed".

**Rationale**: Chosen in the 2026-06-06 clarification; matches PLAN's "GitHub-style contribution heatmap" and conveys effort, not mere presence. Quantile bucketing of nonzero volumes gives a stable gradient regardless of the athlete's absolute load.

**Alternatives considered**: Binary done/not-done (two shades) — rejected in the clarification (loses the gradient). Fixed kg thresholds — rejected: not portable across athletes/phases; quantiles self-scale.

## D-7 — Headline metric definitions

**Decision** (`statisticsMetrics.js`, pure, anchored on `program_start_date`):
- **Total weight gained** = latest body weight − `athletes.starting_weight_kg` (signed). `starting_weight_kg` is a NOT NULL profile column, so no fallback is needed; the result is `null` only when no body weight has been logged yet.
- **Total volume lifted since start** = Σ `total_volume_kg` over finished sessions since program start (`dailyTrainingVolumes` sum).
- **Session completion rate** = completed sessions ÷ scheduled training sessions elapsed since start, where the denominator counts configured training weekdays (`weekly_plan_slots.day_of_week`) elapsed in `[programStart, today]` and the numerator counts distinct days with a finished session. Rest days are not in the denominator; future scheduled days are not yet counted (retrospective-only "missed").
- **Average weekly calories** = mean of per-ISO-week kcal totals over the logged nutrition history (group `nutrition_logs` day totals by ISO week via `supplements/week.js`, mean the weekly sums).

**Rationale**: Each definition reuses an existing reader and the established "since start"/ISO-week conventions, so the metrics agree with the modules they summarize. Completion rate matches the Phase 10 streak's retrospective-only treatment of "missed".

**Alternatives considered**: Completion rate as completed ÷ all calendar days (ignores schedule) — rejected (misleading on rest days). Average weekly calories as a trailing-window mean — rejected: the headline is a lifetime figure; trends live in the Nutrition tab.

## D-8 — Nutrition tab: weekly calorie trend vs resolved target

**Decision**: `nutritionTrends.caloriesByDay` over the program window → aggregate to ISO weeks → plot weekly totals against the weekly target (`resolveTargets` daily kcal × 7) using the reused `LineChart`/`BarChart`. The target is the athlete's **resolved** per-athlete value, never a hardcoded figure.

**Rationale**: Reuses the Phase 7 trend engine and target resolver; consistent with how nutrition compares everywhere else.

**Alternatives considered**: Daily calories over 30 days (that is the Phase 7 trends screen) — rejected: the statistics view is program-long and weekly-grained.

## D-9 — Recovery tab: sleep averages + stress-vs-weight correlation

**Decision**: Sleep averages come from `recovery_log` check-ins (averaged over the program / per ISO week) rendered as a `LineChart`. The stress-vs-weight correlation pairs each day's recovery **stress** with the day's **body weight** via `stressWeightSeries.pairStressWeight({ checkins, weights, minPoints })`, emitting a point **only** when both exist (gaps are dropped, never `0` — mirrors Phase 9 scatter), rendered with the reused `ScatterPlot`. Below `STATISTICS_MIN_CORRELATION_POINTS` (3) paired points it shows an insufficient-data state instead of a misleading correlation.

**Rationale**: Reuses Phase 9's scatter component and its "point only when both signals exist" rule; the 3-point floor matches `trendProjection`'s existing minimum for a meaningful fit.

**Alternatives considered**: Computing a single Pearson r headline — optional enrichment, left out of the contract for now (the scatter is the spec'd deliverable); can be added non-breakingly. Energy/stress overlay (Phase 9 already owns it) — out of scope here.

## D-10 — Monthly PDF: client-side jsPDF over a report endpoint

**Decision**: The PDF is assembled **client-side** with `jspdf` (the one new dependency, named in PLAN). The frontend fetches `GET /api/v1/statistics/report?month=`, renders the existing SVG `LineChart` for the weight-progression chart, serializes that SVG → PNG using the browser's built-in canvas (`XMLSerializer` → `Blob`/`data:` → `Image` → `canvas.toDataURL`), and composes the document: summary + lifetime stats, top-three load progressions, the weight chart image, and the deterministic recommendations. Generation persists nothing (FR-021) and is off the request path.

**Rationale**: PLAN explicitly names jsPDF; client-side keeps the backend free of headless-browser infra and keeps the export a pure download. Reusing the existing SVG chart avoids a second rendering path and any `html2canvas` dependency.

**Alternatives considered**: `html2canvas` to snapshot the live DOM — rejected (extra dependency, fragile across layout). Server-side PDF (Puppeteer/`pdfkit`) — rejected (infra weight; contradicts PLAN's jsPDF choice).

## D-11 — Deterministic, rule-based recommendations (no AI)

**Decision**: `reportRecommendations.js` is a pure function mapping existing signals to a small, ordered set of advisory lines from fixed templated strings (via the `NUTRITION_LOCALE` localization seam):
- active `progression_flags` `add_load` → "increase load on {exercise}";
- `stagnation` (muscle group) → "add volume / vary stimulus for {group}";
- `regression` / deload signal → "consider a deload week";
- month avg calories below the resolved target → "raise daily intake toward {target}"; sustained surplus on track → maintain;
- recovery red flags (avg sleep ≤ `RECOVERY_SLEEP_LOW_HOURS` or avg stress ≥ `RECOVERY_STRESS_HIGH`) → "prioritize sleep / manage stress".
No AI, no free-form generation; every line traces to a deterministic signal (SC-009).

**Rationale**: Honors the Constitution AI boundary through Phase 11 while still giving the "recommendations for next month" PLAN asks for. Reusing existing flags/thresholds keeps the report consistent with the Dashboard/Load-tracking alerts.

**Alternatives considered**: An LLM-generated paragraph — rejected outright (Phase 12 concern; violates the AI boundary). A free-text notes field — rejected (not deterministic/testable).

## D-12 — Determinism, clock, and time conventions

**Decision**: All new engine/presenter functions are pure; the controller reads the clock **once** (`isoDay(now())` = server UTC day) and injects `asOf`. From `asOf` it derives the program window (`program_start_date` → today), ISO-week bucketing (reusing `supplements/week.js#isoWeekStart`/`weekDays`), and the report month boundaries (default = the most recently completed calendar month). No `Date.now()`/random/globals inside pure functions (mirrors Phase 6/7/8/9/10).

**Rationale**: Determinism makes every number unit-testable with a fixed `asOf` and keeps day/week boundaries consistent with the rest of the app.

**Alternatives considered**: Reading the clock inside presenters — rejected (breaks purity/testability and the project-wide boundary rule).

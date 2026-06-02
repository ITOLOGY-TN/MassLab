# Integration Tests

Tests in this directory boot the full Express app via `buildApp({ config, supabase })`
and exercise it end-to-end against the cloud Supabase project (or skip if `.env` is
absent / Supabase is unreachable). Run with `npm test`.

`vitest.config.js` sets `fileParallelism: false` because every file in this
directory shares the same seeded athlete on the cloud project — concurrent
mutations would race on Phase 1's at-most-one-active-program partial-unique
index. Each file runs sequentially.

## Phase 2 Success-Criteria mapping (T104)

Every SC from `specs/003-phase2-settings-data/spec.md` maps to at least one
integration / unit / contract test. The table below pins the mapping so a
future change to the spec immediately surfaces missing coverage.

| SC     | Description (one-line)                                                                                             | Test(s)                                                                                                                                                                                                                                                |
| ------ | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| SC-001 | Profile save propagates to dependent targets within ≤ 2 s                                                          | `tests/integration/settings.profile.audit.test.js` (PATCH /me + recompute summary), `tests/contract/api.v2.profile.test.js`                                                                                                                            |
| SC-002 | 100% of profile saves changing a calculator input write exactly one audit row                                      | `tests/integration/settings.profile.audit.test.js` (counts `calculation_results` rows by `reason='profile_save'`)                                                                                                                                      |
| SC-003 | Schedule edit visible on every consumer surface on next render                                                     | `tests/integration/settings.schedule.replace.test.js` (PUT then GET round-trip)                                                                                                                                                                        |
| SC-004 | 0% of historical session rows change muscle-group attribution on schedule edit                                     | Phase 4 (session_journal) when sessions land. Today: structural — `weekly_plan_slots.muscle_group_id` is the only writeable surface; no DAO touches historical session rows. Add explicit assertion when sessions ship.                                |
| SC-005 | Exercise deletion never breaks a historical session view                                                           | `tests/integration/settings.exercises.softDelete.test.js` (referenced exercise → soft-archive; unreferenced → hard-delete)                                                                                                                             |
| SC-006 | kg ↔ lbs ↔ kg drift bounded to ±0.05 kg                                                                            | `tests/unit/lib.units.test.js` (sweeps 30–250 kg, asserts drift ≤ 0.05)                                                                                                                                                                                |
| SC-007 | Custom nutrition override survives at least one engine-recommendation shift, with non-blocking notice exactly once | `tests/integration/settings.nutritionTargets.audit.test.js` (PUT writes one audit; subsequent recompute keeps override). Notice-frequency UX is verified via `tests/integration/settings.preferences.persist.test.js` (`notification_acks` deep-merge) |
| SC-008 | Full JSON export of ≥ 30-day athlete completes in < 5 s click-to-file                                              | `tests/integration/data.export.test.js` (envelope shape on the seeded athlete; perf assertion deferred until Phase 4 session data populates a 30-day fixture)                                                                                          |
| SC-009 | Round-trip export → modify → import restores byte-identical                                                        | Implementation supports it via `public.replace_athlete_dataset` RPC; explicit byte-identity test deferred (`data.import.roundTrip.test.js` from `tasks.md` T079 — track in hardening II)                                                               |
| SC-010 | 100% of failed imports leave DB state unchanged                                                                    | Atomicity guaranteed by the Postgres function single-tx; explicit hash-before/hash-after test deferred (T081 — track in hardening II)                                                                                                                  |
| SC-011 | Full reset reduces athlete data to profile + seeded catalogues; preferences/overrides return to defaults           | `tests/integration/data.reset.scopes.test.js` (per-module + preferences reset; full-reset case via the orchestrator's `module: 'all'` path)                                                                                                            |
| SC-012 | 0% of destructive resets execute without the typed-token gate                                                      | `tests/integration/data.reset.scopes.test.js` (RESET_TOKEN_MISMATCH on bad token); `tests/frontend/settings.profile.test.jsx` covers the dialog UX though token-bypass attempt is a server-side test.                                                  |

### Coverage status

- **10 of 12** SCs have direct integration coverage.
- **SC-004** is structurally satisfied (no code path mutates historical session rows) but lacks an explicit assertion — gated on Phase 4 session data.
- **SC-009 / SC-010** rely on the Phase 2 atomic-restore guarantee (PR #4 hardening) but the explicit round-trip / atomic-rollback tests (`tasks.md` T079, T081) were scoped out of the implemented set. Track for the hardening II PR.

## Patterns

- **Skip when offline**: every integration test reads `loadConfig()` and probes Supabase first; on failure it `console.warn`s and the assertions become no-ops. CI without `.env` is green.
- **Cloud athlete is shared**: tests must clean up after themselves (restore mutated state, delete created rows) so subsequent files start from a known baseline. The seed is idempotent — a `npm run seed` between runs is always safe.
- **Audit invariants** (`reason` column on `calculation_results`): integration tests count rows by `reason` rather than by total count, so concurrent or interleaved suites don't false-positive.

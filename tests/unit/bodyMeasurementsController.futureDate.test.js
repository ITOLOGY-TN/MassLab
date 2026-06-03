// Phase 6 (009-body-weight-measurements) T008 [US1] — future-date guard (FR-005).
// The controller compares measured_on to the server's current date. To keep the
// test deterministic the factory accepts an injectable `now` (defaults to the
// real clock at the request boundary); here we pin "today" to a fixed date.
import { describe, it, expect, vi } from 'vitest';
import { bodyMeasurementsController } from '../../controllers/bodyMeasurements.controller.js';

const TODAY = new Date('2026-06-03T12:00:00.000Z');

// Minimal daos: only the cascade-free path is exercised because the future-date
// guard runs before any DAO write. The mocks throw if unexpectedly reached.
function makeDaos() {
  return {
    bodyMeasurements: {
      insert: vi.fn(async () => {
        throw new Error('insert must not run for a future date');
      }),
      findByDate: vi.fn(async () => null),
      listForAthlete: vi.fn(async () => []),
    },
    athletes: { findById: vi.fn(async () => ({})) },
    appConfig: { getOverridesFor: vi.fn(async () => ({})) },
    bodyComposition: { insert: vi.fn(async () => ({ id: 1 })) },
    calculationResults: { insert: vi.fn(async () => ({ id: 1 })) },
  };
}

function makeRes() {
  return {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

describe('bodyMeasurementsController.create — future-date guard (FR-005)', () => {
  it('rejects a measured_on after server today with 400 VALIDATION_FAILED', async () => {
    const daos = makeDaos();
    const ctrl = bodyMeasurementsController({ daos, now: () => TODAY });
    const req = {
      athleteId: 'athlete-1',
      body: { measured_on: '2026-06-04', weight_kg: 60 },
    };
    const res = makeRes();
    const next = vi.fn();

    await ctrl.create(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(400);
    expect(err.code).toBe('VALIDATION_FAILED');
    expect(daos.bodyMeasurements.insert).not.toHaveBeenCalled();
  });

  it('does not reject today itself', async () => {
    const daos = makeDaos();
    // For today's date we let the guard pass; stub the merge read + insert so the
    // cascade can be short-circuited by throwing a sentinel after the guard.
    daos.bodyMeasurements.insert = vi.fn(async () => {
      throw new Error('SENTINEL_PAST_GUARD');
    });
    const ctrl = bodyMeasurementsController({ daos, now: () => TODAY });
    const req = {
      athleteId: 'athlete-1',
      body: { measured_on: '2026-06-03', weight_kg: 60 },
    };
    const res = makeRes();
    const next = vi.fn();

    await ctrl.create(req, res, next);

    // The guard let it through: we reached the insert (sentinel), not a 400.
    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err.message).toBe('SENTINEL_PAST_GUARD');
  });
});

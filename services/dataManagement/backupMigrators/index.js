// Phase 2 US6 (T083): forward-migrator manifest.
// Empty for Phase 2 (current schema is v1; no older versions exist yet),
// but the chain walker is wired so the next bump just adds an entry.

export class MissingMigratorError extends Error {
  constructor(from, to) {
    super(`No migrator registered for v${from} → v${to}`);
    this.code = 'IMPORT_MISSING_MIGRATOR';
    this.from = from;
    this.to = to;
  }
}

/** Map of `${from}->${to}` to a pure migrator function. */
export const migrators = Object.freeze({});

/**
 * Walk the chain from `from` → `to` (1 step at a time).
 * Throws MissingMigratorError if a step is absent.
 */
export function migrateChain(envelope, { from, to }) {
  let current = envelope;
  let v = from;
  while (v < to) {
    const key = `${v}->${v + 1}`;
    const fn = migrators[key];
    if (!fn) throw new MissingMigratorError(v, v + 1);
    current = fn(current);
    v += 1;
  }
  return current;
}

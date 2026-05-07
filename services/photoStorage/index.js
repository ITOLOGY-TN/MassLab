/**
 * Photo storage adapter contract (FR-021).
 *
 * @typedef {Object} PhotoStorageAdapter
 * @property {(athleteId: string, bytes: Buffer, ext: string) => Promise<string>} put
 *           returns an opaque storage key.
 * @property {(key: string) => Promise<Buffer>} get
 * @property {(key: string) => Promise<void>} delete
 * @property {(key: string) => string} url
 *
 * The default implementation is the filesystem adapter; future Supabase
 * Storage adapter plugs into the same shape.
 */

import { filesystemAdapter } from './filesystemAdapter.js';

export function createPhotoStorage({ kind = 'filesystem', root } = {}) {
  if (kind === 'filesystem') return filesystemAdapter({ root });
  throw new Error(`Unknown photo storage kind: ${kind}`);
}

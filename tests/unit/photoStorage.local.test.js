import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createPhotoStorage } from '../../services/photoStorage/index.js';

let tmp;
let storage;
const athleteId = '00000000-0000-0000-0000-000000000001';

beforeAll(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'masslab-photos-'));
  storage = createPhotoStorage({ kind: 'filesystem', root: path.join(tmp, 'photos') });
});

afterAll(async () => {
  if (tmp) await fs.rm(tmp, { recursive: true, force: true });
});

describe('photoStorage filesystem adapter', () => {
  it('round-trips put → get → delete and returns opaque keys', async () => {
    const bytes = Buffer.from('fake-jpeg-bytes');
    const key = await storage.put(athleteId, bytes, 'jpg');
    expect(key).toMatch(/^photos\/[0-9a-f-]+\/[0-9a-f-]+\.jpg$/);
    expect(key.includes(athleteId)).toBe(true);
    expect(key.endsWith('.jpg')).toBe(true);
    expect(key).not.toMatch(/[\\:]/);

    const back = await storage.get(key);
    expect(Buffer.compare(back, bytes)).toBe(0);

    await storage.delete(key);
    await expect(storage.get(key)).rejects.toThrow();
  });

  it('rejects calls without an athleteId', async () => {
    await expect(storage.put(undefined, Buffer.from('x'), 'jpg')).rejects.toThrow(
      /athleteId is required/,
    );
  });

  it('rejects non-Buffer payloads', async () => {
    await expect(storage.put(athleteId, 'plain string', 'jpg')).rejects.toThrow(/Buffer/);
  });
});

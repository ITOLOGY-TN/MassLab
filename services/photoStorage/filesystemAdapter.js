import fs from 'node:fs/promises';
import path from 'node:path';
import { v4 as uuidv4 } from 'uuid';

export function filesystemAdapter({ root = path.resolve('data', 'photos') } = {}) {
  async function ensureDir(dir) {
    await fs.mkdir(dir, { recursive: true });
  }

  async function put(athleteId, bytes, ext) {
    if (!athleteId) throw new Error('athleteId is required');
    if (!Buffer.isBuffer(bytes)) throw new Error('bytes must be a Buffer');
    const cleanExt = (ext ?? 'bin').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'bin';
    const id = uuidv4();
    const dir = path.join(root, athleteId);
    await ensureDir(dir);
    const fname = `${id}.${cleanExt}`;
    await fs.writeFile(path.join(dir, fname), bytes);
    return `photos/${athleteId}/${fname}`;
  }

  async function get(key) {
    const abs = path.join(root, '..', key);
    return fs.readFile(abs);
  }

  async function del(key) {
    const abs = path.join(root, '..', key);
    await fs.rm(abs, { force: true });
  }

  function url(key) {
    return `/static/${key}`;
  }

  return { put, get, delete: del, url };
}

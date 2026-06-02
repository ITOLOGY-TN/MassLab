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

  // Keys are produced by put() as `photos/<athleteId>/<file>`; root itself ends
  // in `photos`, so the containment base is root's parent. Reject absolute paths,
  // null bytes, and any key that escapes the base via `..` before touching disk.
  function resolveKey(key) {
    if (typeof key !== 'string' || key.length === 0) throw new Error('invalid key');
    if (key.includes('\0')) throw new Error('invalid key');
    if (path.isAbsolute(key)) throw new Error('invalid key');
    const base = path.resolve(root, '..');
    const abs = path.resolve(base, key);
    if (abs !== base && !abs.startsWith(base + path.sep)) throw new Error('invalid key');
    return abs;
  }

  async function get(key) {
    return fs.readFile(resolveKey(key));
  }

  async function del(key) {
    await fs.rm(resolveKey(key), { force: true });
  }

  function url(key) {
    return `/static/${key}`;
  }

  return { put, get, delete: del, url };
}

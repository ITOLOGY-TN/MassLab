import { HttpError } from './errorHandler.js';

/**
 * Build the auth middleware. Behaviour gates on `config.SINGLE_USER_MODE`.
 *
 * - SINGLE_USER_MODE=true  → resolve req.athleteId to the seeded athlete (cached).
 * - SINGLE_USER_MODE=false → validate the bearer token via supabase.auth.getUser
 *   and look up athletes.auth_user_id; reject with 401 otherwise.
 *
 * The middleware is wired AFTER requestId so the rejected response still carries
 * a correlation id (FR-018).
 */
export function buildAuthMiddleware({ config, supabase, athletesDao }) {
  let cachedSeededAthleteId = null;

  async function resolveSeededAthleteId() {
    if (cachedSeededAthleteId) return cachedSeededAthleteId;
    const seeded = await athletesDao.findBySeed();
    if (!seeded) {
      throw new HttpError(
        503,
        'NO_SEEDED_ATHLETE',
        'Single-user mode is enabled but no seeded athlete exists. Run `npm run seed`.',
      );
    }
    cachedSeededAthleteId = seeded.id;
    return cachedSeededAthleteId;
  }

  return async function auth(req, _res, next) {
    try {
      if (config.SINGLE_USER_MODE) {
        req.athleteId = await resolveSeededAthleteId();
        return next();
      }

      const header = req.headers.authorization ?? '';
      const match = /^Bearer\s+(.+)$/i.exec(header);
      if (!match) {
        return next(
          new HttpError(401, 'UNAUTHENTICATED', 'Missing bearer token in Authorization header.'),
        );
      }
      const token = match[1];
      const { data, error } = await supabase.auth.getUser(token);
      if (error || !data?.user) {
        return next(new HttpError(401, 'UNAUTHENTICATED', 'Invalid or expired bearer token.'));
      }
      const athlete = await athletesDao.findByAuthUserId(data.user.id);
      if (!athlete) {
        return next(
          new HttpError(401, 'UNAUTHENTICATED', 'Token is valid but no athlete is linked.'),
        );
      }
      req.athleteId = athlete.id;
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

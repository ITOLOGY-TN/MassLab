import { logger } from '../services/logger.js';

export function requestLogger(req, res, next) {
  const startedAt = process.hrtime.bigint();
  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    logger.info(
      {
        method: req.method,
        path: req.originalUrl ?? req.url,
        status: res.statusCode,
        duration_ms: Math.round(durationMs * 100) / 100,
        request_id: req.requestId,
        athlete_id: req.athleteId ?? null,
      },
      'http_request',
    );
  });
  next();
}

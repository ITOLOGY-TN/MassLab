import { logger } from '../services/logger.js';

export class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function errorHandler(err, req, res, _next) {
  const status = err.status ?? 500;
  const code = err.code ?? (status === 500 ? 'INTERNAL_ERROR' : 'BAD_REQUEST');
  const message = status === 500 ? 'Internal server error' : err.message;
  if (status >= 500) {
    logger.error({ err, request_id: req.requestId }, 'unhandled_error');
  } else {
    logger.warn({ code, request_id: req.requestId, message }, 'request_failed');
  }
  res.status(status).json({
    error: { code, message, request_id: req.requestId },
  });
}

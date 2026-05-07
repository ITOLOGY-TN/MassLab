import pino from 'pino';
import { SECRET_KEYS } from '../config/schema.js';

const redactPaths = [
  'req.headers.authorization',
  'res.headers["set-cookie"]',
  ...SECRET_KEYS.map((k) => `config.${k}`),
  ...SECRET_KEYS.map((k) => `env.${k}`),
];

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  redact: { paths: redactPaths, remove: false, censor: '[REDACTED]' },
  base: { service: 'masslab-api' },
});

export function childLogger(bindings) {
  return logger.child(bindings);
}

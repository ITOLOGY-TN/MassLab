import { loadConfig } from './config/index.js';
import { buildApp } from './app.js';
import { logger } from './services/logger.js';
import { SECRET_KEYS } from './config/schema.js';

async function main() {
  const config = loadConfig();
  const startupLog = {};
  for (const [k, v] of Object.entries(config)) {
    startupLog[k] = SECRET_KEYS.includes(k) ? '[REDACTED]' : v;
  }
  logger.info(
    {
      config: startupLog,
      single_user_mode: config.SINGLE_USER_MODE,
      seeded: process.argv.includes('--seed'),
    },
    'startup',
  );

  if (process.argv.includes('--seed')) {
    const { runSeed } = await import('./seed/runSeed.js');
    await runSeed({ config });
  }

  const app = buildApp({ config });
  app.listen(config.PORT, () => {
    logger.info({ port: config.PORT }, 'http_listening');
  });
}

main().catch((err) => {
  logger.fatal({ err }, 'startup_failed');
  process.exitCode = 1;
});

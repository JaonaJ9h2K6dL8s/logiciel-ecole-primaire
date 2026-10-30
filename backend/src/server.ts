import { createApp } from './app';
import { env } from './config/env';
import { closePool } from './database/pool';
import { purgeExpiredSessions } from './shared/session';

const app = createApp();

const server = app.listen(env.port, () => {
  console.log(`[backend] API démarrée sur http://127.0.0.1:${env.port} (env: ${env.nodeEnv})`);
  console.log(`[backend] Fuseau horaire : ${env.timezone}`);
  if (env.isProd && !env.cookieSecure) {
    console.warn('[backend] ATTENTION : COOKIE_SECURE=true recommandé en production (HTTPS).');
  }
});

// Purge périodique des sessions expirées (toutes les heures)
const purgeTimer = setInterval(() => {
  purgeExpiredSessions().catch((err) => console.error('[backend] purge sessions :', err));
}, 3600 * 1000);
purgeTimer.unref();

function shutdown() {
  clearInterval(purgeTimer);
  server.close(async () => {
    await closePool();
    process.exit(0);
  });
  // Garde-fou si des connexions restent ouvertes
  setTimeout(() => process.exit(0), 5000).unref();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

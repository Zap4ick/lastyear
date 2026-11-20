import { existsSync, renameSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { buildApp } from './app.ts';
import { openDb } from './db.ts';
import { createDeezer } from './deezer.ts';
import { createSiteImages } from './siteImages.ts';
import { createLastfm } from './lastfm.ts';

try {
  process.loadEnvFile(); // .env, if present
} catch {
  /* no .env: rely on the real environment */
}
const env = process.env;
const production = env.NODE_ENV === 'production';
// API_PORT, not PORT: dev tooling sets PORT for the Vite server.
const port = Number(env.API_PORT ?? 8787);
const appUrl = (env.APP_URL ?? 'http://localhost:5173').replace(/\/$/, '');
const retentionDays = Number(env.RESULT_RETENTION_DAYS ?? 400);

// The bookmarklet loader injects {APP_URL}/b.js into last.fm pages, which only load https scripts.
if (production && !appUrl.startsWith('https://')) {
  console.error(`APP_URL must be an https URL in production (got "${appUrl}").`);
  process.exit(1);
}

const dbPath = env.DB_PATH ?? 'data/lastyear.db';
// The app used to be called lastfmyear: take over its database file (with its WAL) on first start.
const oldDbPath = join(dirname(dbPath), 'lastfmyear.db');
if (!existsSync(dbPath) && existsSync(oldDbPath)) {
  for (const ext of ['', '-wal', '-shm']) {
    if (existsSync(oldDbPath + ext)) renameSync(oldDbPath + ext, dbPath + ext);
  }
}
const db = openDb(dbPath);

const app = await buildApp({
  db,
  lastfm: createLastfm({ apiKey: env.LASTFM_API_KEY, db }),
  deezer: createDeezer({ db }),
  siteImages: createSiteImages({ db }),
  appUrl,
  webDir: production ? join(import.meta.dirname, '../../dist/web') : undefined,
  logger: true,
});

if (!env.LASTFM_API_KEY) app.log.warn('LASTFM_API_KEY is not set: /api/user and /api/tags will answer 503');

/** Expired lookups out of the cache; results nobody re-imported for `retentionDays` deleted. */
function housekeeping() {
  db.purgeExpired();
  const gone = db.purgeOldResults(retentionDays);
  if (gone) app.log.info({ gone, retentionDays }, 'purged old results');
}
housekeeping();
const daily = setInterval(housekeeping, 24 * 60 * 60 * 1000);
daily.unref();

// In a container the server must listen on all interfaces; locally only on loopback.
await app.listen({ port, host: env.HOST ?? (production ? '0.0.0.0' : '127.0.0.1') });
app.log.info(`app url: ${appUrl}`);

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.once(sig, async () => {
    clearInterval(daily);
    await app.close();
    db.close();
    process.exit(0);
  });
}

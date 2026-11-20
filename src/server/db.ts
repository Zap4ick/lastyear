import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const MIGRATIONS = [
  `CREATE TABLE results (
     id TEXT PRIMARY KEY,
     username TEXT NOT NULL,
     year INTEGER NOT NULL,
     payload TEXT NOT NULL,
     token_hash TEXT NOT NULL,
     created_at TEXT NOT NULL,
     updated_at TEXT NOT NULL
   );
   CREATE TABLE cache (
     key TEXT PRIMARY KEY,
     value TEXT NOT NULL,
     expires_at INTEGER NOT NULL
   );`,
];

export type Db = ReturnType<typeof openDb>;

export function openDb(path: string) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  const version = (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
  for (let v = version; v < MIGRATIONS.length; v++) {
    db.exec('BEGIN');
    db.exec(MIGRATIONS[v]!);
    db.exec(`PRAGMA user_version = ${v + 1}`);
    db.exec('COMMIT');
  }

  const q = {
    getResult: db.prepare('SELECT * FROM results WHERE id = ?'),
    insertResult: db.prepare(
      'INSERT INTO results (id, username, year, payload, token_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ),
    updateResult: db.prepare('UPDATE results SET payload = ?, updated_at = ? WHERE id = ?'),
    deleteResult: db.prepare('DELETE FROM results WHERE id = ?'),
    purgeResults: db.prepare('DELETE FROM results WHERE updated_at < ?'),
    getCache: db.prepare('SELECT value FROM cache WHERE key = ? AND expires_at > ?'),
    setCache: db.prepare('INSERT OR REPLACE INTO cache (key, value, expires_at) VALUES (?, ?, ?)'),
    purgeCache: db.prepare('DELETE FROM cache WHERE expires_at <= ?'),
  };

  return {
    raw: db,
    getResult(id: string) {
      return q.getResult.get(id) as
        | {
            id: string;
            username: string;
            year: number;
            payload: string;
            token_hash: string;
            updated_at: string;
          }
        | undefined;
    },
    insertResult(r: { id: string; username: string; year: number; payload: string; tokenHash: string }) {
      const now = new Date().toISOString();
      q.insertResult.run(r.id, r.username, r.year, r.payload, r.tokenHash, now, now);
    },
    updateResult(id: string, payload: string) {
      q.updateResult.run(payload, new Date().toISOString(), id);
    },
    /** Small key/value cache with expiry, for Last.fm and Deezer lookups. */
    cacheGet<T>(key: string): T | undefined {
      const row = q.getCache.get(key, Date.now()) as { value: string } | undefined;
      return row ? (JSON.parse(row.value) as T) : undefined;
    },
    cacheSet(key: string, value: unknown, ttlMs: number) {
      q.setCache.run(key, JSON.stringify(value), Date.now() + ttlMs);
    },
    deleteResult(id: string) {
      q.deleteResult.run(id);
    },
    /** Drop results nobody has re-imported for `days` days. Returns how many went. */
    purgeOldResults(days: number): number {
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      return Number(q.purgeResults.run(cutoff).changes);
    },
    purgeExpired() {
      q.purgeCache.run(Date.now());
    },
    close() {
      db.close();
    },
  };
}

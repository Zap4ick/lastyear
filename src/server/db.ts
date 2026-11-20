import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { detailsMatchRow, eventKey } from '../shared/sharedEvents.ts';
import type { EventDetails, ImportPayload } from '../shared/types.ts';

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
  // Shared event details (src/shared/sharedEvents.ts). A vote = "this import read these details from
  // last.fm". Votes live and die with their result (deleted, purged, forgotten); the details themselves
  // are public event pages, kept while any vote points at them.
  `CREATE TABLE event_votes (
     result_id TEXT NOT NULL REFERENCES results(id) ON DELETE CASCADE,
     event_key TEXT NOT NULL,
     details_hash TEXT NOT NULL,
     PRIMARY KEY (result_id, event_key)
   );
   CREATE INDEX event_votes_by_key ON event_votes (event_key);
   CREATE TABLE event_details (
     hash TEXT PRIMARY KEY,
     details TEXT NOT NULL
   );`,
];

/** Distinct last.fm users whose imports must agree on an event's details before others get them. */
export const SHARED_EVENT_QUORUM = 2;

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
    resultsOfUser: db.prepare(
      'SELECT id, year, updated_at FROM results WHERE lower(username) = lower(?) ORDER BY year, id',
    ),
    deleteResultsOfUser: db.prepare('DELETE FROM results WHERE lower(username) = lower(?)'),
    deleteCacheKey: db.prepare('DELETE FROM cache WHERE key = ?'),
    deleteCacheByPrefix: db.prepare('DELETE FROM cache WHERE substr(key, 1, length(?1)) = ?1'),
    allResultIds: db.prepare('SELECT id FROM results'),
    deleteVotes: db.prepare('DELETE FROM event_votes WHERE result_id = ?'),
    insertVote: db.prepare('INSERT INTO event_votes (result_id, event_key, details_hash) VALUES (?, ?, ?)'),
    insertDetails: db.prepare('INSERT OR IGNORE INTO event_details (hash, details) VALUES (?, ?)'),
    votesFor: db.prepare(
      `SELECT v.event_key AS key, v.details_hash AS hash, COUNT(DISTINCT lower(r.username)) AS users
         FROM event_votes v JOIN results r ON r.id = v.result_id
        WHERE v.event_key IN (SELECT value FROM json_each(?))
        GROUP BY v.event_key, v.details_hash`,
    ),
    getDetails: db.prepare('SELECT details FROM event_details WHERE hash = ?'),
    purgeDetails: db.prepare(
      'DELETE FROM event_details WHERE hash NOT IN (SELECT details_hash FROM event_votes)',
    ),
  };

  /** Record which event details this result read from last.fm itself (replacing earlier votes). */
  function indexEvents(resultId: string, payload: ImportPayload) {
    q.deleteVotes.run(resultId);
    for (const c of payload.concerts) {
      if (!c.details || c.sharedDetails || !detailsMatchRow(c.details, c)) continue;
      const json = canonicalJson(c.details);
      const hash = createHash('sha256').update(json).digest('hex');
      q.insertDetails.run(hash, json);
      q.insertVote.run(resultId, eventKey(c), hash);
    }
  }

  function inTransaction<T>(fn: () => T): T {
    db.exec('BEGIN');
    try {
      const out = fn();
      db.exec('COMMIT');
      return out;
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  }

  if (version < 2) {
    // Results stored before shared details existed vote too.
    inTransaction(() => {
      for (const { id } of q.allResultIds.all() as { id: string }[]) {
        const row = q.getResult.get(id) as { payload: string };
        try {
          indexEvents(id, JSON.parse(row.payload) as ImportPayload);
        } catch {
          // A payload that does not look like an import (old test data): it just doesn't vote.
        }
      }
    });
  }

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
    insertResult(r: {
      id: string;
      username: string;
      year: number;
      payload: string;
      tokenHash: string;
      /** The parsed payload, when it is a real import: its event details then vote. */
      votes?: ImportPayload;
    }) {
      const now = new Date().toISOString();
      inTransaction(() => {
        q.insertResult.run(r.id, r.username, r.year, r.payload, r.tokenHash, now, now);
        if (r.votes) indexEvents(r.id, r.votes);
      });
    },
    updateResult(id: string, payload: ImportPayload) {
      inTransaction(() => {
        q.updateResult.run(JSON.stringify(payload), new Date().toISOString(), id);
        indexEvents(id, payload);
      });
    },
    /**
     * Event details that imports of at least `quorum` different users read identically from last.fm.
     * When imports disagree (the page changed between them), the version with the most users wins,
     * and a tie gives nothing.
     */
    sharedEventDetails(keys: string[], quorum = SHARED_EVENT_QUORUM): Record<string, EventDetails> {
      const best = new Map<string, { hash: string; users: number; tied: boolean }>();
      for (const v of q.votesFor.all(JSON.stringify(keys)) as {
        key: string;
        hash: string;
        users: number;
      }[]) {
        const b = best.get(v.key);
        if (!b || v.users > b.users) best.set(v.key, { hash: v.hash, users: v.users, tied: false });
        else if (v.users === b.users) b.tied = true;
      }
      const out: Record<string, EventDetails> = {};
      for (const [key, b] of best) {
        if (b.tied || b.users < quorum) continue;
        const row = q.getDetails.get(b.hash) as { details: string } | undefined;
        if (row) out[key] = JSON.parse(row.details) as EventDetails;
      }
      return out;
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
      q.purgeDetails.run();
    },
    resultsOfUser(username: string) {
      return q.resultsOfUser.all(username) as { id: string; year: number; updated_at: string }[];
    },
    /**
     * Erase everything held about a last.fm user (a data-subject request): their results, whoever made
     * them, and the cached profile and scrobble charts. Artist tags and photos are not about the user.
     */
    forgetUser(username: string): { results: number; cached: number } {
      const name = username.toLowerCase();
      db.exec('BEGIN');
      try {
        const results = Number(q.deleteResultsOfUser.run(name).changes);
        const cached =
          Number(q.deleteCacheKey.run(`lastfm:user:${name}`).changes) +
          Number(q.deleteCacheByPrefix.run(`lastfm:chart:${name}:`).changes);
        db.exec('COMMIT');
        return { results, cached };
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
    close() {
      db.close();
    },
  };
}

/** JSON with object keys sorted, so equal details hash equally whatever order they were built in. */
function canonicalJson(v: unknown): string {
  return JSON.stringify(v, (_k, val: unknown) =>
    val && typeof val === 'object' && !Array.isArray(val)
      ? Object.fromEntries(Object.entries(val).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : val,
  );
}

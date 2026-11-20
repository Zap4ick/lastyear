import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync } from 'node:fs';
import { sep } from 'node:path';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import fastifyStatic from '@fastify/static';
import { z } from 'zod';
import { mergePayloads } from '../shared/merge.ts';
import { importPayloadSchema } from '../shared/schema.ts';
import type { ImportPayload } from '../shared/types.ts';
import { buildBookmarklet, type BookmarkletBuild } from './bookmarklet.ts';
import type { Db } from './db.ts';
import type { Deezer } from './deezer.ts';
import { LastfmError, type Lastfm } from './lastfm.ts';
import { registerStoryRoutes } from './story.ts';

export interface AppDeps {
  db: Db;
  lastfm: Lastfm;
  deezer: Deezer;
  appUrl: string;
  /** Built SPA to serve (production). In dev, Vite serves the SPA and proxies /api here. */
  webDir?: string;
  logger?: boolean;
  /** fetch for story photos (tests stub it). */
  fetch?: typeof fetch;
}

export type Limiter = ReturnType<typeof rateLimiter>;

const postResultBody = z.object({
  payload: importPayloadSchema,
  mergeInto: z.object({ id: z.string().max(20), token: z.string().max(100) }).optional(),
});

const artistsQuery = (max: number) =>
  z.object({
    artist: z
      .union([z.string().min(1).max(200), z.array(z.string().min(1).max(200)).max(max)])
      .transform((a) => [...new Set(Array.isArray(a) ? a : [a])]),
  });

export async function buildApp(deps: AppDeps) {
  const app = Fastify({ logger: deps.logger ?? false, bodyLimit: 1024 * 1024, trustProxy: true });
  const limit = rateLimiter();
  const https = deps.appUrl.startsWith('https://');

  // Security headers on every response. No Cross-Origin-Resource-Policy: last.fm pages must be able
  // to load /b.js (the bookmarklet loader).
  app.addHook('onSend', async (req, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    if (https) reply.header('Strict-Transport-Security', 'max-age=15552000');
    const path = req.url.split('?')[0]!;
    // Results are public by link, not meant for search engines.
    if (/^\/(r|api|import)(\/|$)/.test(path)) reply.header('X-Robots-Tag', 'noindex');
    if (String(reply.getHeader('content-type') ?? '').startsWith('text/html')) {
      reply.header('Content-Security-Policy', CSP);
      reply.header('X-Frame-Options', 'DENY');
    }
  });

  // ---- results ---------------------------------------------------------------------------------

  app.post('/api/results', async (req, reply) => {
    if (!limit(req, 'post-results', 30, 60 * 60_000)) return tooMany(reply);
    const parsed = postResultBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid-payload', issues: parsed.error.issues.slice(0, 5) });
    }
    const { payload, mergeInto } = parsed.data;

    if (mergeInto) {
      const existing = deps.db.getResult(mergeInto.id);
      if (
        existing &&
        tokenMatches(mergeInto.token, existing.token_hash) &&
        existing.username.toLowerCase() === payload.username.toLowerCase() &&
        existing.year === payload.year
      ) {
        const merged = mergePayloads(JSON.parse(existing.payload) as ImportPayload, payload as ImportPayload);
        deps.db.updateResult(existing.id, JSON.stringify(merged));
        return { id: existing.id, token: mergeInto.token, merged: true };
      }
      // Unknown id or wrong token: fall through and create a new result.
    }

    const id = newId();
    const token = randomBytes(24).toString('base64url');
    deps.db.insertResult({
      id,
      username: payload.username,
      year: payload.year,
      payload: JSON.stringify(payload),
      tokenHash: hash(token),
    });
    return reply.code(201).send({ id, token, merged: false });
  });

  /** The owner (holder of the token from POST) can delete a result. */
  app.delete<{ Params: { id: string } }>('/api/results/:id', async (req, reply) => {
    if (!limit(req, 'post-results', 30, 60 * 60_000)) return tooMany(reply);
    const token = req.headers['x-result-token'];
    const row = /^[A-Za-z0-9]{6,20}$/.test(req.params.id) ? deps.db.getResult(req.params.id) : undefined;
    if (!row) return reply.code(404).send({ error: 'not-found' });
    if (typeof token !== 'string' || !tokenMatches(token, row.token_hash)) {
      return reply.code(403).send({ error: 'forbidden' });
    }
    deps.db.deleteResult(row.id);
    return reply.code(204).send();
  });

  app.get<{ Params: { id: string } }>('/api/results/:id', async (req, reply) => {
    const row = /^[A-Za-z0-9]{6,20}$/.test(req.params.id) ? deps.db.getResult(req.params.id) : undefined;
    if (!row) return reply.code(404).send({ error: 'not-found' });
    return { id: row.id, payload: JSON.parse(row.payload) as ImportPayload };
  });

  // ---- Last.fm / Deezer lookups ----------------------------------------------------------------

  app.get<{ Params: { name: string } }>('/api/user/:name', async (req, reply) => {
    if (!limit(req, 'lookup', 120, 60_000)) return tooMany(reply);
    if (!/^[A-Za-z0-9_.-]{2,30}$/.test(req.params.name))
      return reply.code(400).send({ error: 'bad-username' });
    try {
      return await deps.lastfm.getUser(req.params.name);
    } catch (e) {
      return lastfmFailure(e, reply);
    }
  });

  app.get('/api/tags', async (req, reply) => {
    if (!limit(req, 'lookup', 120, 60_000)) return tooMany(reply);
    const q = artistsQuery(60).safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: 'bad-query' });
    try {
      const tags = await mapLimit(q.data.artist, 4, (a) => deps.lastfm.getTags(a));
      return { tags: Object.fromEntries(q.data.artist.map((a, i) => [a, tags[i]])) };
    } catch (e) {
      return lastfmFailure(e, reply);
    }
  });

  app.get('/api/photos', async (req, reply) => {
    if (!limit(req, 'lookup', 120, 60_000)) return tooMany(reply);
    const q = artistsQuery(30).safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: 'bad-query' });
    const photos = await mapLimit(q.data.artist, 3, (a) =>
      deps.deezer.getPhoto(a).catch((e: unknown) => {
        req.log.warn({ err: e, artist: a }, 'deezer lookup failed');
        return null;
      }),
    );
    return { photos: Object.fromEntries(q.data.artist.map((a, i) => [a, photos[i]])) };
  });

  app.get<{ Params: { name: string; year: string } }>('/api/scrobbles/:name/:year', async (req, reply) => {
    if (!limit(req, 'lookup', 120, 60_000)) return tooMany(reply);
    const year = Number(req.params.year);
    if (
      !/^[A-Za-z0-9_.-]{2,30}$/.test(req.params.name) ||
      !(year >= 2002 && year <= new Date().getFullYear())
    ) {
      return reply.code(400).send({ error: 'bad-query' });
    }
    try {
      return await deps.lastfm.getYearChart(req.params.name, year);
    } catch (e) {
      return lastfmFailure(e, reply);
    }
  });

  registerStoryRoutes(app, deps, limit);

  // ---- bookmarklet -----------------------------------------------------------------------------

  let build: Promise<BookmarkletBuild> | null = null;
  const getBuild = () => (build ??= buildBookmarklet(deps.appUrl));

  app.get('/api/bookmarklet', async () => {
    const b = await getBuild();
    return { appUrl: deps.appUrl, standalone: b.standalone, loader: b.loader };
  });

  app.get('/b.js', async (_req, reply) => {
    const b = await getBuild();
    return reply.type('text/javascript; charset=utf-8').header('Cache-Control', 'no-cache').send(b.js);
  });

  app.get('/api/health', { logLevel: 'silent' }, async () => ({ ok: true }));

  // ---- SPA (production) ------------------------------------------------------------------------

  if (deps.webDir && existsSync(deps.webDir)) {
    await app.register(fastifyStatic, {
      root: deps.webDir,
      wildcard: false,
      // Vite's hashed assets never change; index.html must always be revalidated.
      setHeaders: (res, path) =>
        res.header(
          'Cache-Control',
          path.includes(`${sep}assets${sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache',
        ),
    });
    app.setNotFoundHandler((req, reply) => {
      if (req.method === 'GET' && !req.url.startsWith('/api/')) return reply.sendFile('index.html');
      return reply.code(404).send({ error: 'not-found' });
    });
  }

  return app;
}

/**
 * CSP for our pages: our own scripts and styles (React sets inline style attributes), images from
 * last.fm's and Deezer's CDNs, API calls to ourselves only, never framed.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://lastfm.freetls.fastly.net https://lastfm-img.freetls.fastly.net https://cdn-images.dzcdn.net https://e-cdns-images.dzcdn.net",
  "connect-src 'self'",
  "font-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

// ---- helpers -----------------------------------------------------------------------------------

const hash = (s: string) => createHash('sha256').update(s).digest('hex');

function tokenMatches(token: string, tokenHash: string): boolean {
  const a = Buffer.from(hash(token), 'hex');
  const b = Buffer.from(tokenHash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
function newId(): string {
  const bytes = randomBytes(10);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}

function lastfmFailure(e: unknown, reply: FastifyReply) {
  if (e instanceof LastfmError) {
    if (e.code === 'not-found') return reply.code(404).send({ error: 'not-found' });
    if (e.code === 'no-key') return reply.code(503).send({ error: 'lastfm-key-missing' });
  }
  reply.log.error(e);
  return reply.code(502).send({ error: 'upstream' });
}

function tooMany(reply: FastifyReply) {
  return reply.code(429).send({ error: 'rate-limited' });
}

/** Fixed-window, in-memory, per-IP limiter. Enough for one small instance. */
function rateLimiter() {
  const windows = new Map<string, { start: number; count: number }>();
  return (req: FastifyRequest, bucket: string, max: number, windowMs: number): boolean => {
    const key = `${bucket}:${req.ip}`;
    const now = Date.now();
    const w = windows.get(key);
    if (!w || now - w.start >= windowMs) {
      windows.set(key, { start: now, count: 1 });
      if (windows.size > 10_000) windows.clear();
      return true;
    }
    return ++w.count <= max;
  };
}

async function mapLimit<T, R>(items: T[], n: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(n, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!);
    }
  });
  await Promise.all(workers);
  return out;
}

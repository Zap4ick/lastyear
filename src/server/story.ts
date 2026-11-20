/** GET /api/story/:id.png — the story image for a result, a template and the user's picks. */
import { createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { headliner, lastfmPhoto, photoOptions, resolvePhoto } from '../shared/concert.ts';
import { artistsForTags, computeStats, type Stats } from '../shared/stats.ts';
import type { ImportPayload } from '../shared/types.ts';
import { buildStoryData } from '../story/data.ts';
import { templateById } from '../story/templates/index.ts';
import type { AppDeps, Limiter } from './app.ts';
import { isAllowedPhoto, renderStory } from './render.ts';

const query = z.object({
  t: z.string().max(40),
  k: z
    .union([z.string(), z.array(z.string())])
    .transform((v) => (Array.isArray(v) ? v : [v]))
    .pipe(
      z
        .array(z.string().regex(/^(event|festival):\d{1,12}$/))
        .min(1)
        .max(3),
    ),
  ph: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((v) => (v === undefined ? [] : Array.isArray(v) ? v : [v])),
  download: z.literal('1').optional(),
});

/** Wait for optional extras at most this long; a story without genres beats no story. */
const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T | undefined> =>
  Promise.race([p.catch(() => undefined), new Promise<undefined>((r) => setTimeout(r, ms))]);

export function registerStoryRoutes(app: FastifyInstance, deps: AppDeps, limit: Limiter) {
  // "made with <host>" on every story: the public host, or the default name while developing locally.
  const credit = deps.appUrl.startsWith('https://') ? new URL(deps.appUrl).host : undefined;
  const statsCache = new Map<string, Promise<Stats>>();
  const pngCache = new Map<string, Buffer>();

  async function statsFor(id: string, updatedAt: string, payload: ImportPayload): Promise<Stats> {
    const key = `${id}:${updatedAt}`;
    let p = statsCache.get(key);
    if (!p) {
      p = (async () => {
        const artists = artistsForTags(payload).slice(0, 120);
        const [tagList, chart] = await Promise.all([
          withTimeout(Promise.all(artists.map((a) => deps.lastfm.getTags(a).catch(() => []))), 10_000),
          withTimeout(deps.lastfm.getYearChart(payload.username, payload.year), 8000),
        ]);
        const tags = tagList ? Object.fromEntries(artists.map((a, i) => [a, tagList[i]!])) : undefined;
        return computeStats(payload, { tags, chart });
      })();
      statsCache.set(key, p);
      if (statsCache.size > 200) statsCache.delete(statsCache.keys().next().value!);
    }
    return p;
  }

  app.get<{ Params: { id: string } }>('/api/story/:id.png', async (req, reply) => {
    if (!limit(req, 'render', 60, 60_000)) return reply.code(429).send({ error: 'rate-limited' });
    const q = query.safeParse(req.query);
    const template = q.success ? templateById(q.data.t) : undefined;
    if (!q.success || !template) return reply.code(400).send({ error: 'bad-query' });
    const row = /^[A-Za-z0-9]{6,20}$/.test(req.params.id) ? deps.db.getResult(req.params.id) : undefined;
    if (!row) return reply.code(404).send({ error: 'not-found' });
    const payload = JSON.parse(row.payload) as ImportPayload;

    const cacheKey = createHash('sha256')
      .update(JSON.stringify([row.id, row.updated_at, template.id, q.data.k, q.data.ph]))
      .digest('hex');
    let png = pngCache.get(cacheKey);
    // A photo the CDN failed to deliver this time: send the image, but keep nobody from caching it.
    let photoMissing = false;
    if (!png) {
      const byKey = new Map(payload.concerts.map((c) => [`${c.kind}:${c.id}`, c]));
      const picks = await Promise.all(
        q.data.k.map(async (key, i) => {
          const c = byKey.get(key);
          if (!c) return { key, photo: null };
          const chosen = q.data.ph[i];
          if (isAllowedPhoto(chosen)) return { key, photo: chosen };
          // Automatic: last.fm photo, else Deezer for the headliner.
          const head = headliner(c);
          const fallback =
            !lastfmPhoto(c) && head ? await deps.deezer.getPhoto(head).catch(() => null) : null;
          return { key, photo: resolvePhoto({ photo: null }, photoOptions(c, fallback)) };
        }),
      );
      const stats = await statsFor(row.id, row.updated_at, payload);
      png = await renderStory(template, buildStoryData(payload, picks, stats), {
        fetch: deps.fetch,
        credit,
        onPhotoMissing: (url, reason) => {
          photoMissing = true;
          req.log.warn({ photo: url, reason }, 'story photo could not be loaded');
        },
      });
      if (!photoMissing) {
        pngCache.set(cacheKey, png);
        if (pngCache.size > 40) pngCache.delete(pngCache.keys().next().value!);
      }
    }

    reply.type('image/png').header('Cache-Control', photoMissing ? 'no-store' : 'public, max-age=600');
    if (q.data.download) {
      reply.header(
        'Content-Disposition',
        `attachment; filename="lastyear-${payload.username}-${payload.year}-${template.id}.png"`,
      );
    }
    return reply.send(png);
  });
}

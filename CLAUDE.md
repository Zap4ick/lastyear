# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**lastyear**: a user's year of concerts from last.fm turned into a 1080×1920 Instagram-story PNG.
Node 26 + TypeScript (run directly via `tsx`, ESM, `.ts` extensions in imports), Fastify, SQLite via
`node:sqlite`, React 19 + Vite + wouter, Satori + resvg + sharp for rendering, Vitest, zod.

## Commands

```bash
npm run dev            # API (tsx watch, :8787) + Vite (:5173, proxies ^/api/ and ^/b.js to the API)
npm run check          # typecheck + lint + tests — run before calling work done
npm test               # vitest run (all src/**/*.test.ts, happy-dom env, 60 s timeout)
npx vitest run src/shared/stats.test.ts      # single file
npx vitest run -t "name of test"             # single test by name
npm run typecheck      # tsc --noEmit
npm run lint           # eslint .
npm run format         # prettier --write .
npm run build          # vite build → dist/web (server serves it when NODE_ENV=production)
npm start              # production server
```

Dev helpers (outputs go to `.dev/`, git-ignored):

- `npm run fixture:payload [-- --year=2026 | --details=none]` builds a fake bookmarklet import from test
  fixtures; open `http://localhost:5173/__dev/fixture.html` with the dev server running. Use this instead of
  hitting last.fm.
- `npm run render:stories -- --result=<id> --t=<template>` renders real data; `npm run render:edge -- --t=<id>`
  renders awkward edge cases. Look at the PNGs after changing a template.

Env: copy `.env.example` → `.env`. `LASTFM_API_KEY` is optional locally (lookups answer 503 without it).
`APP_URL` must be https in production (server refuses to start otherwise).

## How data flows

1. **Bookmarklet** (`src/bookmarklet/`) runs inside the user's last.fm tab. Last.fm has no events API and
   blocks server-side scraping with a JS challenge, so collection happens in the user's browser via
   same-origin `fetch`: year pages (`/user/{u}/events/{year}`, paginated at 30) then each event/festival page.
   Parsing lives in `src/shared/parse/` (shared so it's testable against real HTML fixtures in
   `parse/__fixtures__/`). Requests are serial with ~1.2 s pauses; **HTTP 406 is a firewall block — never
   retry it**, stop and return a partial result with a warning; 503s are retried with backoff. Event pages
   that other users' imports already read come from our server instead (see `event_votes` below).
2. Result is encoded by `src/shared/codec.ts` (`"v1." + base64url(deflate-raw(JSON))`) and handed to the app
   in the **URL fragment** of `/import`, so it never hits a server log.
3. The web app POSTs it to `/api/results` (validated by `src/shared/schema.ts`). The server returns `{id, token}`;
   only the token's hash is stored. The token lives in the browser's localStorage (`src/web/storage.ts`) and is
   required to delete a result or merge a re-import into it (`src/shared/merge.ts`: fresh concert list wins,
   missing event details are filled from the earlier import).
4. `/r/:id` shows stats. `computeStats` (`src/shared/stats.ts`) runs **both** in the browser (`src/web/useStats.ts`)
   and on the server (for story facts), enriched with Last.fm tags and the year's scrobble chart.
5. `/r/:id/story` lets the user pick up to 3 gigs, photos and a template; the image comes from
   `GET /api/story/:id.png?t=…&k=…&ph=…` (`src/server/story.ts` → `render.ts`).

The bookmarklet is built on the fly by the server with esbuild (`src/server/bookmarklet.ts`), with
`__APP_URL__` baked in. Two forms: a standalone `javascript:` URL with everything inlined (works with http
localhost) and a short loader that injects `{APP_URL}/b.js` (needs https: last.fm upgrades http requests).

## Server storage (`src/server/db.ts`)

Single SQLite file (default `data/lastyear.db`, `/data/lastyear.db` in Docker), migrations are an array
indexed by `PRAGMA user_version` — append, never edit existing entries.

- `results`: one row per import (`id`, `username`, `year`, `payload` JSON = `ImportPayload`, `token_hash`,
  timestamps). Purged when not updated for `RESULT_RETENTION_DAYS` (default 400).
- `cache`: key/value with expiry for external lookups — `lastfm:user:*` (1 day), `lastfm:tags:*` (30 days),
  `lastfm:chart:<user>:<year>` (30 days for past years, 6 h for the current one), `deezer:photo:*`,
  `site:image:<website>` → our path and `site:jpeg:<hash>` → the re-encoded picture (festival websites).
- `event_votes` / `event_details`: shared event details (`src/shared/sharedEvents.ts`). Each result "votes"
  for the event details it read from last.fm itself (`sharedDetails` unset, matching its own year-page row);
  votes cascade-delete with their result. `POST /api/events/lookup` (CORS for last.fm origins only) serves
  details at least 2 distinct usernames agree on, and the bookmarklet skips those pages after re-checking
  them with `detailsMatchRow`. From an http dev app URL the lookup fails (last.fm upgrades it to https) and
  every page is read as before.
- Data requests (About page → "Your rights"): `npm run forget -- --user=<name> [--delete]` (`src/server/forget.ts`,
  shipped in the image; see DEPLOY.md). Request logs carry no IP or username (`logRequest` in `app.ts`).
- In-memory only (lost on restart): computed stats, rendered PNGs, downloaded photos (small LRUs in
  `story.ts` / `render.ts`), and rate limits. Hence deploy must be **a single instance**.

Photos are only fetched from allow-listed hosts (last.fm CDN and Deezer; `isAllowedPhoto` in `render.ts`).
Deezer is the fallback when last.fm has no headliner image. Photo order (`photoOptions` in `shared/concert.ts`):
events: headliner, the event page's poster, other performers; festivals: poster, the share image (og:image) of
the festival's own website, performers; then header image, Deezer. A text poster cropped full-bleed clashes
with the story text, so it is never an event's default. last.fm's festival header is a photo of some line-up artist, not of the festival. Website
pictures are fetched only for festivals of a stored result (`src/server/siteImages.ts`), through `safeGet`
(`safeFetch.ts`: public addresses only, checked at connect time and on every redirect), re-encoded with sharp
and served from `/api/site-image/<hash>.jpg`, never hot-linked.

## Story templates (`src/story/`)

Read `src/story/README.md` before touching templates — it documents the non-obvious Satori constraints
(flexbox only, every multi-child element needs `display: 'flex'`, content-box sizing, no word breaking),
font-subset registration (always use the family constants from `fonts.ts`, or Cyrillic breaks), the
Instagram safe area (`SAFE_TOP`/`SAFE_BOTTOM`), and text measurement via `measure.ts` (never estimate glyph
widths by hand). A new template must be registered in both `templates/index.ts` and `catalog.ts` (a test
keeps them in sync); the browser never imports template code.

## Conventions

- All user-facing text in the app and on images is English.
- Web UI design rules (from the owner): no cards/tiles/borders around blocks, plain minimal lists; a block
  with nothing to say is not shown at all (no "0 of …", no placeholder while loading); show only what's
  needed. `PLAN.md` (git-ignored, Russian) holds the full design notes and last.fm findings.

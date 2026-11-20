# lastfmyear

Your year of concerts from last.fm, turned into an Instagram story.

1. A bookmarklet runs on last.fm in your own browser and reads your public events pages for a year.
2. The app shows stats: concert count, artists seen more than once, top genres, top venue, busiest month,
   and how many of your most-scrobbled artists you saw live.
3. You pick your top gigs (tap, then drag to reorder) and choose one of several story designs.
4. The server renders a 1080×1920 PNG you can share or save from your phone.

An independent fan project, not affiliated with or endorsed by Last.fm.

## Why a bookmarklet

Last.fm has no API for attended events, and its website sits behind a browser challenge. The bookmarklet
reads the pages you can already see, at a polite pace, and hands the result to the app in the URL
fragment. It never touches your password or account settings.

## Stack

Node 26 + TypeScript, Fastify, SQLite (`node:sqlite`), React + Vite, Satori + resvg + sharp for the
story images, Vitest.

## Run locally

```bash
npm install
cp .env.example .env    # add a free Last.fm API key: https://www.last.fm/api/account/create
npm run dev             # web on http://localhost:5173, API on :8787
```

```bash
npm run check           # typecheck, lint, tests
npm run render:stories  # render every story design to PNG for review
```

Without a Last.fm account at hand, `npm run fixture:payload` builds a demo import from the test fixtures.

## Project layout

- `src/bookmarklet/`: the collector that runs on last.fm
- `src/shared/`: page parsers, import format, stats
- `src/server/`: API, storage, story rendering
- `src/story/`: story designs (see `src/story/README.md` to add one)
- `src/web/`: the web app

## Deploy

See [DEPLOY.md](DEPLOY.md): one Docker container with an HTTPS URL and a small volume for SQLite.

## License

[MIT](LICENSE). Artist photos come from Last.fm and Deezer and belong to their owners.

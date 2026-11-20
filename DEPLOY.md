# Deploying lastyear

One container (`Dockerfile`) serves the web app, the API, the bookmarklet and the story renderer.
State is a single SQLite file on a volume at `/data`.

## Requirements

- **HTTPS on your public URL.** The bookmarklet injects `{APP_URL}/b.js` into last.fm pages, which
  only load https scripts, and phones only offer "Share" on https. The server refuses to start in
  production with an http `APP_URL`.
- **One instance.** SQLite on a volume, and rate limits kept in memory.
- **~1 GB RAM.** Rendering a story (Satori, resvg, sharp) peaks at a few hundred MB.

## Environment

| Variable                | Required | Notes                                                                                             |
| ----------------------- | -------- | ------------------------------------------------------------------------------------------------- |
| `APP_URL`               | yes      | Public https URL, no trailing slash. The bookmarklet is built for it.                             |
| `LASTFM_API_KEY`        | yes      | Free, https://www.last.fm/api/account/create. Without it, no username check, genres or scrobbles. |
| `DB_PATH`               | no       | Default `/data/lastyear.db` in the image.                                                         |
| `RESULT_RETENTION_DAYS` | no       | Results not re-imported for this long are deleted. Default 400.                                   |
| `API_PORT`              | no       | Default 8787.                                                                                     |

## Option A: Fly.io

```bash
fly launch --no-deploy --copy-config        # keeps fly.toml; pick an app name
fly volumes create lastyear_data --size 1 --region ams
fly secrets set LASTFM_API_KEY=…            # never commit it
fly deploy
```

Set `APP_URL` in `fly.toml` to `https://<app>.fly.dev`, or to your domain after
`fly certs add your.domain` (then point the domain's DNS at Fly as `fly certs show` says).

## Option B: any VPS with Docker (e.g. Hetzner)

`docker-compose.yml` next to a `Caddyfile`; Caddy gets and renews the TLS certificate itself.

```yaml
services:
  app:
    build: .
    restart: unless-stopped
    environment:
      APP_URL: https://your.domain
      LASTFM_API_KEY: ${LASTFM_API_KEY}
    volumes: [data:/data]
  caddy:
    image: caddy:2
    restart: unless-stopped
    ports: ['80:80', '443:443']
    volumes: [./Caddyfile:/etc/caddy/Caddyfile, caddy:/data]
volumes: { data: {}, caddy: {} }
```

```
your.domain {
  encode zstd gzip
  reverse_proxy app:8787
}
```

## After the first deploy

1. Open `{APP_URL}`, enter a username, add the bookmark (the short loader version on https).
2. On last.fm, run it on your events page; you should land on your result.
3. Make a story and use **Share** on a phone (Android Chrome/Vivaldi, iOS Safari).

## Backups

The whole state is `/data/lastyear.db` (results + lookup cache). Copy it with
`sqlite3 /data/lastyear.db ".backup /data/backup.db"` (safe while running).

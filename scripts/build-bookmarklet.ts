/**
 * Write the bookmarklet to dist/bookmarklet for inspection or manual install. The server builds and serves
 * the same thing itself (/b.js, /api/bookmarklet), so this is only needed outside the app.
 *
 *   npm run build:bookmarklet -- --app=https://your.domain
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { buildBookmarklet } from '../src/server/bookmarklet.ts';

const app = process.argv.find((a) => a.startsWith('--app='))?.slice(6) ?? process.env.APP_URL;
if (!app) throw new Error('Pass --app=https://your.domain (or set APP_URL)');

const b = await buildBookmarklet(app);
await mkdir('dist/bookmarklet', { recursive: true });
await writeFile('dist/bookmarklet/b.js', b.js);
await writeFile('dist/bookmarklet/standalone.txt', b.standalone);
await writeFile('dist/bookmarklet/loader.txt', b.loader);
console.log(
  `b.js ${(b.js.length / 1024).toFixed(1)} KB, standalone ${(b.standalone.length / 1024).toFixed(1)} KB, ` +
    `loader ${b.loader.length} B → dist/bookmarklet (app: ${app})`,
);

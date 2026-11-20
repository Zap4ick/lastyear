/**
 * Write a page that redirects to the app's /import with a payload built from fixtures, exactly as the
 * bookmarklet would — without any requests to last.fm.
 *
 *   npm run fixture:payload                  # demo123 2025 (two year pages, 47 concerts)
 *   npm run fixture:payload -- --year=2026   # demo123 2026 (25 concerts, one festival)
 *   npm run fixture:payload -- --details=none  # real artist names from the year pages, no photos
 *   npm run fixture:payload -- --app=http://localhost:5173 --out=.dev/other.html
 *
 * With the dev server running, open http://localhost:5173/__dev/fixture.html (or fixture-2026.html).
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { Window } from 'happy-dom';
import { encodePayload } from '../src/shared/codec.ts';
import { buildFixturePayload } from '../src/shared/parse/fixture-payload.ts';

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .filter((a) => a.startsWith('--'))
    .map((a) => a.slice(2).split('=') as [string, string]),
);
const year = Number(args.year ?? 2025) as 2025 | 2026;
const app = (args.app ?? 'http://localhost:5173').replace(/\/$/, '');
// .dev/ is git-ignored and served by the Vite dev server only (never part of a production build).
const out =
  args.out ?? `.dev/fixture${year === 2025 ? '' : `-${year}`}${args.details === 'none' ? '-rows' : ''}.html`;

const window = new Window({
  settings: {
    disableJavaScriptEvaluation: true,
    disableJavaScriptFileLoading: true,
    disableCSSFileLoading: true,
    disableIframePageLoading: true,
    handleDisabledFileLoadingAsSuccess: true,
  },
});
const parser = new window.DOMParser();
const details = args.details === 'none' ? 'none' : 'rotate';
const payload = await buildFixturePayload(
  year,
  (html) => parser.parseFromString(html, 'text/html') as unknown as Document,
  { details },
);
await window.happyDOM.close();

const url = `${app}/import#${await encodePayload(payload)}`;
await mkdir(dirname(out), { recursive: true });
await writeFile(
  out,
  `<!doctype html><meta charset="utf-8"><script>location.replace(${JSON.stringify(url)})</script>`,
);
console.log(
  `${payload.concerts.length} concerts, fragment ${url.length - url.indexOf('#') - 1} chars → ${out}`,
);

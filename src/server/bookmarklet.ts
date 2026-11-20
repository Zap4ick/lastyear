/** Builds the bookmarklet for a given app URL (esbuild, in-process, ~20 ms). */
import * as esbuild from 'esbuild';
import { join } from 'node:path';

export interface BookmarkletBuild {
  /** The collector, served at {APP}/b.js for the loader. */
  js: string;
  /** javascript: URL with the whole collector inlined. Works with an http:// app URL (localhost). */
  standalone: string;
  /** Short javascript: URL that loads {APP}/b.js. Needs an https app URL: last.fm upgrades http requests. */
  loader: string;
}

export const toBookmarklet = (code: string) => 'javascript:' + encodeURIComponent(code.trim());

export const loaderCode = (appUrl: string) =>
  `(()=>{var s=document.createElement('script');s.src=${JSON.stringify(appUrl + '/b.js?')}+Date.now();document.body.appendChild(s)})()`;

export async function buildBookmarklet(
  appUrl: string,
  opts: { minify?: boolean } = {},
): Promise<BookmarkletBuild> {
  const app = appUrl.replace(/\/$/, '');
  const result = await esbuild.build({
    entryPoints: [join(import.meta.dirname, '../bookmarklet/main.ts')],
    bundle: true,
    minify: opts.minify ?? true,
    format: 'iife',
    target: ['chrome100', 'safari15', 'firefox100'],
    define: { __APP_URL__: JSON.stringify(app) },
    legalComments: 'none',
    write: false,
  });
  const js = result.outputFiles[0]!.text;
  return { js, standalone: toBookmarklet(js), loader: toBookmarklet(loaderCode(app)) };
}

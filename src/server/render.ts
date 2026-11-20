/** Story PNG rendering: fonts + photos (sharp) → Satori SVG → resvg PNG. */
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import { createElement, type ReactElement } from 'react';
import satori from 'satori';
import sharp from 'sharp';
import type { StoryData } from '../story/data.ts';
import { FONT_FILES, SUBSETS } from '../story/fonts.ts';
import { CREDIT_TOP, DEFAULT_CREDIT, H, W, type PhotoSpec, type StoryTemplate } from '../story/template.ts';

const require = createRequire(import.meta.url);

type SatoriFont = { name: string; data: Buffer; weight: 400 | 500 | 700 | 800; style: 'normal' };
let fontsPromise: Promise<SatoriFont[]> | null = null;

export function loadFonts(): Promise<SatoriFont[]> {
  return (fontsPromise ??= Promise.all(
    FONT_FILES.flatMap(([pkg, family, weight]) => {
      const dir = join(dirname(require.resolve(`@fontsource/${pkg}/package.json`)), 'files');
      return SUBSETS.map(async (subset) => ({
        name: `${family} ${subset}`,
        data: await readFile(join(dir, `${pkg}-${subset}-${weight}-normal.woff`)),
        weight,
        style: 'normal' as const,
      }));
    }),
  ));
}

/** Only photos from the CDNs our data comes from. */
const ALLOWED_HOSTS = new Set([
  'lastfm.freetls.fastly.net',
  'lastfm-img.freetls.fastly.net',
  'cdn-images.dzcdn.net',
  'e-cdns-images.dzcdn.net',
]);

export function isAllowedPhoto(url: string | null | undefined): url is string {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && ALLOWED_HOSTS.has(u.hostname);
  } catch {
    return false;
  }
}

/** Tiny LRU for downloaded photos and rendered PNGs. */
class Lru<V> {
  private map = new Map<string, V>();
  constructor(private max: number) {}
  get(k: string) {
    const v = this.map.get(k);
    if (v !== undefined) {
      this.map.delete(k);
      this.map.set(k, v);
    }
    return v;
  }
  set(k: string, v: V) {
    this.map.delete(k);
    this.map.set(k, v);
    if (this.map.size > this.max) this.map.delete(this.map.keys().next().value!);
  }
  /** Remove `k`, but only while it still maps to `v` (a newer value stays). */
  deleteIf(k: string, v: V) {
    if (this.map.get(k) === v) this.map.delete(k);
  }
}

const rawPhotos = new Lru<Promise<Buffer>>(60);

const LASTFM_IMAGE = /^https:\/\/lastfm(?:-img)?\.freetls\.fastly\.net\/i\/u\/[^/]+\/([0-9a-f]{32})(\.\w+)?$/;

/**
 * Where else the same last.fm image lives. Fastly edges can hold a stale 404 for one URL (seen from
 * Amsterdam for an ar0 .jpg that Berlin served fine): the other host has its own cache, and the
 * 770x0 rendition and the extensionless original are different objects.
 */
export function photoUrls(url: string): string[] {
  const m = url.match(LASTFM_IMAGE);
  if (!m) return [url];
  const [, hash, ext = ''] = m;
  const other = url.includes('//lastfm-img.') ? 'lastfm' : 'lastfm-img';
  return [
    url,
    `https://${other}.freetls.fastly.net/i/u/ar0/${hash}${ext}`,
    `https://lastfm.freetls.fastly.net/i/u/770x0/${hash}${ext}`,
    `https://lastfm.freetls.fastly.net/i/u/ar0/${hash}`,
  ].filter((u, i, all) => all.indexOf(u) === i);
}

/**
 * The CDN with one retry; on a 404, the image's other addresses. Generous timeout: the Story page asks
 * for every template at once, often on a machine that has just woken up, and the photo is the point of
 * the image. Throws with the reasons.
 */
async function download(url: string, fetchImpl: typeof fetch): Promise<Buffer> {
  const reasons: string[] = [];
  const attempt = async (candidate: string): Promise<Buffer | 404 | null> => {
    try {
      const res = await fetchImpl(candidate, { signal: AbortSignal.timeout(15_000) });
      if (!res.ok) {
        reasons.push(`HTTP ${res.status} ${candidate}`);
        return res.status === 404 ? 404 : null;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > 10 * 1024 * 1024) throw new Error(`too big (${buf.length} bytes)`);
      return buf;
    } catch (e) {
      reasons.push(`${e instanceof Error ? `${e.name}: ${e.message}` : String(e)} ${candidate}`);
      return null;
    }
  };
  let got = await attempt(url);
  if (got === null) got = await attempt(url); // timeout, network error, 5xx: once more
  // Only a 404 sends us elsewhere; a slow or broken CDN would just be slow at every address.
  for (const alt of photoUrls(url).slice(1)) {
    if (got !== 404) break;
    got = await attempt(alt);
  }
  if (got instanceof Buffer) return got;
  throw new Error(reasons.join('; '));
}

/** Downloads, shared between concurrent renders. A failed one is forgotten so the next render retries. */
function rawPhoto(url: string, fetchImpl: typeof fetch): Promise<Buffer> {
  let raw = rawPhotos.get(url);
  if (!raw) {
    const p = download(url, fetchImpl);
    p.catch(() => rawPhotos.deleteIf(url, p));
    rawPhotos.set(url, p);
    raw = p;
  }
  return raw;
}

const LASTFM_RED = '#d51007';

/** Crop to size around the most interesting area, then apply the template's treatment. Throws why not. */
async function preparePhoto(
  url: string,
  spec: PhotoSpec,
  fetchImpl: typeof fetch,
  localPhoto?: (url: string) => Buffer | null,
): Promise<string> {
  let buf = url.startsWith('/') ? (localPhoto?.(url) ?? null) : null;
  if (url.startsWith('/') && !buf) throw new Error('local photo not found');
  if (!buf) {
    if (!isAllowedPhoto(url)) throw new Error('host not allowed');
    buf = await rawPhoto(url, fetchImpl);
  }
  let img = sharp(buf).resize(spec.width, spec.height, { fit: 'cover', position: sharp.strategy.attention });
  if (spec.mode === 'mono') img = img.grayscale().modulate({ brightness: 0.95 });
  if (spec.mode === 'red') {
    // Duotone (sharp's tint() comes out nearly grey): grey levels mapped onto ink → last.fm red → warm white.
    const { data: grey, info } = await img
      .grayscale()
      .normalise()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const stops = [hex('#1a0306'), hex(LASTFM_RED), hex('#ffe3d6')];
    const rgb = Buffer.alloc(info.width * info.height * 3);
    for (let p = 0; p < info.width * info.height; p++) {
      const v = grey[p * info.channels]! / 255;
      const [a, b, t] =
        v < 0.55 ? [stops[0]!, stops[1]!, v / 0.55] : [stops[1]!, stops[2]!, (v - 0.55) / 0.45];
      for (let ch = 0; ch < 3; ch++) rgb[p * 3 + ch] = Math.round(a[ch]! + (b[ch]! - a[ch]!) * t);
    }
    img = sharp(rgb, { raw: { width: info.width, height: info.height, channels: 3 } });
  }
  const out = await img.jpeg({ quality: 84, mozjpeg: true }).toBuffer();
  return `data:image/jpeg;base64,${out.toString('base64')}`;
}

/** The page: the template's design plus the "made with …" line under it. */
export function storyPage(
  template: StoryTemplate,
  data: StoryData,
  photos: (string | null)[],
  credit = DEFAULT_CREDIT,
): ReactElement {
  const c = template.credit;
  const fontSize = c.fontSize ?? 24;
  return createElement(
    'div',
    { style: { display: 'flex', position: 'relative', width: W, height: H } },
    template.render(data, photos),
    createElement(
      'div',
      {
        style: {
          display: 'flex',
          position: 'absolute',
          left: c.left,
          top: CREDIT_TOP,
          fontFamily: c.fontFamily,
          fontSize,
          lineHeight: 1.2,
          fontWeight: c.fontWeight ?? 400,
          letterSpacing: c.letterSpacing ?? 0,
          color: c.color,
          whiteSpace: 'nowrap',
          ...(c.background ? { background: c.background, padding: '4px 10px', marginLeft: -10 } : {}),
        },
      },
      c.uppercase ? `MADE WITH ${credit.toUpperCase()}` : `made with ${credit}`,
    ),
  );
}

export async function renderStory(
  template: StoryTemplate,
  data: StoryData,
  opts: {
    fetch?: typeof fetch;
    credit?: string;
    /** Our own stored pictures (paths like /api/site-image/…), which are not fetched over the network. */
    localPhoto?: (url: string) => Buffer | null;
    /** Called when a concert had a photo URL but it could not be loaded (the story is drawn without it). */
    onPhotoMissing?: (url: string, reason: string) => void;
  } = {},
): Promise<Buffer> {
  const fetchImpl = opts.fetch ?? fetch;
  const [fonts, photos] = await Promise.all([
    loadFonts(),
    Promise.all(
      data.concerts.map((c) =>
        c.photo
          ? preparePhoto(c.photo, template.photo(c.rank, data), fetchImpl, opts.localPhoto).catch(
              (e: unknown) => {
                opts.onPhotoMissing?.(c.photo!, e instanceof Error ? e.message : String(e));
                return null;
              },
            )
          : null,
      ),
    ),
  ]);
  const svg = await satori(storyPage(template, data, photos, opts.credit), { width: W, height: H, fonts });
  return new Resvg(svg, { fitTo: { mode: 'width', value: W } }).render().asPng();
}

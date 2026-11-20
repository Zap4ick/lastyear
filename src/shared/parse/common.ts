/** Collapse whitespace and trim. */
export const clean = (s: string | null | undefined): string => (s ?? '').replace(/\s+/g, ' ').trim();

export const text = (el: Element | null | undefined): string => clean(el?.textContent);

/** Hashes of last.fm's grey-star placeholder artwork. */
const PLACEHOLDER_HASHES = new Set(['2a96cbd8b46e442fc41c2b86b821562f', 'c6f59c1e5e7240a4c0d427abd71f3dbb']);

/**
 * Turn any last.fm CDN image URL into its full-size original ("ar0").
 * Returns null for placeholders and non-CDN URLs.
 *   …/i/u/avatar300s/08300481d8484150c13b769007cac3ef.jpg → …/i/u/ar0/08300481d8484150c13b769007cac3ef.jpg
 */
export function fullSizeImage(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(
    /^(https:\/\/lastfm(?:-img)?\.freetls\.fastly\.net\/i\/u\/)[^/]+\/([0-9a-f]{32})(\.\w+)?/,
  );
  if (!m) return null;
  const [, base, hash, ext = ''] = m;
  if (PLACEHOLDER_HASHES.has(hash!)) return null;
  return `${base}ar0/${hash}${ext}`;
}

/** Pull the first url(...) out of an inline style attribute. */
export function backgroundImage(style: string | null | undefined): string | null {
  const m = style?.match(/url\(\s*['"]?([^'")]+)['"]?\s*\)/);
  return m?.[1] ?? null;
}

export type PageProblem = 'challenge' | 'unavailable' | 'rate-limited' | 'not-found';

/**
 * Recognise last.fm's non-content pages. The bookmarklet uses this to decide whether to retry.
 * (Inside fetch(), the "Temporarily unavailable" page arrives with HTTP status 600.)
 */
export function detectProblem(doc: Document): PageProblem | null {
  const title = clean(doc.title);
  if (title === 'Client Challenge') return 'challenge';
  if (/Temporarily Unavailable/i.test(title)) return 'unavailable';
  if (/Rate Limited/i.test(title)) return 'rate-limited';
  if (/Page Not Found/i.test(title) || doc.querySelector('.error-page--404')) return 'not-found';
  return null;
}

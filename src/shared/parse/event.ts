import type { EventDetails, Performer } from '../types.ts';
import { backgroundImage, fullSizeImage, text } from './common.ts';

/** Parse an /event/… or /festival/… page. */
export function parseEventPage(doc: Document): EventDetails {
  return {
    title: text(doc.querySelector('h1.header-title')),
    date: (doc.querySelector('[itemprop="startDate"]')?.getAttribute('content') ?? '').slice(0, 10),
    performers: parsePerformers(doc),
    lineupTotal: parseLineupTotal(doc),
    headerImageUrl: fullSizeImage(
      backgroundImage(doc.querySelector('.header-background--has-image')?.getAttribute('style')),
    ),
    venue: parseVenue(doc),
  };
}

function parsePerformers(doc: Document): Performer[] {
  const seen = new Set<string>();
  const performers: Performer[] = [];
  const items = doc.querySelectorAll('#line-up [itemprop="performer"]');
  for (const item of items) {
    const link = item.querySelector('a[itemprop="url"]') ?? item.querySelector('a[href^="/music/"]');
    const url = link?.getAttribute('href') ?? '';
    if (!url || seen.has(url)) continue;
    seen.add(url);
    performers.push({
      name: text(link),
      url,
      imageUrl: fullSizeImage(item.querySelector('img')?.getAttribute('src')),
    });
  }
  return performers;
}

function parseLineupTotal(doc: Document): number | null {
  const m = text(doc.querySelector('#line-up h2')).match(/Line-up\s*\((\d+)\)/i);
  return m ? Number(m[1]) : null;
}

function parseVenue(doc: Document): EventDetails['venue'] {
  const loc = doc.querySelector('[itemprop="location"]');
  if (!loc) return null;
  const opt = (sel: string) => text(loc.querySelector(sel)) || null;
  return {
    name: text(loc.querySelector('[itemprop="name"]')),
    street: opt('[itemprop="streetAddress"]'),
    city: opt('[itemprop="addressLocality"]'),
    country: opt('[itemprop="addressCountry"]'),
  };
}

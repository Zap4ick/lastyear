import { eventKey } from './sharedEvents.ts';
import type { Concert, ImportPayload } from './types.ts';

const PAUSED_WARNING = /^last\.fm paused our requests/;

/**
 * Combine a fresh import with an earlier one for the same user and year.
 * The fresh concert list wins (it is the latest truth), but event details missing from it — e.g. because
 * last.fm's firewall stopped the run halfway — are taken from the earlier import.
 */
export function mergePayloads(prev: ImportPayload, next: ImportPayload): ImportPayload {
  if (prev.username.toLowerCase() !== next.username.toLowerCase() || prev.year !== next.year) {
    throw new Error('Can only merge imports of the same user and year');
  }
  const prevByKey = new Map(prev.concerts.map((c) => [eventKey(c), c]));
  const concerts = next.concerts.map((c): Concert => {
    const p = c.details ? undefined : prevByKey.get(eventKey(c));
    if (!p?.details) return c;
    const { sharedDetails: _, ...rest } = c;
    return { ...rest, details: p.details, ...(p.sharedDetails ? { sharedDetails: true } : {}) };
  });
  const missing = concerts.filter((c) => !c.details).length;
  const warnings = next.warnings.filter((w) => !PAUSED_WARNING.test(w));
  if (missing && next.warnings.some((w) => PAUSED_WARNING.test(w))) {
    warnings.push(
      `last.fm paused our requests, so photos and line-ups are missing for ${missing} of ${concerts.length} concerts. ` +
        'Run the button again in about 15 minutes to fill them in.',
    );
  }
  return { ...next, concerts, warnings };
}

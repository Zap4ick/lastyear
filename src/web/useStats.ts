import { useEffect, useMemo, useState } from 'react';
import { artistsForTags, computeStats, type ScrobbleChart, type Stats, type Tag } from '../shared/stats.ts';
import type { ImportPayload } from '../shared/types.ts';
import { api } from './api.ts';

/**
 * Stats for a result. Basic numbers are instant; genres (artist tags) and the scrobble comparison arrive
 * from the server afterwards and are optional: until (or unless) they come, those rows simply don't show.
 */
export function useStats(payload: ImportPayload | null): Stats | null {
  const [tags, setTags] = useState<Record<string, Tag[]> | undefined>();
  const [chart, setChart] = useState<ScrobbleChart | undefined>();

  useEffect(() => {
    if (!payload) return;
    let cancelled = false;
    const artists = artistsForTags(payload);
    const batches = Array.from({ length: Math.ceil(artists.length / 60) }, (_, i) =>
      artists.slice(i * 60, i * 60 + 60),
    );
    Promise.all(batches.map((b) => api.tags(b)))
      .then((rs) => !cancelled && setTags(Object.assign({}, ...rs.map((r) => r.tags))))
      .catch(() => {});
    api
      .scrobbles(payload.username, payload.year)
      .then((c) => !cancelled && setChart(c))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [payload]);

  return useMemo(() => (payload ? computeStats(payload, { tags, chart }) : null), [payload, tags, chart]);
}

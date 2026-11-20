import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'wouter';
import type { Concert, ImportPayload } from '../../shared/types.ts';
import { api, ApiError } from '../api.ts';
import { ConcertList } from '../components/ConcertList.tsx';
import { PhotoPicker } from '../components/PhotoPicker.tsx';
import { StatsPanel } from '../components/StatsPanel.tsx';
import { TopPicks, type SlotView } from '../components/TopPicks.tsx';
import { headliner, lastfmPhoto } from '../../shared/concert.ts';
import {
  concertKey,
  loadPicks,
  MAX_PICKS,
  movePick,
  photoOptions,
  resolvePhoto,
  savePicks,
  setPhoto,
  togglePick,
  type Pick,
} from '../picks.ts';
import { forgetResult, savedResult } from '../storage.ts';
import { useStats } from '../useStats.ts';

/** Result page: stats, then pick your top 3 from the concert list. The story preview comes in phase 6. */
export function Result({ id }: { id: string }) {
  const [, navigate] = useLocation();
  const [payload, setPayload] = useState<ImportPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fallbackPhotos, setFallbackPhotos] = useState<Record<string, string | null>>({});
  const [picks, setPicks] = useState<Pick[]>([]);
  const [fullHint, setFullHint] = useState(false);
  const [photoFor, setPhotoFor] = useState<string | null>(null);
  const stats = useStats(payload);

  useEffect(() => {
    api
      .result(id)
      .then((r) => setPayload(r.payload))
      .catch((e: unknown) =>
        setError(
          e instanceof ApiError && e.status === 404 ? 'No such result.' : 'Could not load this result.',
        ),
      );
  }, [id]);

  const byKey = useMemo(() => new Map((payload?.concerts ?? []).map((c) => [concertKey(c), c])), [payload]);
  const max = Math.min(MAX_PICKS, payload?.concerts.length ?? 0);

  // Restore this browser's picks for this result.
  useEffect(() => {
    if (payload) setPicks(loadPicks(id, new Set(byKey.keys()), max));
  }, [payload, id, byKey, max]);

  const update = useCallback(
    (next: Pick[]) => {
      setPicks(next);
      savePicks(id, next);
    },
    [id],
  );

  // Photos last.fm didn't give us (event page not loaded, or a placeholder) come from Deezer.
  useEffect(() => {
    if (!payload) return;
    const missing = [
      ...new Set(
        payload.concerts
          .filter((c) => !lastfmPhoto(c))
          .map((c) => headliner(c))
          .filter((n): n is string => !!n),
      ),
    ].slice(0, 30);
    if (!missing.length) return;
    api
      .photos(missing)
      .then((r) => setFallbackPhotos(r.photos))
      .catch(() => {});
  }, [payload]);

  const optionsFor = useCallback(
    (c: Concert) => photoOptions(c, fallbackPhotos[headliner(c) ?? ''] ?? null),
    [fallbackPhotos],
  );

  const slots: SlotView[] = picks.flatMap((pick) => {
    const concert = byKey.get(pick.key);
    if (!concert) return [];
    const options = optionsFor(concert);
    return [{ pick, concert, photo: resolvePhoto(pick, options), photoCount: options.length }];
  });

  function toggle(key: string) {
    const r = togglePick(picks, key, max);
    if (r.full) {
      setFullHint(true);
      setTimeout(() => setFullHint(false), 2500);
      return;
    }
    update(r.picks);
  }

  if (error) {
    return (
      <main className="page narrow">
        <div className="card">
          <h1>{error}</h1>
          <p>
            <a href="/">Start over</a>
          </p>
        </div>
      </main>
    );
  }
  if (!payload) return <p className="loading page">Loading…</p>;

  const eventsUrl = `https://www.last.fm/user/${encodeURIComponent(payload.username)}/events/${payload.year}`;
  // Only the browser that created the result holds its delete key.
  const mine = savedResult(payload.username, payload.year);
  const owner = mine?.id === id ? mine : null;

  async function onDelete(token: string) {
    if (!payload || !confirm('Delete this result? The link will stop working for everyone.')) return;
    try {
      await api.deleteResult(id, token);
      forgetResult(payload.username, payload.year);
      navigate('/', { replace: true });
    } catch {
      alert('Could not delete it right now. Try again in a minute.');
    }
  }
  const n = payload.concerts.length;
  const festivals = payload.concerts.filter((c) => c.kind === 'festival').length;
  const pickerConcert = photoFor ? byKey.get(photoFor) : undefined;
  const pickerPick = picks.find((p) => p.key === photoFor);

  return (
    <main className="page">
      <header className="result-head">
        <p className="eyebrow">
          <a href={`https://www.last.fm/user/${encodeURIComponent(payload.username)}`}>{payload.username}</a>{' '}
          · {payload.year}
        </p>
        <h1>
          {n} concert{n === 1 ? '' : 's'}
          {festivals ? (
            <span className="muted">
              {' '}
              incl. {festivals} festival{festivals === 1 ? '' : 's'}
            </span>
          ) : null}
        </h1>
        {payload.warnings.map((w) => (
          <p key={w} className="note">
            {w}
          </p>
        ))}
      </header>

      {n === 0 ? (
        <div className="card empty-state">
          <h2>No concerts for {payload.year} on last.fm</h2>
          <p className="muted">
            lastfmyear reads the gigs you marked as “went” on last.fm. Find your concerts there (Events →
            search the venue or artist → “I went”), then run the button again.
          </p>
          <p className="row">
            <a className="primary" href={eventsUrl}>
              Your events on last.fm ↗
            </a>
            <a className="secondary" href="/">
              Try another year
            </a>
          </p>
        </div>
      ) : (
        <>
          {stats && <StatsPanel stats={stats} />}

          <section className="picker" aria-labelledby="pick-title">
            <div className="picks-bar">
              <div className="picks-head">
                <h2 id="pick-title">
                  {max === 1 ? 'Your concert of the year' : `Your top ${max}`}
                  <span className="muted small">
                    {' '}
                    · {picks.length}/{max}
                  </span>
                </h2>
                <button
                  type="button"
                  className="primary"
                  disabled={picks.length < max}
                  onClick={() => navigate(`/r/${id}/story`)}
                >
                  Make my story →
                </button>
              </div>
              <TopPicks
                slots={slots}
                max={max}
                onMove={(from, to) => update(movePick(picks, from, to))}
                onRemove={(key) => update(picks.filter((p) => p.key !== key))}
                onChoosePhoto={setPhotoFor}
              />
              <p className={`hint${fullHint ? ' show' : ''}`} role="status">
                {fullHint
                  ? `You already have ${max}. Remove one first.`
                  : picks.length < max
                    ? 'Tap concerts to pick them. Drag the cards to change the order.'
                    : 'Drag the cards to change the order.'}
              </p>
            </div>

            <ConcertList
              concerts={payload.concerts}
              photoFor={(c) => optionsFor(c)[0]?.url ?? null}
              rankOf={(key) => {
                const i = picks.findIndex((p) => p.key === key);
                return i >= 0 ? i + 1 : null;
              }}
              onToggle={toggle}
            />
          </section>
        </>
      )}

      {owner && (
        <p className="danger-zone small">
          <button type="button" className="link" onClick={() => void onDelete(owner.token)}>
            Delete this result
          </button>
          <span className="muted"> · removes it from lastfmyear and the link stops working</span>
        </p>
      )}

      {pickerConcert && pickerPick && (
        <PhotoPicker
          title={
            pickerConcert.kind === 'festival'
              ? pickerConcert.title
              : (headliner(pickerConcert) ?? pickerConcert.title)
          }
          options={optionsFor(pickerConcert)}
          current={resolvePhoto(pickerPick, optionsFor(pickerConcert))}
          onPick={(url) => update(setPhoto(picks, pickerPick.key, url))}
          onClose={() => setPhotoFor(null)}
        />
      )}
    </main>
  );
}

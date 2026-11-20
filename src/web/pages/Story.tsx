import { useEffect, useMemo, useState } from 'react';
import type { ImportPayload } from '../../shared/types.ts';
import { STORY_DESIGNS as TEMPLATE_INFO } from '../../story/catalog.ts';
import { api, ApiError } from '../api.ts';
import { DiscoBall } from '../components/DiscoBall.tsx';
import { concertKey, loadPicks, MAX_PICKS, type Pick } from '../picks.ts';
import { canShareFile, saveFile, shareFile, useStoryFile } from '../share.ts';

const TEMPLATE_KEY = 'lastyear:template';

function savedTemplate(): string {
  try {
    const t = localStorage.getItem(TEMPLATE_KEY);
    if (t && TEMPLATE_INFO.some((x) => x.id === t)) return t;
  } catch {
    /* storage unavailable */
  }
  return TEMPLATE_INFO[0]!.id;
}

/** /api/story/<id>.png?t=…&k=…&ph=… — photos only when the user chose one; the server picks otherwise. */
export function storyUrl(id: string, template: string, picks: Pick[], download = false): string {
  const q = new URLSearchParams({ t: template });
  for (const p of picks) {
    q.append('k', p.key);
    q.append('ph', p.photo ?? '');
  }
  if (download) q.set('download', '1');
  return `/api/story/${encodeURIComponent(id)}.png?${q}`;
}

/** Pick a design: every template rendered with your picks (1–3), side by side. */
export function Story({ id }: { id: string }) {
  const [payload, setPayload] = useState<ImportPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [template, setTemplate] = useState(savedTemplate);

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

  const max = Math.min(MAX_PICKS, payload?.concerts.length ?? 0);
  const picks = useMemo(
    () => (payload ? loadPicks(id, new Set(payload.concerts.map(concertKey)), max) : []),
    [payload, id, max],
  );

  const fileUrl = payload && picks.length ? storyUrl(id, template, picks) : null;
  const filename = payload ? `lastyear-${payload.username}-${payload.year}-${template}.png` : 'story.png';
  const { file, state } = useStoryFile(fileUrl, filename);
  const [notice, setNotice] = useState<string | null>(null);

  async function onShare() {
    if (!canShareFile(file)) return;
    const outcome = await shareFile(file, `My top gigs of ${payload?.year ?? ''}`);
    if (outcome === 'failed') {
      saveFile(file);
      setNotice('Sharing did not work here, so the image was saved instead.');
    }
  }

  function choose(t: string) {
    setTemplate(t);
    try {
      localStorage.setItem(TEMPLATE_KEY, t);
    } catch {
      /* ignore */
    }
  }

  if (error) {
    return (
      <main className="page narrow">
        <h1>{error}</h1>
        <p>
          <a href="/">Start over</a>
        </p>
      </main>
    );
  }
  if (!payload) return <DiscoBall className="loading page" label="Loading…" />;

  if (picks.length === 0) {
    return (
      <main className="page narrow">
        <h1>Pick at least one concert first</h1>
        <p>
          <a className="primary" href={`/r/${id}`}>
            ← Back to your concerts
          </a>
        </p>
      </main>
    );
  }

  const chosen = TEMPLATE_INFO.find((t) => t.id === template)!;

  return (
    <main className="page wide">
      <header className="result-head">
        <p className="eyebrow">
          <a href={`/r/${id}`}>
            ← Change picks · {payload.username} · {payload.year}
          </a>
        </p>
        <h1>Pick a design</h1>
      </header>

      <ul className="designs">
        {TEMPLATE_INFO.map((t) => (
          <li key={t.id}>
            <button
              type="button"
              className={t.id === template ? 'design chosen' : 'design'}
              aria-pressed={t.id === template}
              onClick={() => choose(t.id)}
            >
              <StoryPreview
                key={storyUrl(id, t.id, picks)}
                src={storyUrl(id, t.id, picks)}
                alt={`${t.name} story preview`}
              />
              <span className="design-name">{t.name}</span>
              <span className="muted small">{t.description}</span>
            </button>
          </li>
        ))}
      </ul>

      <div className="story-actions">
        {canShareFile(file) ? (
          <>
            <button type="button" className="primary" onClick={onShare}>
              Share “{chosen.name}”…
            </button>
            <button type="button" className="secondary" onClick={() => saveFile(file)}>
              Save image
            </button>
          </>
        ) : file ? (
          <button type="button" className="primary" onClick={() => saveFile(file)}>
            Download “{chosen.name}” PNG
          </button>
        ) : (
          <a
            className="primary"
            href={storyUrl(id, template, picks, true)}
            download
            aria-busy={state === 'loading'}
          >
            {state === 'loading' ? 'Preparing image…' : `Download “${chosen.name}” PNG`}
          </a>
        )}
        <p className="muted small share-hint">
          {notice ??
            (canShareFile(file)
              ? 'Share → Instagram → Story. Or save the image and add it from your gallery.'
              : 'Then add it to your Instagram story from your gallery.')}
        </p>
      </div>
    </main>
  );
}

/** A rendered story preview, with the disco ball spinning until the PNG arrives (renders take seconds). */
function StoryPreview({ src, alt }: { src: string; alt: string }) {
  const [done, setDone] = useState(false);
  return (
    <span className="design-frame">
      <img
        src={src}
        alt={alt}
        width={1080}
        height={1920}
        ref={(img) => {
          if (img?.complete && img.naturalWidth) setDone(true); // already cached
        }}
        onLoad={() => setDone(true)}
        onError={() => setDone(true)}
      />
      {!done && <DiscoBall className="design-loading" label="Rendering…" />}
    </span>
  );
}

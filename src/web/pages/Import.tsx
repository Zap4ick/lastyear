import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { decodePayload } from '../../shared/codec.ts';
import { parseImportPayload } from '../../shared/schema.ts';
import { api } from '../api.ts';
import { rememberResult, savedResult } from '../storage.ts';

/** Landing spot of the bookmarklet: /import#v1.<payload>. Saves the result and moves on to /r/:id. */
export function Import() {
  const [, navigate] = useLocation();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return; // StrictMode runs effects twice in dev
    started.current = true;
    const hash = location.hash;
    // Drop the (long) payload from the address bar and history right away.
    history.replaceState(null, '', '/import');
    (async () => {
      if (!hash || hash.length < 4)
        throw new Error('No concert data in this link. Run the bookmarklet on last.fm.');
      const payload = parseImportPayload(await decodePayload(hash));
      const prev = savedResult(payload.username, payload.year);
      const saved = await api.saveResult(payload, prev);
      rememberResult(payload.username, payload.year, saved.id, saved.token);
      navigate(`/r/${saved.id}`, { replace: true });
    })().catch((e: unknown) => {
      if (e instanceof Error && e.name === 'ZodError')
        setError('The concert data in this link looks damaged.');
      else setError(e instanceof Error ? e.message : String(e));
    });
  }, [navigate]);

  return (
    <main className="page narrow">
      {error && (
        <div className="card">
          <h1>Could not import</h1>
          <p className="error">{error}</p>
          <p>
            <a href="/">Start over</a>
          </p>
        </div>
      )}
    </main>
  );
}

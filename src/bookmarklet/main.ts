/**
 * Bookmarklet entry. Runs inside a last.fm tab, in the user's own browser session:
 * reads the user's public events pages with same-origin fetch, then opens the app with the data
 * in the URL fragment (never sent to any server by the browser).
 */
import { encodePayload } from '../shared/codec.ts';
import type { EventDetails, YearPage } from '../shared/types.ts';
import { collect, CollectError, type Progress } from './collect.ts';
import { Overlay, type OverlayState } from './overlay.ts';

declare const __APP_URL__: string;

interface Instance {
  show(): void;
}
const w = window as unknown as { __lastfmyear?: Instance };

function start() {
  if (!/(^|\.)last\.fm$/.test(location.hostname)) {
    if (confirm('This button works on last.fm. Open last.fm now?')) location.href = 'https://www.last.fm/';
    return;
  }
  if (w.__lastfmyear) return w.__lastfmyear.show(); // tapped twice

  const fromUrl = location.pathname.match(/^\/user\/([^/]+)(?:\/events\/(\d{4}))?/);
  const now = new Date();
  const defaultYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  let username = fromUrl ? decodeURIComponent(fromUrl[1]!) : '';
  let year = fromUrl?.[2] ? Number(fromUrl[2]) : defaultYear;
  let debug = false;
  let controller: AbortController | null = null;
  // Survive "Retry": parsed pages are reused, raw pages kept for the debug download.
  const cache = new Map<string, YearPage | EventDetails>();
  const rawPages = new Map<string, string>();

  const overlay = new Overlay({
    onStart: (u, y, d) => {
      if (!u)
        return render({
          kind: 'form',
          username: u,
          year: y,
          debug: d,
          error: 'Enter your last.fm username.',
        });
      if (!(y >= 2002 && y <= now.getFullYear())) {
        return render({ kind: 'form', username: u, year: y, debug: d, error: 'Pick a year from 2002 on.' });
      }
      if (u.toLowerCase() !== username.toLowerCase() || y !== year) cache.clear();
      username = u;
      year = y;
      debug = d;
      void run();
    },
    onRetry: () => void run(),
    onDownload: () => downloadDebug(username, year, rawPages),
    onClose: () => {
      controller?.abort();
      overlay.remove();
      delete w.__lastfmyear;
    },
  });
  const render = (s: OverlayState) => overlay.render(s);
  w.__lastfmyear = { show: () => render({ kind: 'form', username, year, debug }) };

  async function run() {
    controller?.abort();
    controller = new AbortController();
    render({
      kind: 'progress',
      title: `Reading your ${year} concerts…`,
      detail: 'Opening your events page',
      fraction: null,
    });
    try {
      const payload = await collect(
        { username, year, today: localDate(now) },
        {
          fetchPage: async (path) => {
            const res = await fetch(path, { credentials: 'same-origin' });
            return { status: res.status, html: await res.text() };
          },
          parseHtml: (html) => new DOMParser().parseFromString(html, 'text/html'),
          sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
          onProgress: (p) => render(progressState(p, year)),
          cache,
          rawPages,
          signal: controller.signal,
        },
      );
      const continueUrl = `${__APP_URL__}/import#${await encodePayload(payload)}`;
      render({
        kind: 'done',
        count: payload.concerts.length,
        warnings: payload.warnings,
        continueUrl,
        debug,
      });
      if (!debug) setTimeout(() => (location.href = continueUrl), payload.warnings.length ? 2500 : 600);
    } catch (e) {
      if (e instanceof CollectError && e.code === 'aborted') return;
      if (e instanceof CollectError && e.code === 'user-not-found') {
        return render({
          kind: 'form',
          username,
          year,
          debug,
          error: `No events page for "${username}". Check the username.`,
        });
      }
      const message = e instanceof CollectError ? e.message : `Unexpected error: ${String(e)}`;
      render({ kind: 'error', message, canDownload: rawPages.size > 0 });
    }
  }

  if (fromUrl?.[1] && fromUrl[2]) {
    void run(); // on /user/{u}/events/{year}: nothing to ask
  } else {
    render({ kind: 'form', username, year, debug });
  }
}

function progressState(p: Progress, year: number): OverlayState {
  switch (p.phase) {
    case 'year':
      return {
        kind: 'progress',
        title: `Reading your ${year} concerts…`,
        detail: `Events page ${p.page}`,
        fraction: null,
      };
    case 'events':
      return {
        kind: 'progress',
        title: `Concert ${Math.min(p.done + 1, p.total)} of ${p.total}`,
        detail: p.current || 'Done',
        fraction: p.total ? p.done / p.total : 1,
      };
    case 'waiting':
      return {
        kind: 'progress',
        tone: 'wait',
        title: p.problem === 'rate-limited' ? 'last.fm asks us to slow down' : 'last.fm is busy right now',
        detail: `Trying again in ${p.retryInSec}s (attempt ${p.attempt} of ${p.of})`,
        fraction: null,
      };
  }
}

function localDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function downloadDebug(username: string, year: number, pages: Map<string, string>) {
  const data = {
    username,
    year,
    collectedAt: new Date().toISOString(),
    userAgent: navigator.userAgent,
    pages: Object.fromEntries(pages),
  };
  const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
  const a = Object.assign(document.createElement('a'), {
    href: url,
    download: `lastfmyear-debug-${username}-${year}.json`,
  });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

start();

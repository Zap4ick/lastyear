/**
 * Per-browser memory of the results this browser created, so a re-run of the bookmarklet (e.g. after
 * last.fm paused our requests) can be merged into the same result. Storage may be unavailable
 * (private mode, blocked site data): everything degrades to "no memory".
 */
const KEY = 'lastyear:results';

type Saved = Record<string, { id: string; token: string }>;

function read(): Saved {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Saved;
  } catch {
    return {};
  }
}

const slot = (username: string, year: number) => `${username.toLowerCase()}:${year}`;

export function savedResult(username: string, year: number) {
  return read()[slot(username, year)];
}

export function rememberResult(username: string, year: number, id: string, token: string) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...read(), [slot(username, year)]: { id, token } }));
  } catch {
    /* ignore */
  }
}

export function forgetResult(username: string, year: number) {
  try {
    const all = read();
    delete all[slot(username, year)];
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* ignore */
  }
}

export function lastUsername(): string {
  try {
    return localStorage.getItem('lastyear:username') ?? '';
  } catch {
    return '';
  }
}

export function rememberUsername(name: string) {
  try {
    localStorage.setItem('lastyear:username', name);
  } catch {
    /* ignore */
  }
}

/** The app used to be called lastfmyear: move its saved results, picks and settings to the new keys. */
export function migrateStorage() {
  try {
    for (const old of Object.keys(localStorage).filter((k) => k.startsWith('lastfmyear:'))) {
      const key = 'lastyear:' + old.slice('lastfmyear:'.length);
      if (localStorage.getItem(key) === null) localStorage.setItem(key, localStorage.getItem(old)!);
      localStorage.removeItem(old);
    }
  } catch {
    /* storage unavailable */
  }
}

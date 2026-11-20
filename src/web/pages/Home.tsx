import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError, type LastfmUser } from '../api.ts';
import { BookmarkletLink } from '../components/BookmarkletLink.tsx';
import { lastUsername, rememberUsername } from '../storage.ts';

type Platform = 'desktop' | 'android-chrome' | 'android-other' | 'ios';

function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return 'ios';
  if (/Android/.test(ua))
    return /Chrome\//.test(ua) && !/Vivaldi|SamsungBrowser|OPR|EdgA/.test(ua)
      ? 'android-chrome'
      : 'android-other';
  return 'desktop';
}

const PLATFORMS: Record<Platform, string> = {
  desktop: 'Computer',
  'android-chrome': 'Android · Chrome',
  'android-other': 'Android · Vivaldi & others',
  ios: 'iPhone / iPad',
};

const now = new Date();
const DEFAULT_YEAR = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();

export function Home() {
  const [username, setUsername] = useState(lastUsername);
  const [year, setYear] = useState(DEFAULT_YEAR);
  const [user, setUser] = useState<LastfmUser | null>(null);
  const [confirmed, setConfirmed] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [platform, setPlatform] = useState<Platform>(detectPlatform);
  const [bm, setBm] = useState<{ code: string; https: boolean } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api
      .bookmarklet()
      .then((b) => {
        const https = b.appUrl.startsWith('https://');
        // The short loader needs https (last.fm upgrades http requests); on http (local dev) inline everything.
        setBm({ code: https ? b.loader : b.standalone, https });
      })
      .catch(() => setBm(null));
  }, []);

  async function check(e: FormEvent) {
    e.preventDefault();
    const name = username.trim();
    if (!name) return;
    setChecking(true);
    setError(null);
    try {
      const u = await api.user(name);
      setUser(u);
      setConfirmed(u.name);
      rememberUsername(u.name);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setError(`There is no last.fm user "${name}".`);
        setConfirmed(null);
      } else {
        // Can't verify right now (no API key in dev, Last.fm down): carry on, the bookmarklet will tell.
        setUser(null);
        setConfirmed(name);
        rememberUsername(name);
      }
    } finally {
      setChecking(false);
    }
  }

  async function copy() {
    if (!bm) return;
    try {
      await navigator.clipboard.writeText(bm.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      prompt('Copy this code:', bm.code);
    }
  }

  const eventsUrl = confirmed
    ? `https://www.last.fm/user/${encodeURIComponent(confirmed)}/events/${year}`
    : null;

  return (
    <main className="page">
      <header className="hero">
        <p className="eyebrow">lastfmyear</p>
        <h1>Your year in concerts, as a story</h1>
        <p className="lead">
          Pick your three best gigs of the year from your last.fm history and get a ready-made Instagram story
          with your concert stats.
        </p>
      </header>

      <form className="card user-form" onSubmit={check}>
        <label htmlFor="username">last.fm username</label>
        <div className="row">
          <input
            id="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="your last.fm username"
            required
          />
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} aria-label="Year">
            {Array.from({ length: 6 }, (_, i) => now.getFullYear() - i).map((y) => (
              <option key={y}>{y}</option>
            ))}
          </select>
          <button className="primary" disabled={checking}>
            {checking ? 'Checking…' : 'Continue'}
          </button>
        </div>
        {error && <p className="error">{error}</p>}
        {user && (
          <p className="user-badge">
            {user.image && <img src={user.image} alt="" />}
            <span>
              <b>{user.name}</b> · {user.playcount.toLocaleString('en')} scrobbles
            </span>
          </p>
        )}
      </form>

      {confirmed && eventsUrl && (
        <ol className="steps">
          <li className="card">
            <h2>Add the lastfmyear button</h2>
            <p className="muted">
              A bookmark that reads your concerts from last.fm in your own browser. You only add it once.
            </p>
            <div className="tabs" role="tablist">
              {(Object.keys(PLATFORMS) as Platform[]).map((p) => (
                <button
                  key={p}
                  role="tab"
                  aria-selected={platform === p}
                  className={platform === p ? 'tab active' : 'tab'}
                  onClick={() => setPlatform(p)}
                >
                  {PLATFORMS[p]}
                </button>
              ))}
            </div>
            {!bm ? (
              <p className="error">Could not load the button. Is the server running?</p>
            ) : platform === 'desktop' ? (
              <>
                <p>Drag this button to your bookmarks bar:</p>
                <BookmarkletLink code={bm.code}>lastfmyear</BookmarkletLink>
                <p className="muted small">No bookmarks bar? Press Ctrl+Shift+B (⌘⇧B on Mac).</p>
              </>
            ) : (
              <>
                <ol className="howto">
                  <li>
                    <button className="secondary" onClick={copy}>
                      {copied ? 'Copied ✓' : 'Copy the button code'}
                    </button>
                  </li>
                  <li>Bookmark this page (☆ in the browser menu).</li>
                  <li>
                    Edit that bookmark: name it <b>lastfmyear</b> and replace its address with the copied
                    code.
                  </li>
                </ol>
                {platform === 'android-chrome' && (
                  <p className="note">
                    Chrome won't run it from the bookmarks list. Instead, type <b>lastfmyear</b> in the
                    address bar and tap the bookmark in the suggestions.
                  </p>
                )}
                {platform === 'ios' && <p className="note">Not tested on iPhone yet. Tell us if it works!</p>}
              </>
            )}
            {!bm?.https && bm && (
              <p className="muted small">
                Dev mode: the button contains the whole script and points to this local app.
              </p>
            )}
          </li>

          <li className="card">
            <h2>Open your events page on last.fm</h2>
            <p>
              <a className="primary" href={eventsUrl}>
                last.fm/user/{confirmed}/events/{year} ↗
              </a>
            </p>
          </li>

          <li className="card">
            <h2>Tap the lastfmyear bookmark there</h2>
            <p className="muted">
              It reads your {year} concerts (about a minute: we go slowly so last.fm doesn't block us) and
              brings you back here.
            </p>
          </li>
        </ol>
      )}
    </main>
  );
}

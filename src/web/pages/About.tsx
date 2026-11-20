/** What lastyear reads, stores and shows. Plain list, per the page design rules. */
export function About() {
  return (
    <main className="page narrow about">
      <p className="eyebrow">
        <a href="/">← lastyear</a>
      </p>
      <h1>About</h1>
      <p className="lead">
        An independent fan project that turns the concerts you marked on last.fm into an Instagram story. Not
        affiliated with or endorsed by Last.fm.
      </p>

      <dl className="facts">
        <div>
          <dt>How it reads your concerts</dt>
          <dd>
            The bookmark runs in your own browser, on last.fm, and reads only your public events pages (and
            the event pages they link to) for the year you pick. It never touches your password or account
            settings, and sends nothing anywhere until it brings you back here.
          </dd>
        </div>
        <div>
          <dt>What we store</dt>
          <dd>
            Your username, the year and the concerts (title, date, venue, line-up, photo links): all public on
            last.fm. Nothing else, no account.
          </dd>
        </div>
        <div>
          <dt>Who can see it</dt>
          <dd>Anyone with the link to your result. Results are hidden from search engines.</dd>
        </div>
        <div>
          <dt>How long</dt>
          <dd>
            Until you delete it (from your result page, in the browser you made it in), or automatically after
            about 13 months without an update.
          </dd>
        </div>
        <div>
          <dt>Other lookups</dt>
          <dd>
            Genres and your scrobble chart come from the Last.fm API; missing photos from Deezer. Photos
            belong to their owners.
          </dd>
        </div>
        <div>
          <dt>Cookies and tracking</dt>
          <dd>None. Your browser keeps your picks and the key to delete your result locally.</dd>
        </div>
        <div>
          <dt>Made by</dt>
          <dd>
            <a href="https://lazuk.me" rel="author">
              lazuk.me
            </a>
            <a href="https://github.com/Zap4ick/lastyear">Open source</a>.
          </dd>
        </div>
      </dl>
    </main>
  );
}

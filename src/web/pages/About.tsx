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
            settings. Before reading event pages it asks us, by event number only, which of them other users
            have already read, and skips those. It sends nothing else until it brings you back here.
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
            <br></br>
            <a href="https://github.com/Zap4ick/lastyear">open source</a>
          </dd>
        </div>
      </dl>

      <section className="privacy" aria-labelledby="privacy-title">
        <h2 id="privacy-title">Privacy details</h2>
        <p>
          Answers from the Last.fm API and Deezer are kept for up to 30 days so we don't ask twice. When
          results from at least two different users read the same event page identically, its public details
          (line-up, venue, photo links) are reused for others who went to that event, without saying whose
          results they came from; this stops as soon as those results are deleted. Photos load straight from
          the last.fm and Deezer image servers, which see your IP address like any website does. Server logs
          note which page or API was called and when, never your IP address or username; your IP address is
          held briefly in memory to stop abuse and is never written to disk. The data lives on a Fly.io server
          in Amsterdam, EU; Fly.io is a US company that hosts it for us under its data processing agreement.
          We use it to make the story you ask for and to keep the service running and safe from abuse (GDPR
          Art. 6(1)(b) and (f)).
        </p>
        <p>
          You can ask what we hold about you, have it corrected or deleted, or object to it, including a
          result someone else made with your last.fm username or one you can no longer delete yourself. Get in
          touch via <a href="https://lazuk.me">lazuk.me</a>; we answer within a month. You can also complain
          to your data protection authority.
        </p>
      </section>
    </main>
  );
}

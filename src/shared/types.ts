/** A concert as listed on a user's /user/{u}/events/{year} page. */
export interface YearPageEvent {
  /** Numeric last.fm id (events and festivals have separate id spaces, so pair it with `kind`). */
  id: string;
  kind: 'event' | 'festival';
  /** Site-relative URL, e.g. "/event/4845372+Marilyn+Manson+at+…" or "/festival/4935597+Grauzone+Festival+2026". */
  url: string;
  /** Local date, "YYYY-MM-DD". */
  date: string;
  /** Event title: often the headliner, but can be a tour or festival name ("Oasis Live '25"). */
  title: string;
  /** Names from the "lineup" line. Sometimes includes the headliner, sometimes only support acts. */
  lineup: string[];
  venue: string;
  city: string;
  country: string;
  /** Raw status cell text; empty for plain "went". Kept so we can filter "interested" once we see one. */
  status: string;
}

export interface YearPage {
  username: string;
  year: number;
  /** The "Went To" counter from the page header, if present (total for the year, across all pages). */
  wentTo: number | null;
  events: YearPageEvent[];
  /** The page is paginated at 30 events; site-relative URL of the next page, or null on the last one. */
  nextPageUrl: string | null;
}

export interface Performer {
  name: string;
  /** Site-relative artist URL, e.g. "/music/Oasis". */
  url: string;
  /** Full-size artist image (ar0), or null when last.fm shows a placeholder. */
  imageUrl: string | null;
}

/** Details from an /event/… or /festival/… page. */
export interface EventDetails {
  title: string;
  /** Local date, "YYYY-MM-DD". */
  date: string;
  /**
   * Line-up as shown on the page. For events the headliner comes first.
   * Festivals are different: alphabetical, and truncated (see `lineupTotal`), so there is no headliner.
   */
  performers: Performer[];
  /** The number in the "Line-up (N)" heading; larger than performers.length when truncated. */
  lineupTotal: number | null;
  /** Full-size header image (ar0) shown behind the event title. */
  headerImageUrl: string | null;
  venue: {
    name: string;
    street: string | null;
    city: string | null;
    country: string | null;
  } | null;
}

/** A concert after merging the year-page row with its event page. */
export interface Concert extends YearPageEvent {
  /** null when the event page could not be loaded (the row data is still usable). */
  details: EventDetails | null;
}

/** What the bookmarklet hands to the app (via the URL fragment of /import). */
export interface ImportPayload {
  v: 1;
  username: string;
  year: number;
  /** ISO timestamp of collection. */
  collectedAt: string;
  /** "Went To" counter from the year page; compare with concerts.length. */
  wentTo: number | null;
  /** Past concerts of the year, in date order. Upcoming ones are left out. */
  concerts: Concert[];
  /** Human-readable notes about anything incomplete (e.g. an event page that kept failing). */
  warnings: string[];
}

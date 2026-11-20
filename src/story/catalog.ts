/**
 * The list of story designs the web app shows. Deliberately free of template code: the browser never
 * needs the Satori JSX, and a half-edited template must not break the page. A test keeps this list in
 * sync with `templates/index.ts`. The first entry is the default.
 */
export const STORY_DESIGNS = [
  { id: 'swiss', name: 'Swiss', description: 'White, Helvetica, strict grid' },
  { id: 'bauhaus', name: 'Bauhaus', description: 'Primary colours, circle, square and arch' },
  { id: 'collage', name: 'Collage', description: 'Postmodern cut-and-paste, loud on purpose' },
  { id: 'poster', name: 'Poster', description: 'Your #1 full-screen, Helvetica on top' },
  { id: 'bands', name: 'Bands', description: 'Three black-and-white photo bands, dark' },
  { id: 'headliner', name: 'Headliner', description: 'Your #1 as a full-bleed poster, the rest below' },
  { id: 'index', name: 'Index', description: 'Light paper, big red year, a ruled list' },
  { id: 'columns', name: 'Columns', description: 'Last.fm red, three tall b/w columns' },
] as const;

export type StoryDesign = (typeof STORY_DESIGNS)[number];

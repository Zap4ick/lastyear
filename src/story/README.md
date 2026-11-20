# Story templates: how to write one

Each design is one file in `templates/`, rendered on the server: JSX → Satori (SVG) → resvg (PNG,
1080×1920). Register it in `templates/index.ts` **and** `catalog.ts` (the web app's list; a test keeps
them in sync). The browser never imports template code.

## Canvas

- `W`×`H` = 1080×1920. Instagram's UI covers about the top 250 px and the bottom 340 px: keep all
  text between `SAFE_TOP` and `SAFE_BOTTOM` (`template.ts`). Photos and shapes may bleed.
- The renderer adds "made with lastyear.fly.dev" (the public host) at `CREDIT_TOP`, just under
  `SAFE_BOTTOM`, at the template's `credit.left`. Each template sets the `credit` style (font, quiet
  color, optional label `background` if its decoration can run under the line). Keep that strip clear.
- Every template with a computed layout has a test asserting its content ends above `SAFE_BOTTOM`
  for short names, very long names, Cyrillic, and 1/2/3 picks (see `templates/swiss.test.ts`).

## Data (`data.ts`)

- Up to 3 concerts: `name` (headliner or festival), `dateLabel`, `venue`, `city`, `photo`.
- `picksLabel`: "Top gigs of the year" (no count, the story shows how many) or "Gig of the year".
- `totalLabel`: "1 concert" / "47 concerts". Never write `${d.total} concerts` (a test checks).
- `facts`: up to 4, never empty; show none rather than a blank.
- All text on images is English.

## Satori, the parts that bite

- Flexbox only: no grid, no CSS filters. Inline styles only. **Every element with more than one
  child needs `display: 'flex'`.**
- `transform: rotate()`, `borderRadius`, gradients, `boxShadow`, `textShadow`, `lineClamp`,
  `textOverflow: 'ellipsis'` work.
- **Padding and borders are added on top of an explicit `height`/`width`** (content-box): a
  `height: 100` box with `padding: 20` is 140 px tall. Use `boxSizing: 'border-box'` to keep 100.
- A word wider than its box is not broken: the text overflows (the box grows to that word).

## Fonts (`fonts.ts`)

Satori does not fall back between fonts that share a name, so every Unicode subset (latin,
latin-ext, cyrillic) is registered under its own name. **Always use the family constants**
(`DISPLAY` Unbounded 800, `TEXT` Inter 400/700, `MONO` JetBrains Mono 400/700, `HELVETICA` Arimo
400/700, `GEOMETRIC` Jost 500/700), never a bare name, or Cyrillic and Polish letters turn into boxes.
A new font or weight goes into `FONT_FILES`.

## Measuring text (`measure.ts`)

Satori can't tell you how big text came out, so layouts are computed before rendering. Use
`textWidth`, `wrapText`, `lineCount`, `fitSize` with the same font, weight, size and letter-spacing
the text is drawn with. They read the real glyph metrics and follow Satori's line breaking;
`measure.test.ts` checks them against Satori itself (exact on the reference set, never fewer lines
on every real concert title). Don't hand-roll average-glyph-width estimates.

What Satori does, as found while building it: UAX #14 break opportunities; letter-spacing counted
per character, negative too; each word measured on its own (no kerning across words); trailing
spaces hang; a too-wide word widens the box.

## Photos

`photo(rank, data)` returns `{ width, height, mode }` per concert; the server fetches the image
(only from the last.fm and Deezer CDNs), crops to that size around the most salient area and applies
`mode`: `'color'`, `'mono'`, or `'red'` (red duotone). `photos[i]` is then a data URI, or `null`:
design a placeholder (e.g. the name's first letter) rather than an empty box.

## Workflow

```bash
npm run render:edge -- --t=<id>                          # awkward data → .dev/stories/<id>-edge.png
npm run render:stories -- --result=<result id> --t=<id>  # real data → .dev/stories/<id>.png
npx vitest run src/story
```

Look at both PNGs after every change.

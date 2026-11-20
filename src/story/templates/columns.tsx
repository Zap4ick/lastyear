/**
 * Last.fm red poster: tall black-and-white columns side by side, names underneath, facts below.
 *
 * Satori can't measure text, so the layout is computed up front: names and venues are word-wrapped
 * with an average glyph width, long names get a smaller size and a third line, and the photos get
 * whatever height is left, so the facts always flow under the tallest caption and end above
 * Instagram's bottom UI.
 */
import type { StoryConcert, StoryData } from '../data.ts';
import { DISPLAY, MONO, TEXT } from '../fonts.ts';
import { lineCount as measureLines } from '../measure.ts';
import { H, SAFE_BOTTOM, SAFE_TOP, W, type StoryTemplate } from '../template.ts';
import { oneLine, pad2, Photo, RED } from './parts.tsx';

const X = 60;
const GAP = 14;
const INNER = W - 2 * X;
const DARK = '#8e0b05';

// Header, top to bottom (px).
const YEAR_FS = 230;
const YEAR_H = Math.round(YEAR_FS * 0.86);
const SUB_FS = 32;
const LABEL_FS = 24;
const PHOTOS_TOP = SAFE_TOP + YEAR_H + 22 + SUB_FS * 1.2 + 34 + LABEL_FS * 1.2 + 16;

// Caption under each column.
const NAME_TOP = 22;
const NAME_LH = 1.1;
const DATE_FS = 22;
const DATE_TOP = 12;
const DATE_H = DATE_TOP + DATE_FS * 1.2;
const VENUE_TOP = 6;
const VENUE_LH = 1.25;

// Facts.
const FACTS_TOP = 48;
const FACT_FS = 28;
const FACT_ROW = FACT_FS * 1.3;
const FACT_GAP = 10;
const MAX_FACTS = 3;

/** Per pick count: name size (normal, shrunk), venue size, photo height (min, max). */
const SPEC = {
  1: { name: [64, 52], venue: 30, minH: 420, maxH: 760 },
  2: { name: [48, 40], venue: 26, minH: 420, maxH: 700 },
  3: { name: [38, 32], venue: 24, minH: 420, maxH: 650 },
} as const;

export const colWidth = (n: number) => Math.floor((INNER - GAP * (Math.max(n, 1) - 1)) / Math.max(n, 1));

/** Lines Satori wraps a caption into: names are Inter bold (tracked -0.5), venues Inter regular. */
export function lineCount(text: string, fontSize: number, width: number, weight: 400 | 700 = 700): number {
  return measureLines(
    text,
    { font: TEXT, weight, size: fontSize, letterSpacing: weight === 700 ? -0.5 : 0 },
    width,
  );
}

const venueText = (c: StoryConcert) => (c.city ? `${c.venue}, ${c.city}` : c.venue);

export function columnsLayout(d: StoryData) {
  const n = Math.min(Math.max(d.concerts.length, 1), 3) as 1 | 2 | 3;
  const spec = SPEC[n];
  const w = colWidth(n);

  // One name size for the whole row, so the dates line up: shrink every name when any of them
  // would need a third line at full size, and let the shrunk ones take up to three lines.
  const fits = d.concerts.every((c) => lineCount(c.name, spec.name[0], w) <= 2);
  const nameFs = fits ? spec.name[0] : spec.name[1];
  const captions = d.concerts.map((c) => ({
    nameLines: Math.min(fits ? 2 : 3, lineCount(c.name, nameFs, w)),
    venueLines: Math.min(2, lineCount(venueText(c), spec.venue, w, 400)),
  }));
  const nameLines = Math.max(1, ...captions.map((c) => c.nameLines));
  const nameH = Math.ceil(nameLines * nameFs * NAME_LH);
  const venueLines = Math.max(1, ...captions.map((c) => c.venueLines));
  const captionH = Math.ceil(NAME_TOP + nameH + DATE_H + VENUE_TOP + venueLines * spec.venue * VENUE_LH);

  const facts = d.facts.slice(0, MAX_FACTS);
  const factsH = facts.length ? FACTS_TOP + facts.length * FACT_ROW + (facts.length - 1) * FACT_GAP : 0;

  const room = Math.floor(SAFE_BOTTOM - PHOTOS_TOP - captionH - factsH);
  const colH = Math.max(spec.minH, Math.min(spec.maxH, room));
  const contentBottom = PHOTOS_TOP + colH + captionH + factsH;
  return { n, w, colH, nameFs, nameH, venueFs: spec.venue, captions, captionH, facts, contentBottom };
}

/** No photo: a darker red slab with the name's initial, so the column still reads as a column. */
function Placeholder({ name, width, height }: { name: string; width: number; height: number }) {
  const size = Math.round(Math.min(width * 0.8, height * 0.55));
  return (
    <div
      style={{ display: 'flex', position: 'relative', width, height, background: DARK, overflow: 'hidden' }}
    >
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          left: Math.round(size * 0.08),
          bottom: Math.round(size * 0.1),
          fontFamily: DISPLAY,
          fontSize: size,
          lineHeight: 1,
          color: RED,
        }}
      >
        {[...name.trim()][0]?.toUpperCase() ?? '•'}
      </div>
    </div>
  );
}

export const columns: StoryTemplate = {
  id: 'columns',
  name: 'Columns',
  description: 'Last.fm red, three tall b/w columns',
  photo: (_rank, d) => {
    const { w, colH } = columnsLayout(d);
    return { width: w, height: colH, mode: 'mono' };
  },
  render: (d: StoryData, photos) => {
    const { w, colH, nameFs, nameH, venueFs, captions, captionH, facts } = columnsLayout(d);
    return (
      <div
        style={{
          width: W,
          height: H,
          display: 'flex',
          flexDirection: 'column',
          background: RED,
          color: '#fff',
          fontFamily: TEXT,
          padding: `${SAFE_TOP}px ${X}px 0`,
        }}
      >
        <div
          style={{
            display: 'flex',
            height: YEAR_H,
            alignItems: 'flex-end',
            fontFamily: DISPLAY,
            fontSize: YEAR_FS,
            lineHeight: 0.86,
            letterSpacing: -8,
            marginLeft: -6,
          }}
        >
          {d.year}
        </div>
        <div style={{ display: 'flex', fontSize: SUB_FS, lineHeight: 1.2, fontWeight: 700, marginTop: 22 }}>
          {`${d.totalLabel} · @${d.username}`}
        </div>

        <div
          style={{
            display: 'flex',
            marginTop: 34,
            fontFamily: MONO,
            fontWeight: 700,
            fontSize: LABEL_FS,
            lineHeight: 1.2,
            letterSpacing: 3,
            textTransform: 'uppercase',
          }}
        >
          {d.picksLabel}
        </div>

        <div style={{ display: 'flex', marginTop: 16, gap: GAP, height: colH + captionH }}>
          {d.concerts.map((c, i) => {
            const cap = captions[i]!;
            const src = photos[i] ?? null;
            return (
              <div key={c.rank} style={{ display: 'flex', flexDirection: 'column', width: w }}>
                <div
                  style={{
                    display: 'flex',
                    position: 'relative',
                    width: w,
                    height: colH,
                    overflow: 'hidden',
                  }}
                >
                  {src ? (
                    <Photo src={src} width={w} height={colH} />
                  ) : (
                    <Placeholder name={c.name} width={w} height={colH} />
                  )}
                  {/* Rank on a solid red tab: readable on white posters and black stages alike. */}
                  <div
                    style={{
                      display: 'flex',
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      padding: '10px 14px 8px',
                      background: RED,
                      fontFamily: MONO,
                      fontWeight: 700,
                      fontSize: 30,
                      lineHeight: 1,
                      color: '#fff',
                    }}
                  >
                    {pad2(c.rank)}
                  </div>
                </div>
                <div
                  style={{
                    display: 'block',
                    lineClamp: cap.nameLines,
                    overflow: 'hidden',
                    fontWeight: 700,
                    height: nameH,
                    fontSize: nameFs,
                    lineHeight: NAME_LH,
                    letterSpacing: -0.5,
                    marginTop: NAME_TOP,
                  }}
                >
                  {c.name}
                </div>
                <div
                  style={{
                    display: 'flex',
                    fontFamily: MONO,
                    fontSize: DATE_FS,
                    lineHeight: 1.2,
                    letterSpacing: 1,
                    textTransform: 'uppercase',
                    marginTop: DATE_TOP,
                    opacity: 0.85,
                  }}
                >
                  {c.dateLabel}
                </div>
                <div
                  style={{
                    display: 'block',
                    lineClamp: cap.venueLines,
                    overflow: 'hidden',
                    fontSize: venueFs,
                    lineHeight: VENUE_LH,
                    marginTop: VENUE_TOP,
                    opacity: 0.85,
                  }}
                >
                  {venueText(c)}
                </div>
              </div>
            );
          })}
        </div>

        {facts.length ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              width: INNER,
              marginTop: FACTS_TOP,
              gap: FACT_GAP,
            }}
          >
            {facts.map((f) => (
              <div
                key={f.label}
                style={{ display: 'flex', width: INNER, fontSize: FACT_FS, lineHeight: 1.3 }}
              >
                <div style={{ display: 'flex', flexShrink: 0, opacity: 0.75, marginRight: 14 }}>
                  {f.label}
                </div>
                <div style={{ ...oneLine, flexShrink: 1, minWidth: 0, fontWeight: 700 }}>{f.value}</div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    );
  },
};

/**
 * International Typographic Style: white, black Helvetica (Arimo), strict grid, red only for numerals.
 * The year set across the full measure, a row of b/w photos, a numbered list, facts in a two-column grid.
 *
 * Type system: one display size (the year), one name size (names and their numerals share it, so cap
 * heights and baselines line up), and one text size (28) where weight alone carries the hierarchy.
 * Thick rules open sections, thin rules separate items. Vertical spacing sits on an 8 px unit.
 *
 * Satori can't measure text, so the layout is computed up front: names are estimated to one or two
 * lines, the photos take what is left, and the year gives up size first when the list runs long, so
 * the list and facts always end above Instagram's bottom UI.
 */
import type { StoryConcert, StoryData } from '../data.ts';
import { HELVETICA } from '../fonts.ts';
import { lineCount } from '../measure.ts';
import { H, SAFE_BOTTOM, SAFE_TOP, W, type StoryTemplate } from '../template.ts';
import { clamp, meta, oneLine, RED } from './parts.tsx';

const X = 72;
const INNER = W - 2 * X;
const GUTTER = 24;
const HALF = INNER / 2;
const NUM = 80;
const NAME_W = INNER - NUM;

/** Arimo metrics (Arial-compatible), in em. */
const ASCENT = 0.905;
const DESCENT = 0.212;
const CAP = 0.716;
/** Distance from the top of a line box to the cap top, for a given line height. */
const capTop = (lineHeight: number) => (lineHeight - ASCENT - DESCENT) / 2 + ASCENT - CAP;

// The year: line box as tall as the figures, tight tracking, sized to fill the measure.
const YEAR_LH = 0.72;
const YEAR_TRACK = -0.05; // em
/** Four tabular figures (0.556 em each) minus tracking and the outer side bearings. */
const YEAR_EM = 4 * 0.556 + 3 * YEAR_TRACK - 0.065;
const YEAR_MAX = Math.floor(INNER / YEAR_EM);
const YEAR_MIN = 320;

// Text and rules (px).
const TEXT = 28;
const TEXT_LH = 1.2;
const TEXT_H = TEXT * TEXT_LH;
const SMALL = 22;
const THICK = 6;
const THIN = 2;
const SECTION = 32;

const HEAD_H = THICK + 14 + TEXT_H; // rule + "Top gigs of the year" · @user · 47 concerts
const LIST_GAP = 24;
const NAME_LH = 1.02;
const ROW_PAD = [16, 20] as const;
const META_GAP = 6;
const FACT_ROW = 84;
const FACT_PAD = 14;

/** Lines a name takes, measured with the real font and the same tracking it is drawn with (../measure.ts). */
const lines = (text: string, fontSize: number, width: number) =>
  lineCount(text, { font: HELVETICA, weight: 700, size: fontSize, letterSpacing: -0.025 * fontSize }, width);

function nameStyle(c: StoryConcert, base: number) {
  // Shrink names that would need a third line at full size; clamp to two lines either way.
  const fontSize = lines(c.name, base, NAME_W) > 2 ? Math.round(base * 0.85) : base;
  return { fontSize, lines: Math.min(2, lines(c.name, fontSize, NAME_W)) };
}

export function swissLayout(d: StoryData) {
  const n = Math.max(d.concerts.length, 1);
  // A single gig gets a bigger name; numerals always use the row's base size.
  const numFs = n === 1 ? 68 : 52;
  const rows = d.concerts.map((c) => {
    const s = nameStyle(c, numFs);
    return {
      ...s,
      numFs,
      height: THIN + ROW_PAD[0] + s.lines * s.fontSize * NAME_LH + META_GAP + TEXT_H + ROW_PAD[1],
    };
  });
  const listH = rows.reduce((a, r) => a + r.height, 0);
  const factsH = d.facts.length ? SECTION + THICK + Math.ceil(d.facts.length / 2) * FACT_ROW : 0;
  const fixedH = SECTION + HEAD_H + SECTION + LIST_GAP + listH + factsH;

  // Three: squares at most. Two: side by side, landscape. One: full width.
  const photoW = n === 1 ? INNER : Math.floor((INNER - GUTTER * (n - 1)) / n);
  const maxH = n === 3 ? photoW : n === 2 ? 420 : 640;
  // Below this the photos stop reading as photos, so the year shrinks before they do.
  const comfortH = Math.round(n === 3 ? photoW * 0.75 : n === 2 ? 280 : 420);

  const roomFor = (yearFs: number) => SAFE_BOTTOM - SAFE_TOP - yearFs * YEAR_LH - fixedH;
  const deficit = comfortH - roomFor(YEAR_MAX);
  const yearFs = deficit > 0 ? Math.max(YEAR_MIN, Math.floor(YEAR_MAX - deficit / YEAR_LH)) : YEAR_MAX;
  const photoH = Math.max(180, Math.min(maxH, Math.floor(roomFor(yearFs))));

  const photosTop = SAFE_TOP + yearFs * YEAR_LH + SECTION + HEAD_H + SECTION;
  const contentBottom = photosTop + photoH + LIST_GAP + listH + factsH;
  return { yearFs, rows, photoW, photoH, photosTop, contentBottom };
}

/**
 * No photo: the name's first letter, as tall as the block allows (equal insets top, left and bottom),
 * black on pale grey so it sits in the b/w photo row without a new colour.
 */
function Placeholder({ name, width, height }: { name: string; width: number; height: number }) {
  const inset = Math.round(Math.min(width, height) * 0.08);
  // Cap height fills the block; a wide letter (W, Ж ~1 em) still fits the width.
  const fontSize = Math.floor(Math.min((height - 2 * inset) / CAP, width - 2 * inset));
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-end',
        // Satori sizes boxes content-box: subtract the padding so the block matches the photos.
        width: width - inset,
        height: height - inset,
        background: '#e8e8e8',
        padding: `0 0 ${inset}px ${inset}px`,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          fontWeight: 700,
          fontSize,
          lineHeight: YEAR_LH,
          // Optical margin, as for the year: the letter's side bearing, not its box, meets the inset.
          marginLeft: -Math.round(fontSize * 0.07),
        }}
      >
        {[...name.trim()][0]?.toUpperCase() ?? '•'}
      </div>
    </div>
  );
}

export const swiss: StoryTemplate = {
  credit: { left: X, color: '#8e8e8e', fontFamily: HELVETICA, fontSize: 24 },
  id: 'swiss',
  name: 'Swiss',
  description: 'White, Helvetica, strict grid',
  photo: (_rank, d) => {
    const { photoW, photoH } = swissLayout(d);
    return { width: photoW, height: photoH, mode: 'mono' };
  },
  render: (d: StoryData, photos) => {
    const { yearFs, rows, photoW, photoH } = swissLayout(d);
    return (
      <div
        style={{
          width: W,
          height: H,
          display: 'flex',
          flexDirection: 'column',
          background: '#fff',
          color: '#000',
          fontFamily: HELVETICA,
          padding: `${SAFE_TOP}px ${X}px 0`,
        }}
      >
        <div
          style={{
            display: 'flex',
            height: Math.round(yearFs * YEAR_LH),
            fontWeight: 700,
            fontSize: yearFs,
            lineHeight: YEAR_LH,
            letterSpacing: yearFs * YEAR_TRACK,
            whiteSpace: 'nowrap',
            // Optical margin: pull the first figure's side bearing out to the grid line.
            marginLeft: -Math.round(yearFs * 0.035),
          }}
        >
          {d.year}
        </div>

        <div
          style={{
            display: 'flex',
            width: INNER,
            borderTop: `${THICK}px solid #000`,
            marginTop: SECTION,
            paddingTop: 14,
            fontSize: TEXT,
            lineHeight: TEXT_LH,
          }}
        >
          <div style={{ ...oneLine, width: HALF - GUTTER, marginRight: GUTTER, fontWeight: 700 }}>
            {d.picksLabel}
          </div>
          <div style={{ display: 'flex', width: HALF, justifyContent: 'space-between' }}>
            <div style={{ ...oneLine, maxWidth: HALF - 200 }}>{`@${d.username}`}</div>
            <div style={{ display: 'flex' }}>{d.totalLabel}</div>
          </div>
        </div>

        <div style={{ display: 'flex', width: INNER, gap: GUTTER, marginTop: SECTION }}>
          {d.concerts.map((c, i) => {
            const src = photos[i];
            return src ? (
              <img
                key={c.rank}
                src={src}
                width={photoW}
                height={photoH}
                style={{ width: photoW, height: photoH, objectFit: 'cover' }}
              />
            ) : (
              <Placeholder key={c.rank} name={c.name} width={photoW} height={photoH} />
            );
          })}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', width: INNER, marginTop: LIST_GAP }}>
          {d.concerts.map((c, i) => {
            const r = rows[i]!;
            return (
              <div
                key={c.rank}
                style={{
                  display: 'flex',
                  width: INNER,
                  alignItems: 'flex-start',
                  borderTop: `${THIN}px solid #000`,
                  padding: `${ROW_PAD[0]}px 0 ${ROW_PAD[1]}px`,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    width: NUM,
                    fontWeight: 700,
                    fontSize: r.numFs,
                    lineHeight: NAME_LH,
                    color: RED,
                    // Same cap top as the name, even when the name is set smaller.
                    marginTop: Math.round(capTop(NAME_LH) * (r.fontSize - r.numFs)),
                  }}
                >
                  {c.rank}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', width: NAME_W }}>
                  <div
                    style={{
                      ...clamp(2),
                      fontWeight: 700,
                      fontSize: r.fontSize,
                      lineHeight: NAME_LH,
                      letterSpacing: -0.025 * r.fontSize,
                    }}
                  >
                    {c.name}
                  </div>
                  <div style={{ ...oneLine, fontSize: TEXT, lineHeight: TEXT_LH, marginTop: META_GAP }}>
                    {meta(c)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {d.facts.length > 0 && (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              width: INNER,
              marginTop: SECTION,
              borderTop: `${THICK}px solid #000`,
            }}
          >
            {d.facts.map((f, i) => {
              // Thin rules between rows, broken at the column gutter.
              const left = i % 2 === 0;
              return (
                <div
                  key={f.label}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    width: left ? HALF - GUTTER : HALF,
                    marginRight: left ? GUTTER : 0,
                    // Content-box: rule + padding + content add up to FACT_ROW.
                    height: FACT_ROW - FACT_PAD - (i >= 2 ? THIN : 0),
                    paddingTop: FACT_PAD,
                    borderTop: i >= 2 ? `${THIN}px solid #000` : 'none',
                  }}
                >
                  <div style={{ display: 'flex', fontSize: SMALL, lineHeight: TEXT_LH, fontWeight: 700 }}>
                    {f.label}
                  </div>
                  <div style={{ ...oneLine, fontSize: TEXT, lineHeight: TEXT_LH }}>{f.value}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  },
};

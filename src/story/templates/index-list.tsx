/**
 * Light, typographic: a huge red year, the picks as a ruled index with b/w photos bleeding off the
 * right edge, facts as a list of mono labels.
 *
 * Satori can't measure text, so the layout is computed up front: the rows share whatever height is
 * left between the header and the facts, the photos fill their rows, and the names get one size for
 * the whole list, the largest at which every name fits its row (estimated from Unbounded's glyph
 * widths). One pick becomes a single row with a large photo under its name.
 */
import type { StoryData } from '../data.ts';
import { DISPLAY, MONO, TEXT } from '../fonts.ts';
import { lineCount } from '../measure.ts';
import { H, SAFE_BOTTOM, SAFE_TOP, W, type StoryTemplate } from '../template.ts';
import { clamp, meta, oneLine, pad2, Photo, RED } from './parts.tsx';

const X = 72;
const INNER = W - 2 * X;
const INK = '#141414';
const PAPER = '#f2efe8';
const GREY = '#5f5b54';
const RULE = 3;

// Header, top to bottom (px).
const YEAR_FS = 280;
const YEAR_H = Math.round(YEAR_FS * 0.8);
const SUB_FS = 34;
const SUB_TOP = 30;
const LABEL_FS = 22;
const LABEL_TOP = 46;
const LIST_TOP = SAFE_TOP + YEAR_H + SUB_TOP + SUB_FS * 1.2 + LABEL_TOP + LABEL_FS * 1.2 + 14;

// A row: rank | name over meta | photo to the canvas edge.
const NUM = 72;
const COL_GAP = 36;
const PAD_TOP = 22;
const PAD_BOTTOM = 22;
const META_FS = 26;
const META_H = META_FS * 1.2;
const NAME_GAP = 14;
const NAME_LH = 1.08;
const MAX_LINES = 3;

// Facts.
const FACTS_TOP = 40;
const FACT_ROW = 46;
const LABEL_W = 280;

/** Lines a name wraps to in Unbounded at a font size and width, measured like Satori (../measure.ts). */
export function nameLines(name: string, fontSize: number, width: number) {
  return lineCount(name, { font: DISPLAY, weight: 800, size: fontSize }, width);
}

const fontFits = (names: string[], fontSize: number, width: number, height: number) => {
  const lines = Math.max(...names.map((n) => nameLines(n, fontSize, width)));
  return lines <= MAX_LINES && lines * fontSize * NAME_LH <= height ? lines : 0;
};

/** The largest size from `sizes` at which every name fits; else the smallest, clamped. */
function nameSize(names: string[], sizes: number[], width: number, height: number) {
  for (const fontSize of sizes) {
    const lines = fontFits(names, fontSize, width, height);
    if (lines) return { fontSize, lines };
  }
  const fontSize = sizes.at(-1)!;
  return { fontSize, lines: Math.max(1, Math.min(MAX_LINES, Math.floor(height / (fontSize * NAME_LH)))) };
}

export function indexLayout(d: StoryData) {
  const n = Math.max(d.concerts.length, 1);
  const names = d.concerts.map((c) => c.name);
  const factsH = d.facts.length ? FACTS_TOP + d.facts.length * FACT_ROW : 0;
  // Rows share the room; each has a top rule, the list has one more at the bottom.
  const room = SAFE_BOTTOM - LIST_TOP - factsH - RULE;

  if (n === 1) {
    // One pick: rank and name on top, a large photo under the name, out to the canvas edge.
    const nameW = INNER - NUM;
    const { fontSize, lines } = nameSize(names, [84, 72, 64, 56, 50, 44], nameW, 3 * 84 * NAME_LH);
    const textH = PAD_TOP + lines * fontSize * NAME_LH + NAME_GAP + META_H + 30;
    const photoW = W - X - NUM;
    const photoH = Math.min(760, Math.floor(room - RULE - textH));
    const rowH = Math.floor(textH + photoH);
    return {
      single: true,
      rowH,
      nameW,
      fontSize,
      lines,
      photoW,
      photoH,
      contentBottom: LIST_TOP + RULE + rowH + RULE + factsH,
    };
  }

  // Two or three: equal rows, the photo fills the row's height on the right.
  const rowH = Math.min(n === 2 ? 420 : 300, Math.floor(room / n - RULE));
  const photoW = 300;
  const nameW = W - X - NUM - COL_GAP - photoW - COL_GAP;
  const textRoom = rowH - PAD_TOP - PAD_BOTTOM - META_H - NAME_GAP;
  const { fontSize, lines } = nameSize(names, [64, 56, 50, 44, 40, 36], nameW, textRoom);
  return {
    single: false,
    rowH,
    nameW,
    fontSize,
    lines,
    photoW,
    photoH: rowH,
    contentBottom: LIST_TOP + n * (RULE + rowH) + RULE + factsH,
  };
}

/** No photo: a quiet block with the name's initial, cropped by the edges. */
function Placeholder({ name, width, height }: { name: string; width: number; height: number }) {
  const size = Math.round(Math.min(width * 1.1, height * 1.25));
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-end',
        width,
        height,
        background: '#e4e0d7',
        color: '#d3cec3',
        fontFamily: DISPLAY,
        fontSize: size,
        lineHeight: 0.74,
        paddingLeft: Math.round(size * 0.06),
        overflow: 'hidden',
      }}
    >
      {[...name.trim()][0]?.toUpperCase() ?? '•'}
    </div>
  );
}

export const indexList: StoryTemplate = {
  credit: { left: X, color: GREY, fontFamily: MONO, fontSize: 20, letterSpacing: 2, uppercase: true },
  id: 'index',
  name: 'Index',
  description: 'Light paper, big red year, a ruled list',
  photo: (_rank, d) => {
    const { photoW, photoH } = indexLayout(d);
    return { width: photoW, height: photoH, mode: 'mono' };
  },
  render: (d: StoryData, photos) => {
    const l = indexLayout(d);
    const nameLH = Math.round(l.fontSize * NAME_LH);
    const rankFS = Math.max(30, Math.round(l.fontSize * 0.56));
    const picture = (i: number) =>
      photos[i] ? (
        <Photo src={photos[i]} width={l.photoW} height={l.photoH} />
      ) : (
        <Placeholder name={d.concerts[i]?.name ?? ''} width={l.photoW} height={l.photoH} />
      );

    return (
      <div
        style={{
          width: W,
          height: H,
          display: 'flex',
          flexDirection: 'column',
          background: PAPER,
          color: INK,
          fontFamily: TEXT,
          paddingTop: SAFE_TOP,
          paddingLeft: X,
        }}
      >
        <div
          style={{
            display: 'flex',
            height: YEAR_H,
            alignItems: 'center',
            fontFamily: DISPLAY,
            fontSize: YEAR_FS,
            lineHeight: 0.8,
            letterSpacing: -12,
            marginLeft: -6,
            color: RED,
          }}
        >
          {d.year}
        </div>
        <div
          style={{
            display: 'flex',
            width: INNER,
            marginTop: SUB_TOP,
            fontSize: SUB_FS,
            lineHeight: 1.2,
            fontWeight: 700,
          }}
        >
          {`@${d.username} — ${d.totalLabel}`}
        </div>

        <div
          style={{
            display: 'flex',
            marginTop: LABEL_TOP,
            fontFamily: MONO,
            fontSize: LABEL_FS,
            lineHeight: 1.2,
            letterSpacing: 2,
            textTransform: 'uppercase',
            color: RED,
          }}
        >
          {d.picksLabel}
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            width: W - X,
            marginTop: 14,
            borderBottom: `${RULE}px solid ${INK}`,
          }}
        >
          {d.concerts.map((c, i) => {
            const rank = (
              <div
                style={{
                  display: 'flex',
                  width: NUM,
                  height: nameLH,
                  alignItems: 'center',
                  fontFamily: MONO,
                  fontWeight: 700,
                  fontSize: rankFS,
                  color: RED,
                }}
              >
                {pad2(c.rank)}
              </div>
            );
            const text = (
              <div style={{ display: 'flex', flexDirection: 'column', width: l.nameW }}>
                <div
                  style={{
                    ...clamp(l.lines),
                    fontFamily: DISPLAY,
                    fontSize: l.fontSize,
                    lineHeight: NAME_LH,
                  }}
                >
                  {c.name}
                </div>
                <div
                  style={{
                    ...oneLine,
                    fontSize: META_FS,
                    lineHeight: 1.2,
                    marginTop: NAME_GAP,
                    color: GREY,
                  }}
                >
                  {meta(c)}
                </div>
              </div>
            );

            return l.single ? (
              <div
                key={c.rank}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  height: RULE + l.rowH,
                  borderTop: `${RULE}px solid ${INK}`,
                  paddingTop: PAD_TOP,
                }}
              >
                <div style={{ display: 'flex' }}>
                  {rank}
                  {text}
                </div>
                <div style={{ display: 'flex', marginTop: 'auto', marginLeft: NUM }}>{picture(i)}</div>
              </div>
            ) : (
              <div
                key={c.rank}
                style={{ display: 'flex', height: RULE + l.rowH, borderTop: `${RULE}px solid ${INK}` }}
              >
                <div
                  style={{
                    display: 'flex',
                    width: NUM + l.nameW,
                    justifyContent: 'space-between',
                    flexDirection: 'column',
                    padding: `${PAD_TOP}px 0 ${PAD_BOTTOM}px`,
                  }}
                >
                  <div style={{ display: 'flex' }}>
                    {rank}
                    <div
                      style={{
                        ...clamp(l.lines),
                        width: l.nameW,
                        fontFamily: DISPLAY,
                        fontSize: l.fontSize,
                        lineHeight: NAME_LH,
                      }}
                    >
                      {c.name}
                    </div>
                  </div>
                  <div
                    style={{
                      ...oneLine,
                      width: l.nameW,
                      marginLeft: NUM,
                      fontSize: META_FS,
                      lineHeight: 1.2,
                      color: GREY,
                    }}
                  >
                    {meta(c)}
                  </div>
                </div>
                <div style={{ display: 'flex', marginLeft: 'auto' }}>{picture(i)}</div>
              </div>
            );
          })}
        </div>

        {d.facts.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', width: INNER, marginTop: FACTS_TOP }}>
            {d.facts.map((f) => (
              <div key={f.label} style={{ display: 'flex', alignItems: 'center', height: FACT_ROW }}>
                <div
                  style={{
                    display: 'flex',
                    width: LABEL_W,
                    fontFamily: MONO,
                    fontSize: 22,
                    letterSpacing: 2,
                    textTransform: 'uppercase',
                    color: '#7b776f',
                  }}
                >
                  {f.label}
                </div>
                <div style={{ ...oneLine, width: INNER - LABEL_W, fontSize: 31, fontWeight: 700 }}>
                  {f.value}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  },
};

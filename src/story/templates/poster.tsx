/**
 * Your #1 fills the whole story; everything else is white Helvetica (Arimo) set on top of it.
 * #2 and #3 are text only, so the one photo carries the poster.
 *
 * Legibility can't depend on the photo: the header sits on a dark top scrim, and the bottom scrim
 * starts just above the bottom block, wherever that ends up. Rank numbers are white on solid red tags.
 * Without a photo the poster turns last.fm red, with a giant rank numeral as the image.
 *
 * Satori can't measure text, so the bottom block is laid out up front (measured with ../measure.ts):
 * the #1 name gets the biggest size that fits in two lines, and the block's top is known, so the
 * scrim can follow it and a test can check it never runs into the header.
 */
import type { CSSProperties } from 'react';
import type { StoryData } from '../data.ts';
import { HELVETICA } from '../fonts.ts';
import { lineCount as measureLines } from '../measure.ts';
import { H, SAFE_BOTTOM, SAFE_TOP, W, type StoryTemplate } from '../template.ts';
import { meta, oneLine, Photo, RED } from './parts.tsx';

const X = 72;
const INNER = W - 2 * X;

// Header (px).
const YEAR_FS = 220;
const YEAR_H = Math.round(YEAR_FS * 0.82);
const HEAD_FS = 32;
const HEAD_LH = 1.25;
const HEADER_BOTTOM = SAFE_TOP + YEAR_H + 24 + 2 * HEAD_FS * HEAD_LH;

// Bottom block (px), top to bottom. Its bottom edge sits a little above SAFE_BOTTOM.
const BLOCK_BOTTOM = SAFE_BOTTOM - 12;
const TAG_1 = 52;
const NAME_GAP = 18;
const NAME_LH = 1;
const META_FS = 30;
const META_H = 14 + Math.ceil(META_FS * 1.2);
const FIRST_PAD = 28;
const TAG = 44;
const ROW_NAME_FS = 46;
const ROW_META_FS = 26;
const ROW_PAD = 16;
const ROW_H = 2 + 2 * ROW_PAD + Math.ceil(ROW_NAME_FS * 1.15) + 4 + Math.ceil(ROW_META_FS * 1.2);
const FACT_FS = 26;
const FACT_LH = Math.ceil(FACT_FS * 1.45);
const FACTS_PAD = 18;
const FACT_LABEL_W = 236;
/** Keep at least this much photo between the header and the bottom block. */
const MIN_GAP = 48;

/** How many lines `text` takes in Arimo bold at this size and tracking, measured like Satori (../measure.ts). */
export function lineCount(text: string, fontSize: number, width: number, spacing = 0): number {
  return measureLines(text, { font: HELVETICA, weight: 700, size: fontSize, letterSpacing: spacing }, width);
}

const nameSpacing = (fontSize: number) => -Math.round(fontSize * 0.03);

/** One-pick posters get a bigger name; longer names step down until they fit two lines. */
const NAME_SIZES = [112, 96, 84, 72, 64];

export function posterLayout(d: StoryData) {
  const [first, ...rest] = d.concerts;
  const restH = rest.length * ROW_H;
  const factsH = d.facts.length ? 2 + FACTS_PAD + d.facts.length * FACT_LH : 0;
  const sizes = d.concerts.length === 1 ? [132, ...NAME_SIZES] : NAME_SIZES;
  const firstH = (fontSize: number, lines: number) =>
    TAG_1 + NAME_GAP + Math.ceil(lines * fontSize * NAME_LH) + META_H + FIRST_PAD;

  let name = { fontSize: sizes.at(-1)!, lines: 2 };
  if (first) {
    for (const fontSize of sizes) {
      const lines = lineCount(first.name, fontSize, INNER, nameSpacing(fontSize));
      name = { fontSize, lines: Math.min(lines, 2) };
      const top = BLOCK_BOTTOM - restH - factsH - firstH(fontSize, name.lines);
      if (lines <= 2 && top >= HEADER_BOTTOM + MIN_GAP) break;
    }
  }
  const blockH = (first ? firstH(name.fontSize, name.lines) : 0) + restH + factsH;
  return {
    name,
    blockTop: BLOCK_BOTTOM - blockH,
    blockBottom: BLOCK_BOTTOM,
    headerBottom: HEADER_BOTTOM,
  };
}

function Tag({ n, size, bg }: { n: number; size: number; bg: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        flexShrink: 0,
        background: bg,
        color: '#fff',
        fontWeight: 700,
        fontSize: Math.round(size * 0.62),
        lineHeight: 1,
        textShadow: 'none',
      }}
    >
      {n}
    </div>
  );
}

const pct = (y: number) => `${((100 * y) / H).toFixed(1)}%`;

export const poster: StoryTemplate = {
  id: 'poster',
  name: 'Poster',
  description: 'Your #1 full-screen, Helvetica on top',
  // Only #1 is shown; the others get a token size so nothing big is processed for nothing.
  photo: (rank) =>
    rank === 1 ? { width: W, height: H, mode: 'color' } : { width: 8, height: 8, mode: 'mono' },
  render: (d: StoryData, photos) => {
    const [first, ...rest] = d.concerts;
    const photo = photos[0] ?? null;
    const { name, blockTop } = posterLayout(d);
    const tagBg = photo ? RED : '#111';
    const rule = photo ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.55)';
    const shadow = photo ? '0 2px 18px rgba(0,0,0,0.55)' : 'none';
    const full: CSSProperties = {
      position: 'absolute',
      top: 0,
      left: 0,
      width: W,
      height: H,
      display: 'flex',
    };

    return (
      <div
        style={{
          width: W,
          height: H,
          display: 'flex',
          position: 'relative',
          background: photo ? '#111' : RED,
          color: '#fff',
          fontFamily: HELVETICA,
        }}
      >
        {photo ? (
          <Photo src={photo} width={W} height={H} />
        ) : (
          // No photo: a giant rank numeral is the picture.
          <div
            style={{
              ...full,
              justifyContent: 'flex-end',
              alignItems: 'flex-start',
              paddingTop: HEADER_BOTTOM - 140,
              color: 'rgba(0,0,0,0.16)',
              fontWeight: 700,
              fontSize: 1100,
              lineHeight: 0.8,
              letterSpacing: -40,
              marginRight: -60,
            }}
          >
            {first ? 1 : ''}
          </div>
        )}
        {photo && (
          // Top scrim under the header, bottom scrim that starts just above the bottom block.
          <div
            style={{
              ...full,
              backgroundImage: `linear-gradient(180deg, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.66) ${pct(HEADER_BOTTOM)}, rgba(0,0,0,0) ${pct(HEADER_BOTTOM + 260)}, rgba(0,0,0,0) ${pct(Math.max(HEADER_BOTTOM + 260, blockTop - 300))}, rgba(0,0,0,0.72) ${pct(blockTop + 10)}, rgba(0,0,0,0.86) ${pct(SAFE_BOTTOM)}, rgba(0,0,0,0.92) 100%)`,
            }}
          />
        )}

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            position: 'absolute',
            top: SAFE_TOP,
            left: X,
            width: INNER,
            textShadow: shadow,
          }}
        >
          <div
            style={{
              display: 'flex',
              height: YEAR_H,
              fontWeight: 700,
              fontSize: YEAR_FS,
              lineHeight: 0.82,
              letterSpacing: -12,
              marginLeft: -8,
            }}
          >
            {d.year}
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: HEAD_FS,
              lineHeight: HEAD_LH,
              fontWeight: 700,
              marginTop: 24,
            }}
          >
            {d.picksLabel}
          </div>
          <div style={{ display: 'flex', fontSize: HEAD_FS, lineHeight: HEAD_LH }}>
            {`@${d.username} · ${d.totalLabel}`}
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            position: 'absolute',
            left: X,
            top: blockTop,
            width: INNER,
            textShadow: shadow,
          }}
        >
          {first && (
            <div style={{ display: 'flex', flexDirection: 'column', paddingBottom: FIRST_PAD }}>
              <Tag n={1} size={TAG_1} bg={tagBg} />
              <div
                style={{
                  display: 'block',
                  lineClamp: 2,
                  overflow: 'hidden',
                  marginTop: NAME_GAP,
                  height: Math.ceil(name.lines * name.fontSize * NAME_LH),
                  fontWeight: 700,
                  fontSize: name.fontSize,
                  lineHeight: NAME_LH,
                  letterSpacing: nameSpacing(name.fontSize),
                  marginLeft: -Math.round(name.fontSize * 0.04),
                }}
              >
                {first.name}
              </div>
              <div style={{ ...oneLine, fontSize: META_FS, lineHeight: 1.2, marginTop: 14 }}>
                {meta(first)}
              </div>
            </div>
          )}
          {rest.map((c) => (
            <div
              key={c.rank}
              // Fixed height and no padding: Satori adds padding on top of an explicit height.
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                height: ROW_H,
                borderTop: `2px solid ${rule}`,
              }}
            >
              <div style={{ display: 'flex', marginTop: ROW_PAD + 5 }}>
                <Tag n={c.rank} size={TAG} bg={tagBg} />
              </div>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  marginTop: ROW_PAD,
                  marginLeft: 22,
                  width: INNER - TAG - 22,
                }}
              >
                <div
                  style={{
                    ...oneLine,
                    fontWeight: 700,
                    fontSize: ROW_NAME_FS,
                    lineHeight: 1.15,
                    letterSpacing: -1,
                  }}
                >
                  {c.name}
                </div>
                <div
                  style={{ ...oneLine, fontSize: ROW_META_FS, lineHeight: 1.2, opacity: 0.88, marginTop: 4 }}
                >
                  {meta(c)}
                </div>
              </div>
            </div>
          ))}
          {d.facts.length > 0 && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                borderTop: `2px solid ${rule}`,
                paddingTop: FACTS_PAD,
                fontSize: FACT_FS,
              }}
            >
              {d.facts.map((f) => (
                <div key={f.label} style={{ display: 'flex', height: FACT_LH, alignItems: 'center' }}>
                  <div style={{ ...oneLine, width: FACT_LABEL_W, opacity: 0.75 }}>{f.label}</div>
                  <div style={{ ...oneLine, width: INNER - FACT_LABEL_W, fontWeight: 700 }}>{f.value}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  },
};

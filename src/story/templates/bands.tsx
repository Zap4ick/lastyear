/**
 * Three full-width monochrome photo bands, text on the dark side. Facts as a quiet list below.
 *
 * Satori can't measure text, so the layout is computed up front: the facts sit just above Instagram's
 * bottom UI and the bands share whatever height is left (one or two picks get tall, almost square
 * photos). Names are estimated to one or two lines and shrink to fit their band.
 *
 * Photos are cropped taller than their band and shown from the upper part: on a thin strip, sharp's
 * attention crop tends to land on arms or a lit wall, and faces are usually just above that.
 */
import type { StoryConcert, StoryData } from '../data.ts';
import { DISPLAY, MONO, TEXT } from '../fonts.ts';
import { lineCount } from '../measure.ts';
import { H, SAFE_BOTTOM, SAFE_TOP, W, type StoryTemplate } from '../template.ts';
import { clamp, meta, oneLine, pad2, Photo, RED } from './parts.tsx';

const X = 72;
const INNER = W - 2 * X;

// Header, top to bottom (px).
const YEAR_TOP = SAFE_TOP + 10;
const YEAR_FS = 150;
const SUB_TOP = YEAR_TOP + YEAR_FS + 22;
const PICKS_TOP = SUB_TOP + 36 + 34;
const BANDS_TOP = PICKS_TOP + 34 + 20;
const GAP = 10;

// Facts: one row each, pinned to the bottom of the safe area.
const FACT_ROW = 46;
const FACTS_GAP = 34;
const BOTTOM_MARGIN = 14;
const LABEL_W = 270;

// Text inside a band.
const PAD_TOP = 26;
const PAD_BOTTOM = 30;
const RANK_H = 30 + 10;
const META_H = 8 + 28 * 1.25;
const NAME_LH = 1.1;

/** Crop this much taller than the band, then show the window this far down the spare height. */
const CROP = 2.4;
const FOCUS = 0.05;

/** Lines the name takes in Unbounded at this size, measured with the real font (../measure.ts). */
const lines = (text: string, fontSize: number) =>
  lineCount(text, { font: DISPLAY, weight: 800, size: fontSize }, INNER);

function nameStyle(name: string, bandH: number) {
  const room = bandH - PAD_TOP - PAD_BOTTOM - RANK_H - META_H;
  const big = bandH >= 480 ? 88 : 64;
  const fits = (fs: number, n: number) => n * fs * NAME_LH <= room;
  if (lines(name, big) === 1) return { fontSize: big, lines: 1 };
  if (lines(name, big) === 2 && fits(big, 2)) return { fontSize: big, lines: 2 };
  // Long names: smaller, two lines if the band has room for them, else one line with an ellipsis.
  const fs = big === 88 ? 64 : 52;
  return { fontSize: fs, lines: lines(name, fs) > 1 && fits(fs, 2) ? 2 : 1 };
}

export function bandsLayout(d: StoryData) {
  const n = Math.max(d.concerts.length, 1);
  const factsH = d.facts.length * FACT_ROW;
  const factsTop = SAFE_BOTTOM - BOTTOM_MARGIN - factsH;
  const bandsBottom = d.facts.length ? factsTop - FACTS_GAP : SAFE_BOTTOM - BOTTOM_MARGIN;
  // Bands never get taller than wide: a square is the whole photo.
  const bandH = Math.min(W, Math.floor((bandsBottom - BANDS_TOP - GAP * (n - 1)) / n));
  const photoH = Math.min(W, Math.round(bandH * CROP));
  const rows = d.concerts.map((c) => {
    const s = nameStyle(c.name, bandH);
    return { ...s, textH: PAD_TOP + RANK_H + s.lines * s.fontSize * NAME_LH + META_H + PAD_BOTTOM };
  });
  return {
    bandH,
    photoH,
    photoTop: -Math.round((photoH - bandH) * FOCUS),
    rows,
    factsTop,
    contentBottom: factsTop + factsH,
  };
}

/** No photo: a dark block with the name's initial, huge and faint, on the right. */
function Initial({ name, height }: { name: string; height: number }) {
  const fs = Math.round(Math.min(height * 1.05, 640));
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'flex-end',
        alignItems: 'center',
        width: W,
        height,
        background: '#161616',
        overflow: 'hidden',
        fontFamily: DISPLAY,
        fontSize: fs,
        lineHeight: 1,
        color: '#262626',
        paddingRight: 40,
      }}
    >
      {[...name.trim()][0]?.toUpperCase() ?? '•'}
    </div>
  );
}

function Band({
  c,
  photo,
  layout,
  row,
}: {
  c: StoryConcert;
  photo: string | null;
  layout: ReturnType<typeof bandsLayout>;
  row: ReturnType<typeof bandsLayout>['rows'][number];
}) {
  const h = layout.bandH;
  return (
    <div style={{ display: 'flex', position: 'relative', width: W, height: h, overflow: 'hidden' }}>
      {photo ? (
        <Photo
          src={photo}
          width={W}
          height={layout.photoH}
          style={{ position: 'absolute', top: layout.photoTop, left: 0 }}
        />
      ) : (
        <Initial name={c.name} height={h} />
      )}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 0,
          left: 0,
          width: W,
          height: h,
          backgroundImage:
            'linear-gradient(90deg, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.55) 45%, rgba(0,0,0,0.1) 80%, rgba(0,0,0,0) 100%)',
        }}
      />
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          position: 'absolute',
          left: X,
          bottom: PAD_BOTTOM,
          width: INNER,
        }}
      >
        <div
          style={{
            display: 'flex',
            fontFamily: MONO,
            fontWeight: 700,
            fontSize: 30,
            lineHeight: 1,
            color: RED,
          }}
        >
          {pad2(c.rank)}
        </div>
        <div
          style={{
            ...(row.lines > 1 ? clamp(row.lines) : oneLine),
            fontFamily: DISPLAY,
            fontSize: row.fontSize,
            lineHeight: NAME_LH,
            marginTop: 10,
            maxHeight: row.lines * row.fontSize * NAME_LH,
          }}
        >
          {c.name}
        </div>
        <div style={{ ...oneLine, fontSize: 28, lineHeight: 1.25, color: '#d6d6d6', marginTop: 8 }}>
          {meta(c)}
        </div>
      </div>
    </div>
  );
}

export const bands: StoryTemplate = {
  credit: { left: X, color: '#7a7a7a', fontFamily: MONO, fontSize: 20, letterSpacing: 3, uppercase: true },
  id: 'bands',
  name: 'Bands',
  description: 'Three black-and-white photo bands, dark',
  photo: (_rank, d) => ({ width: W, height: bandsLayout(d).photoH, mode: 'mono' }),
  render: (d: StoryData, photos) => {
    const l = bandsLayout(d);
    return (
      <div
        style={{
          width: W,
          height: H,
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          background: '#0b0b0b',
          color: '#fff',
          fontFamily: TEXT,
        }}
      >
        <div
          style={{
            display: 'flex',
            position: 'absolute',
            top: YEAR_TOP,
            left: X - 6,
            fontFamily: DISPLAY,
            fontSize: YEAR_FS,
            lineHeight: 1,
            letterSpacing: -4,
          }}
        >
          {d.year}
        </div>
        <div
          style={{
            display: 'flex',
            position: 'absolute',
            top: SUB_TOP,
            left: X,
            fontSize: 30,
            lineHeight: 1.2,
            fontWeight: 700,
            letterSpacing: 5,
            textTransform: 'uppercase',
            color: '#8a8a8a',
          }}
        >
          {`${d.totalLabel} · @${d.username}`}
        </div>
        <div
          style={{
            display: 'flex',
            position: 'absolute',
            top: PICKS_TOP,
            left: X,
            fontFamily: MONO,
            fontWeight: 700,
            fontSize: 26,
            lineHeight: 1.3,
            letterSpacing: 3,
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
            position: 'absolute',
            top: BANDS_TOP,
            left: 0,
            width: W,
            gap: GAP,
          }}
        >
          {d.concerts.map((c, i) => (
            <Band key={c.rank} c={c} photo={photos[i] ?? null} layout={l} row={l.rows[i]!} />
          ))}
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            position: 'absolute',
            left: X,
            top: l.factsTop,
            width: INNER,
          }}
        >
          {d.facts.map((f) => (
            <div key={f.label} style={{ display: 'flex', alignItems: 'baseline', height: FACT_ROW }}>
              <div
                style={{
                  display: 'flex',
                  width: LABEL_W,
                  fontFamily: MONO,
                  fontSize: 22,
                  letterSpacing: 2,
                  textTransform: 'uppercase',
                  color: '#7a7a7a',
                }}
              >
                {f.label}
              </div>
              <div style={{ ...oneLine, width: INNER - LABEL_W, fontSize: 30, lineHeight: 1.2 }}>
                {f.value}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  },
};

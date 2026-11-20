/**
 * Bauhaus poster: primary colours and black on paper, circle / square / arch, a geometric sans (Jost,
 * Futura-like). Photos sit inside the shapes: #1 in a circle within a big red disc, #2 in a square,
 * #3 in an arch; the numbered list repeats each shape and colour as its marker.
 *
 * Type follows the Bauhaus "kleinschreibung": captions (labels, dates, venues) are lowercase, content
 * (gig names, fact values) keeps its own case, set bold, so the two read as two levels.
 *
 * Satori can't measure text, so the layout is computed up front (`bauhausLayout`): names are estimated
 * to one or two lines, and the shapes get whatever height is left, so the list and facts always end
 * above Instagram's bottom UI. The composition changes with the number of picks so no slot is empty.
 */
import type { CSSProperties } from 'react';
import type { StoryConcert, StoryData } from '../data.ts';
import { GEOMETRIC } from '../fonts.ts';
import { lineCount } from '../measure.ts';
import { H, SAFE_BOTTOM, SAFE_TOP, W, type StoryTemplate } from '../template.ts';
import { clamp, meta, oneLine } from './parts.tsx';

const PAPER = '#efe9dc';
const INK = '#141414';
const RED = '#d6301f';
const YELLOW = '#f2b705';
const BLUE = '#1f4e9c';
const COLORS = [RED, BLUE, YELLOW];

const X = 120; // text column, right of the blue bar
const INNER = W - X - 72;
const MARKER = 56;
const NAME_X = MARKER + 28;
const NAME_W = INNER - NAME_X;

// Header (fixed).
const YEAR = { left: X - 8, top: SAFE_TOP - 12, fontSize: 210 };
const LABEL_TOP = 452;

// Shapes. With two or three picks the red disc sits top right and the year runs into it.
const DISC_2_3 = { left: 540, top: 176, size: 560 };
const ROW_TOP = 584; // #2 square and #3 arch
const ROW_GAP = 24;
const ONE_TOP = 572; // with one pick, a bigger disc below the header

// Below the shapes: black bar, list, facts.
const BAR_GAP = 34;
const BAR = 16;
const LIST_GAP = 36;
const NAME_LH = 1.08;
const META_H = Math.ceil(26 * 1.25) + 4;
const ROW_PAD = 22;
const FACTS_GAP = 14;
const FACT_ROW = 42;

/** Lines the name takes in Jost bold at this size, measured with the real font (../measure.ts). */
const lines = (text: string, fontSize: number, width: number) =>
  lineCount(text, { font: GEOMETRIC, weight: 700, size: fontSize }, width);

function nameStyle(c: StoryConcert) {
  // Two lines at full size if needed; names that would need a third get smaller, clamped to two.
  const fontSize = lines(c.name, 46, NAME_W) > 2 ? 38 : 46;
  const n = Math.min(2, lines(c.name, fontSize, NAME_W));
  return { fontSize, lines: n, height: Math.ceil(n * fontSize * NAME_LH) + META_H + ROW_PAD };
}

interface Box {
  left: number;
  top: number;
  size: number;
}

const between = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function bauhausLayout(d: StoryData) {
  const n = between(d.concerts.length, 1, 3);
  const rows = d.concerts.map(nameStyle);
  const listH = rows.reduce((a, r) => a + r.height, 0) - ROW_PAD;
  const factsH = d.facts.length ? FACTS_GAP + ROW_PAD + d.facts.length * FACT_ROW : 0;
  // Lowest the shapes may reach so that bar, list and facts still end above SAFE_BOTTOM.
  const shapesMax = SAFE_BOTTOM - (BAR_GAP + BAR + LIST_GAP + listH + factsH);

  let disc: Box;
  const shapes: Box[] = [];
  if (n === 1) {
    const size = between(shapesMax - ONE_TOP, 480, 720);
    disc = { left: W - 56 - size, top: ONE_TOP, size };
  } else {
    disc = DISC_2_3;
    const s = n === 3 ? between(shapesMax - ROW_TOP, 220, 300) : between(shapesMax - ROW_TOP, 280, 380);
    shapes[1] = { left: X, top: ROW_TOP, size: s };
    if (n === 3) shapes[2] = { left: X + s + ROW_GAP, top: ROW_TOP, size: s };
  }
  const p1 = Math.round((disc.size * 2) / 3);
  shapes[0] = { left: disc.left + (disc.size - p1) / 2, top: disc.top + (disc.size - p1) / 2, size: p1 };

  const shapesBottom = Math.max(disc.top + disc.size, ...shapes.map((b) => b.top + b.size));
  const barTop = shapesBottom + BAR_GAP;
  const listTop = barTop + BAR + LIST_GAP;
  const factsTop = listTop + listH + FACTS_GAP + ROW_PAD;
  const contentBottom = d.facts.length ? factsTop + d.facts.length * FACT_ROW : listTop + listH;
  return { n, rows, disc, shapes, barTop, listTop, factsTop, contentBottom };
}

const abs = (left: number, top: number, extra: CSSProperties = {}): CSSProperties => ({
  display: 'flex',
  position: 'absolute',
  left,
  top,
  ...extra,
});

/** circle, square, arch: border radius for rank 1 / 2 / 3 at a given size. */
const radius = (rank: number, size: number) =>
  rank === 1 ? '50%' : rank === 3 ? `${size / 2}px ${size / 2}px 0 0` : '0';

const yearStyle = (color: string): CSSProperties => ({
  fontWeight: 700,
  fontSize: YEAR.fontSize,
  lineHeight: 0.85,
  letterSpacing: -6,
  color,
});

function ShapedPhoto({ c, box, src }: { c: StoryConcert; box: Box; src: string | null }) {
  const { left, top, size } = box;
  const fill = c.rank === 1 ? INK : COLORS[c.rank - 1]!;
  return (
    <div
      style={abs(left, top, {
        width: size,
        height: size,
        borderRadius: radius(c.rank, size),
        overflow: 'hidden',
      })}
    >
      {src ? (
        <img src={src} width={size} height={size} style={{ width: size, height: size, objectFit: 'cover' }} />
      ) : (
        // No photo: the shape in its colour with the name's initial, set low like a poster letter.
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
            width: size,
            height: size,
            background: fill,
            color: fill === YELLOW ? INK : PAPER,
            fontWeight: 700,
            fontSize: Math.round(size * 0.78),
            lineHeight: 0.86,
          }}
        >
          {[...c.name.trim()][0]?.toLowerCase() ?? ''}
        </div>
      )}
    </div>
  );
}

function Marker({ rank }: { rank: number }) {
  const color = COLORS[rank - 1]!;
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: MARKER,
        height: MARKER,
        flexShrink: 0,
        marginRight: NAME_X - MARKER,
        marginTop: 2,
        borderRadius: radius(rank, MARKER),
        background: color,
        color: color === YELLOW ? INK : '#fff',
        fontWeight: 700,
        fontSize: 32,
        paddingTop: rank === 3 ? 6 : 0,
      }}
    >
      {rank}
    </div>
  );
}

/** Flat shapes that balance the composition; they change with the number of picks. */
function Decor({ n, shapes, flat3 }: { n: number; shapes: Box[]; flat3: boolean }) {
  if (n === 1) {
    return (
      <>
        <div style={abs(808, 168, { width: 200, height: 200, background: YELLOW })} />
        <div style={abs(760, 396, { width: 72, height: 72, borderRadius: '50%', background: BLUE })} />
      </>
    );
  }
  const last = shapes[n - 1]!;
  const right = last.left + last.size;
  const bottom = last.top + last.size;
  if (n === 2) {
    const s = 200;
    return (
      <>
        <div style={abs(right + 48, bottom - s, { width: s, height: s, background: YELLOW })} />
        <div
          style={abs(right + 48 + s + 36, bottom - 72, {
            width: 72,
            height: 72,
            borderRadius: '50%',
            background: BLUE,
          })}
        />
      </>
    );
  }
  return (
    <>
      {/* a photo-less #3 is already a yellow arch: don't put a second yellow block next to it */}
      <div
        style={abs(right + 36, bottom - 150, { width: 150, height: 150, background: flat3 ? INK : YELLOW })}
      />
      <div
        style={abs(right + 36 + 150 + 28, bottom - 64, {
          width: 64,
          height: 64,
          borderRadius: '50%',
          background: BLUE,
        })}
      />
    </>
  );
}

export const bauhaus: StoryTemplate = {
  id: 'bauhaus',
  name: 'Bauhaus',
  description: 'Primary colours, circle, square and arch',
  photo: (rank, d) => {
    const size = bauhausLayout(d).shapes[rank - 1]?.size ?? 8;
    return { width: size, height: size, mode: 'mono' };
  },
  render: (d: StoryData, photos) => {
    const l = bauhausLayout(d);
    const { disc } = l;
    return (
      <div
        style={{
          width: W,
          height: H,
          display: 'flex',
          position: 'relative',
          background: PAPER,
          color: INK,
          fontFamily: GEOMETRIC,
          overflow: 'hidden',
        }}
      >
        <Decor n={l.n} shapes={l.shapes} flat3={l.n === 3 && !photos[2]} />
        <div style={abs(72, 0, { width: 22, height: H, background: BLUE })} />

        <div style={abs(YEAR.left, YEAR.top, yearStyle(INK))}>{d.year}</div>

        {/* red disc; where the year runs into it, the year is knocked out in paper */}
        <div
          style={abs(disc.left, disc.top, {
            width: disc.size,
            height: disc.size,
            borderRadius: '50%',
            background: RED,
            overflow: 'hidden',
          })}
        >
          <div style={abs(YEAR.left - disc.left, YEAR.top - disc.top, yearStyle(PAPER))}>{d.year}</div>
        </div>

        <div style={abs(X, LABEL_TOP, { flexDirection: 'column', lineHeight: 1.2 })}>
          <div style={{ display: 'flex', fontWeight: 700, fontSize: 38 }}>{d.picksLabel.toLowerCase()}</div>
          <div style={{ display: 'flex', fontWeight: 500, fontSize: 28 }}>
            {`@${d.username} · ${d.totalLabel}`}
          </div>
        </div>

        {d.concerts.map((c, i) => {
          const box = l.shapes[i];
          return box ? <ShapedPhoto key={c.rank} c={c} box={box} src={photos[i] ?? null} /> : null;
        })}

        <div style={abs(0, l.barTop, { width: X + 440, height: BAR, background: INK })} />

        <div style={abs(X, l.listTop, { flexDirection: 'column', width: INNER })}>
          {d.concerts.map((c, i) => {
            const r = l.rows[i]!;
            return (
              <div
                key={c.rank}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  height: i === d.concerts.length - 1 ? r.height - ROW_PAD : r.height,
                }}
              >
                <Marker rank={c.rank} />
                <div style={{ display: 'flex', flexDirection: 'column', width: NAME_W }}>
                  <div
                    style={{
                      ...(r.lines > 1 ? clamp(r.lines) : oneLine),
                      fontWeight: 700,
                      fontSize: r.fontSize,
                      lineHeight: NAME_LH,
                    }}
                  >
                    {c.name}
                  </div>
                  <div style={{ ...oneLine, fontWeight: 500, fontSize: 26, lineHeight: 1.25, marginTop: 4 }}>
                    {meta(c).toLowerCase()}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {d.facts.length > 0 && (
          <div style={abs(X, l.factsTop, { flexDirection: 'column', width: INNER })}>
            {d.facts.map((f, i) => (
              <div key={f.label} style={{ display: 'flex', alignItems: 'center', height: FACT_ROW }}>
                <div
                  style={{
                    display: 'flex',
                    width: 16,
                    height: 16,
                    flexShrink: 0,
                    background: COLORS[i % 3],
                    marginRight: 16,
                  }}
                />
                <div style={{ display: 'flex', width: 220, flexShrink: 0, fontWeight: 500, fontSize: 26 }}>
                  {f.label.toLowerCase()}
                </div>
                <div style={{ ...oneLine, width: INNER - 252, fontWeight: 700, fontSize: 28 }}>{f.value}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  },
};

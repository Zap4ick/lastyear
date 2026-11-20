/**
 * Postmodern collage (Memphis-ish): dotted paper, a ransom-note year where every digit is cut from a
 * different source, tilted taped photo prints, round stickers, each name cut out line by line in its
 * own type and colour, facts on strips of label-maker tape. Deliberately loud; every word sits on an
 * opaque strip so it stays readable, and all text stays between Instagram's top and bottom UI.
 *
 * Satori can't measure text, so `collageLayout` estimates widths from per-font glyph metrics
 * (measured on the real fonts) and wraps names itself: nothing is cut unless a name is absurdly long.
 */
import type { CSSProperties } from 'react';
import type { StoryConcert, StoryData } from '../data.ts';
import { DISPLAY, GEOMETRIC, HELVETICA, MONO, TEXT } from '../fonts.ts';
import { textWidth as measureWidth } from '../measure.ts';
import { SAFE_BOTTOM, SAFE_TOP, H, W, type PhotoMode, type StoryTemplate } from '../template.ts';
import { meta, oneLine } from './parts.tsx';

const PAPER = '#f6e7d8';
const INK = '#111';
const PINK = '#ff4fa3';
const TEAL = '#00b3a6';
const YELLOW = '#ffd400';
const PURPLE = '#6b3df0';
const SHADOW = 'rgba(0,0,0,0.85)';

const X = 64;
const INNER = W - 2 * X;

const abs = (left: number, top: number, extra: CSSProperties = {}): CSSProperties => ({
  display: 'flex',
  position: 'absolute',
  left,
  top,
  ...extra,
});

// ── text measuring ─────────────────────────────────────────────────────────────────────────────────

type Face = 'display' | 'mono' | 'grotesk';
/** The font each face is drawn with. JetBrains Mono is monospaced, so its weight doesn't change widths. */
const FACES: Record<Face, { font: string; weight: number }> = {
  display: { font: DISPLAY, weight: 800 },
  mono: { font: MONO, weight: 700 },
  grotesk: { font: HELVETICA, weight: 700 },
};

/** Width in px, measured with the real font metrics (../measure.ts). */
export function textWidth(s: string, face: Face, size: number, letterSpacing = 0): number {
  return measureWidth(s, { ...FACES[face], size, letterSpacing });
}

/** Greedy word wrap; a single word longer than the line stays whole (the strip cuts it). */
export function wrap(s: string, face: Face, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of s.trim().split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (line && textWidth(next, face, size) > maxWidth) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/** Two lines as even as possible (no lone last word), still cut at spaces. */
export function balance(s: string, face: Face, size: number): [string, string] {
  const words = s.trim().split(/\s+/);
  let best: [string, string] = [words.slice(0, -1).join(' '), words.at(-1)!];
  let bestMax = Infinity;
  for (let k = 1; k < words.length; k++) {
    const a = words.slice(0, k).join(' ');
    const b = words.slice(k).join(' ');
    const m = Math.max(textWidth(a, face, size), textWidth(b, face, size));
    if (m < bestMax) [best, bestMax] = [[a, b], m];
  }
  return best;
}

// ── names ──────────────────────────────────────────────────────────────────────────────────────────

/** How each name is cut out: wildly different on purpose. Sizes: [max for 1 pick, 2 picks, 3 picks, min]. */
const NAME_STYLES: {
  face: Face;
  font: string;
  weight: number;
  bg: string;
  fg: string;
  upper: boolean;
  sizes: [number, number, number, number];
}[] = [
  {
    face: 'display',
    font: DISPLAY,
    weight: 800,
    bg: PINK,
    fg: '#fff',
    upper: false,
    sizes: [88, 72, 64, 40],
  },
  { face: 'mono', font: MONO, weight: 700, bg: INK, fg: YELLOW, upper: false, sizes: [64, 58, 50, 32] },
  { face: 'grotesk', font: HELVETICA, weight: 700, bg: TEAL, fg: INK, upper: true, sizes: [64, 60, 56, 36] },
];
/** Rank sticker colours, chosen to clash with (not match) the name strip next to them. */
const STICKERS = [YELLOW, TEAL, PINK];

const NAME_LH = 1.16;
const NAME_PAD_Y = 4;
const NAME_PAD_X = 16;
const LINE_GAP = 6;
const LINE_INDENT = 26;
const DOT = 58;
const DOT_GAP = 14;
const META_FS = 21;
const META_LH = 1.3;
const META_H = Math.round(META_FS * META_LH) + 10;
const ENTRY_GAP = 20;

function nameBlock(c: StoryConcert, i: number, n: number, scale: number, maxLines: number) {
  const st = NAME_STYLES[i % NAME_STYLES.length]!;
  const text = st.upper ? c.name.toUpperCase() : c.name;
  const dot = n > 1 ? DOT + DOT_GAP : 0;
  const room = INNER - dot - 2 * NAME_PAD_X - LINE_INDENT;
  const min = st.sizes[3];
  const max = Math.max(min, Math.round(st.sizes[Math.min(n, 3) - 1]! * scale));
  let fontSize = max;
  let lines = wrap(text, st.face, fontSize, room);
  while (lines.length > 2 && fontSize > min) {
    fontSize -= 2;
    lines = wrap(text, st.face, fontSize, room);
  }
  if (lines.length === 2) lines = balance(text, st.face, fontSize);
  // Very long: a third line at the smallest size (when there is room); beyond that the last strip ends in an ellipsis.
  if (lines.length > maxLines) lines = [...lines.slice(0, maxLines - 1), lines.slice(maxLines - 1).join(' ')];
  const stripH = Math.round(fontSize * NAME_LH) + 2 * NAME_PAD_Y;
  const lastW =
    textWidth(lines.at(-1)!, st.face, fontSize) + 2 * NAME_PAD_X + (lines.length > 1 ? LINE_INDENT : 0);
  const metaW = textWidth(meta(c), 'mono', META_FS) + 20;
  const metaInline = dot + lastW + 16 + metaW <= INNER && stripH >= META_H;
  const height = lines.length * stripH + (lines.length - 1) * LINE_GAP + (metaInline ? 0 : LINE_GAP + META_H);
  return { style: st, lines, fontSize, stripH, metaInline, height };
}

// ── facts ──────────────────────────────────────────────────────────────────────────────────────────

const FACT_FS = 21;
const FACT_LS = 0.5;
const FACT_PAD_X = 12;
const FACT_H = Math.round(FACT_FS * 1.3) + 16;
/** Prints need at least this much height, or names shrink. */
const MIN_ZONE = [560, 480, 440];
const FACT_GAP = 10;
const FACT_LABEL = [YELLOW, PINK, TEAL, '#fff'];

/** Facts as label-maker strips, packed greedily into rows. */
function factRows(d: StoryData) {
  const rows: { label: string; value: string; i: number }[][] = [];
  let used = INNER + 1;
  d.facts.forEach((f, i) => {
    const label = f.label.toUpperCase();
    const w = Math.min(INNER, textWidth(`${label} ${f.value}`, 'mono', FACT_FS, FACT_LS) + 2 * FACT_PAD_X);
    if (used + 14 + w > INNER) {
      rows.push([]);
      used = -14;
    }
    rows.at(-1)!.push({ label, value: f.value, i });
    used += 14 + w;
  });
  return rows;
}

// ── prints ─────────────────────────────────────────────────────────────────────────────────────────

const FRAME = 16;
const PRINTS_TOP = 486;
const MODES: PhotoMode[] = ['color', 'mono', 'red'];

interface PrintBox {
  left: number;
  top: number;
  w: number;
  h: number;
  rot: number;
  /** Where the rank sticker goes. */
  sticker: 'tl' | 'tr' | 'bl' | 'br';
}

/** Tilted prints filling the zone between the header and the names, arranged for 1, 2 or 3 picks. */
function printBoxes(n: number, z: number): PrintBox[] {
  const T = PRINTS_TOP;
  const inner = (v: number) => Math.round(v - 2 * FRAME);
  if (n <= 1) {
    const w = Math.min(860, Math.round(z * 1.15));
    return [{ left: (W - w) / 2 - FRAME, top: T + 14, w, h: inner(z - 40), rot: -3, sticker: 'bl' }];
  }
  if (n === 2)
    return [
      { left: 46, top: T + 12, w: 560, h: inner(z * 0.8), rot: -4, sticker: 'bl' },
      { left: 570, top: T + Math.round(z * 0.22), w: 420, h: inner(z * 0.74), rot: 5, sticker: 'tr' },
    ];
  return [
    { left: 52, top: T + 16, w: 510, h: inner(z * 0.8), rot: -5, sticker: 'bl' },
    { left: 606, top: T, w: 400, h: inner(z * 0.56), rot: 6, sticker: 'tr' },
    { left: 514, top: T + Math.round(z * 0.44), w: 460, h: inner(z * 0.56), rot: -3, sticker: 'br' },
  ];
}

// ── layout ─────────────────────────────────────────────────────────────────────────────────────────

export function collageLayout(d: StoryData) {
  const n = Math.max(1, Math.min(3, d.concerts.length));
  const facts = factRows(d);
  const factsH = facts.length ? facts.length * FACT_H + (facts.length - 1) * FACT_GAP : 0;
  const factsTop = SAFE_BOTTOM - 8 - factsH;
  // Long names shrink (all together, so the ranking still reads) until the prints get enough room.
  // If even that is not enough (several absurdly long names), they get two lines and an ellipsis.
  for (let scale = 1, maxLines = 3; ; scale -= 0.05) {
    if (scale < 0.6 && maxLines === 3) [scale, maxLines] = [0.6, 2];
    const names = d.concerts.slice(0, 3).map((c, i) => nameBlock(c, i, n, scale, maxLines));
    const namesH = names.reduce((a, b) => a + b.height, 0) + Math.max(0, names.length - 1) * ENTRY_GAP;
    const namesTop = factsTop - (facts.length ? 34 : 0) - namesH;
    // Prints take whatever is left; rotation and the stickers need ~30 px of air above the names.
    const zone = namesTop - 34 - PRINTS_TOP;
    if (zone >= MIN_ZONE[n - 1]! || (scale <= 0.6 && maxLines === 2))
      return { n, names, facts, factsTop, namesTop, zone, prints: printBoxes(n, zone) };
  }
}

// ── pieces ─────────────────────────────────────────────────────────────────────────────────────────

/** Ransom-note digits: font, colours, tilt per position. */
const CUTOUTS: { font: string; bg: string; fg: string; rot: number; size: number; weight: number }[] = [
  { font: DISPLAY, bg: YELLOW, fg: INK, rot: -5, size: 150, weight: 800 },
  { font: HELVETICA, bg: PINK, fg: '#fff', rot: 4, size: 170, weight: 700 },
  { font: MONO, bg: INK, fg: '#fff', rot: -2, size: 150, weight: 700 },
  { font: GEOMETRIC, bg: TEAL, fg: INK, rot: 6, size: 165, weight: 700 },
];

function Sticker({ rank, color, size, rot }: { rank: number; color: string; size: number; rot: number }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        width: size,
        height: size,
        borderRadius: '50%',
        background: color,
        border: `${Math.round(size / 19)}px solid ${INK}`,
        color: INK,
        fontFamily: DISPLAY,
        fontWeight: 800,
        fontSize: Math.round(size * 0.5),
        lineHeight: 1,
        transform: `rotate(${rot}deg)`,
      }}
    >
      {String(rank)}
    </div>
  );
}

/** A missing photo: a halftone purple block with the initial cut from yellow paper. */
function NoPhoto({ name, w, h }: { name: string; w: number; h: number }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: w,
        height: h,
        background: PURPLE,
        backgroundImage: 'radial-gradient(circle, rgba(255,79,163,0.55) 5px, transparent 6px)',
        backgroundSize: '26px 26px',
      }}
    >
      <div
        style={{
          display: 'flex',
          padding: '0 0.12em',
          background: YELLOW,
          color: INK,
          fontFamily: DISPLAY,
          fontWeight: 800,
          fontSize: Math.round(Math.min(w, h) * 0.5),
          lineHeight: 1.1,
          transform: 'rotate(-6deg)',
          boxShadow: `8px 10px 0 ${SHADOW}`,
        }}
      >
        {[...name.trim()][0]?.toUpperCase() ?? '?'}
      </div>
    </div>
  );
}

function Print({ c, src, p, i }: { c: StoryConcert; src: string | null; p: PrintBox; i: number }) {
  const outerW = p.w + 2 * FRAME;
  const outerH = p.h + 2 * FRAME;
  const S = 100;
  const sx = p.sticker.endsWith('l') ? -26 : outerW - S + 26;
  const sy = p.sticker.startsWith('t') ? -34 : outerH - S + 26;
  return (
    <div style={abs(p.left, p.top, { width: outerW, height: outerH, transform: `rotate(${p.rot}deg)` })}>
      <div
        style={{
          display: 'flex',
          padding: FRAME,
          background: '#fff',
          boxShadow: `7px 11px 0 ${SHADOW}`,
        }}
      >
        {src ? (
          <img src={src} width={p.w} height={p.h} style={{ width: p.w, height: p.h, objectFit: 'cover' }} />
        ) : (
          <NoPhoto name={c.name} w={p.w} h={p.h} />
        )}
      </div>
      {/* tape */}
      <div
        style={abs(outerW / 2 - 75 + (i - 1) * 40, -24, {
          width: 150,
          height: 46,
          background: 'rgba(255, 212, 0, 0.72)',
          transform: `rotate(${i % 2 ? 9 : -7}deg)`,
        })}
      />
      <div style={abs(sx, sy)}>
        <Sticker rank={c.rank} color={STICKERS[i]!} size={S} rot={-p.rot * 2} />
      </div>
    </div>
  );
}

function Squiggle({ left, top, color, w = 300 }: { left: number; top: number; color: string; w?: number }) {
  const waves = Math.round(w / 50);
  const d = Array.from({ length: waves }, (_, k) => `q 12.5 ${k % 2 ? 26 : -26} 25 0 t 25 0`).join(' ');
  return (
    <svg style={abs(left, top)} width={w + 20} height={60} viewBox={`0 0 ${w + 20} 60`}>
      <path d={`M 10 30 ${d}`} fill="none" stroke={color} strokeWidth={10} strokeLinecap="round" />
    </svg>
  );
}

/** "Top gigs of the year" split into the two most even lines. */
function twoLines(s: string): string[] {
  const words = s.toUpperCase().split(/\s+/);
  if (words.length < 2) return words;
  let best = [s.toUpperCase()];
  let bestMax = Infinity;
  for (let k = 1; k < words.length; k++) {
    const a = words.slice(0, k).join(' ');
    const b = words.slice(k).join(' ');
    const m = Math.max(a.length, b.length);
    if (m < bestMax) [best, bestMax] = [[a, b], m];
  }
  return best;
}

// ── template ───────────────────────────────────────────────────────────────────────────────────────

export const collage: StoryTemplate = {
  id: 'collage',
  name: 'Collage',
  description: 'Postmodern cut-and-paste, loud on purpose',
  photo: (rank, d) => {
    const p = collageLayout(d).prints[rank - 1];
    return p ? { width: p.w, height: p.h, mode: MODES[rank - 1]! } : { width: 8, height: 8, mode: 'mono' };
  },
  render: (d: StoryData, photos) => {
    const L = collageLayout(d);
    const year = String(d.year).split('');
    const concerts = d.concerts.slice(0, 3);
    return (
      <div
        style={{
          width: W,
          height: H,
          display: 'flex',
          position: 'relative',
          overflow: 'hidden',
          background: PAPER,
          backgroundImage: `radial-gradient(circle, rgba(17,17,17,0.22) 2.5px, transparent 3px)`,
          backgroundSize: '34px 34px',
          fontFamily: TEXT,
          color: INK,
        }}
      >
        {/* Memphis shapes (decor may sit under Instagram's UI; text never does) */}
        <div style={abs(700, 110, { width: 460, height: 460, borderRadius: '50%', background: TEAL })} />
        <Squiggle left={40} top={150} color={INK} w={340} />
        <div
          style={abs(-130, L.namesTop + 60, {
            width: 380,
            height: 380,
            borderRadius: '50%',
            border: `30px solid ${PURPLE}`,
          })}
        />
        <div
          style={abs(800, SAFE_BOTTOM - 40, {
            width: 260,
            height: 260,
            background: YELLOW,
            transform: 'rotate(18deg)',
          })}
        />
        <Squiggle left={330} top={SAFE_BOTTOM + 80} color={PINK} w={400} />
        {Array.from({ length: 7 }, (_, i) => (
          <div
            key={i}
            style={abs(70 + i * 46, SAFE_BOTTOM + 190 + (i % 2) * 22, {
              width: 30,
              height: 30,
              background: i % 2 ? TEAL : PINK,
              transform: 'rotate(45deg)',
            })}
          />
        ))}

        {/* ransom-note year */}
        <div style={abs(X, SAFE_TOP + 6, { gap: 14, alignItems: 'flex-end' })}>
          {year.map((digit, i) => {
            const s = CUTOUTS[i % CUTOUTS.length]!;
            return (
              <div
                key={i}
                style={{
                  display: 'flex',
                  padding: '6px 22px 0',
                  background: s.bg,
                  color: s.fg,
                  fontFamily: s.font,
                  fontWeight: s.weight,
                  fontSize: s.size,
                  lineHeight: 1,
                  transform: `rotate(${s.rot}deg)`,
                  boxShadow: `5px 6px 0 ${SHADOW}`,
                }}
              >
                {digit}
              </div>
            );
          })}
        </div>

        {/* what this is: a typed label stuck on the teal circle */}
        <div
          style={abs(752, SAFE_TOP + 34, {
            flexDirection: 'column',
            width: 280,
            padding: '24px 18px 12px',
            background: '#fff',
            transform: 'rotate(4deg)',
            boxShadow: `5px 7px 0 ${SHADOW}`,
            fontFamily: MONO,
            color: INK,
          })}
        >
          {twoLines(d.picksLabel).map((l, i) => (
            <div key={i} style={{ display: 'flex', fontWeight: 700, fontSize: 30, lineHeight: 1.15 }}>
              {l}
            </div>
          ))}
          <div
            style={{
              ...oneLine,
              marginTop: 10,
              paddingTop: 8,
              borderTop: `3px dashed ${INK}`,
              fontSize: 21,
              lineHeight: 1.3,
            }}
          >
            {`@${d.username}`}
          </div>
          <div style={{ display: 'flex', fontSize: 21, lineHeight: 1.3 }}>{d.totalLabel}</div>
          <div
            style={abs(150, -20, {
              width: 110,
              height: 34,
              background: 'rgba(255, 79, 163, 0.75)',
              transform: 'rotate(-8deg)',
            })}
          />
        </div>

        {concerts.map((c, i) => (
          <Print key={c.rank} c={c} src={photos[i] ?? null} p={L.prints[i]!} i={i} />
        ))}

        {/* names, each line cut from a different magazine */}
        <div style={abs(X, L.namesTop, { flexDirection: 'column', gap: ENTRY_GAP, width: INNER })}>
          {concerts.map((c, i) => {
            const b = L.names[i]!;
            const st = b.style;
            const metaStrip = (
              <div
                style={{
                  ...oneLine,
                  flexShrink: 1,
                  padding: '5px 10px',
                  background: '#fff',
                  boxShadow: `3px 4px 0 ${SHADOW}`,
                  fontFamily: MONO,
                  fontSize: META_FS,
                  lineHeight: META_LH,
                  transform: `rotate(${i % 2 ? 0.8 : -0.6}deg)`,
                }}
              >
                {meta(c)}
              </div>
            );
            return (
              <div key={c.rank} style={{ display: 'flex', alignItems: 'flex-start' }}>
                {L.n > 1 && (
                  <div style={{ display: 'flex', marginRight: DOT_GAP, marginTop: (b.stripH - DOT) / 2 }}>
                    <Sticker rank={c.rank} color={STICKERS[i]!} size={DOT} rot={i % 2 ? 8 : -10} />
                  </div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: LINE_GAP, flexShrink: 1 }}>
                  {b.lines.map((line, k) => {
                    const strip = (
                      <div
                        style={{
                          ...oneLine,
                          flexShrink: 1,
                          padding: `${NAME_PAD_Y}px ${NAME_PAD_X}px`,
                          background: st.bg,
                          color: st.fg,
                          fontFamily: st.font,
                          fontWeight: st.weight,
                          fontSize: b.fontSize,
                          lineHeight: NAME_LH,
                          transform: `rotate(${(i + k) % 2 ? 1 : -1.4}deg)`,
                        }}
                      >
                        {line}
                      </div>
                    );
                    const last = k === b.lines.length - 1;
                    return (
                      <div
                        key={k}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 16,
                          marginLeft: k ? LINE_INDENT : 0,
                        }}
                      >
                        {strip}
                        {last && b.metaInline && metaStrip}
                      </div>
                    );
                  })}
                  {!b.metaInline && (
                    <div style={{ display: 'flex', marginLeft: b.lines.length > 1 ? LINE_INDENT + 12 : 12 }}>
                      {metaStrip}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* facts on label-maker tape */}
        <div style={abs(X, L.factsTop, { flexDirection: 'column', gap: FACT_GAP, width: INNER })}>
          {L.facts.map((row, r) => (
            <div key={r} style={{ display: 'flex', gap: 14 }}>
              {row.map((f) => (
                <div
                  key={f.i}
                  style={{
                    ...oneLine,
                    flexShrink: 1,
                    padding: `8px ${FACT_PAD_X}px`,
                    background: INK,
                    color: '#fff',
                    fontFamily: MONO,
                    fontSize: FACT_FS,
                    letterSpacing: FACT_LS,
                    lineHeight: 1.3,
                    transform: `rotate(${[-1, 0.8, -0.5, 1.2][f.i % 4]}deg)`,
                    boxShadow: `3px 4px 0 rgba(0,0,0,0.35)`,
                  }}
                >
                  <span style={{ color: FACT_LABEL[f.i % 4], fontWeight: 700 }}>{f.label}</span>
                  {` ${f.value}`}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  },
};

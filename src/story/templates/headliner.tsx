/**
 * #1 as a full-bleed colour poster; #2 and #3 as two quiet rows; facts in one or two muted lines.
 *
 * Satori can't measure text, so the layout is computed up front (`headlinerLayout`): everything is
 * anchored to Instagram's bottom UI and the poster gets whatever height is left, so one or two picks
 * get a taller photo instead of empty space. #1's name takes the biggest size that fits (two lines; three only for very long names).
 */
import type { StoryConcert, StoryData } from '../data.ts';
import { DISPLAY, MONO, TEXT } from '../fonts.ts';
import { lineCount, textWidth as measureWidth } from '../measure.ts';
import { H, SAFE_BOTTOM, SAFE_TOP, W, type StoryTemplate } from '../template.ts';
import { clamp, meta, oneLine, Photo, RED } from './parts.tsx';

const X = 72;
const INNER = W - 2 * X;
const ROW = 150;
const ROW_GAP = 28;
const ROW_TEXT_W = INNER - ROW - 32;
const ROWS_GAP = 40; // poster → rows
const FACTS_GAP = 44; // rows (or poster) → facts
const FACT_FS = 28;
const FACT_LH = FACT_FS * 1.45;
/** Where the last line of text ends: a little above Instagram's bottom UI. */
const BOTTOM = SAFE_BOTTOM - 20;
const HERO_MIN = 960;
const HERO_MAX = 1480;
/** #1's name block, below the name itself: meta line + padding to the poster's bottom edge. */
const HERO_PAD = 30;
const CHIP_H = 44;
const META_FS = 32;
const NAME_LH = 1.06;
/** #1's name sizes, biggest first; the big ones only on one line. */
const NAME_SIZES = [
  { fontSize: 128, maxLines: 1 },
  { fontSize: 108, maxLines: 1 },
  { fontSize: 92, maxLines: 2 },
  { fontSize: 78, maxLines: 2 },
  { fontSize: 66, maxLines: 2 },
  { fontSize: 60, maxLines: 3 },
] as const;

const FACE = {
  display: { font: DISPLAY, weight: 800 },
  bold: { font: TEXT, weight: 700 },
  text: { font: TEXT, weight: 400 },
} as const;

/** Width in px, measured with the real font metrics (see ../measure.ts). */
function textWidth(text: string, fontSize: number, font: keyof typeof FACE) {
  return measureWidth(text, { ...FACE[font], size: fontSize });
}

/** Lines Satori will wrap the text into; Infinity when a single word is wider than the line. */
function wrapLines(text: string, fontSize: number, font: keyof typeof FACE, width: number) {
  const style = { ...FACE[font], size: fontSize };
  if (
    text
      .trim()
      .split(/\s+/)
      .some((word) => measureWidth(word, style) > width)
  )
    return Infinity;
  return lineCount(text, style, width);
}

export function heroName(name: string) {
  for (const s of NAME_SIZES) {
    const lines = wrapLines(name, s.fontSize, 'display', INNER * 0.96);
    if (lines <= s.maxLines) return { fontSize: s.fontSize, lines };
  }
  const last = NAME_SIZES.at(-1)!;
  return { fontSize: last.fontSize, lines: last.maxLines };
}

/** #2/#3: one line at 44 px, or two at 36 px for long names. */
export function rowName(name: string) {
  return wrapLines(name, 44, 'bold', ROW_TEXT_W * 0.96) <= 1
    ? { fontSize: 44, lines: 1 }
    : { fontSize: 36, lines: 2 };
}

const factText = (f: StoryData['facts'][number]) =>
  /^\d+$/.test(f.value) ? `${f.value} ${f.label.toLowerCase()}` : f.value;

/**
 * Facts packed into whole lines (never broken inside a fact). Facts are ordered most interesting
 * first, so the ones that don't fit in `maxLines` are dropped from the end.
 */
export function factLines(d: StoryData, maxLines: number) {
  const items = [d.totalLabel, ...d.facts.map(factText)];
  const sep = '  ·  ';
  const width = INNER * 0.94;
  const lines: string[] = [];
  for (const item of items) {
    const cur = lines.at(-1);
    if (cur !== undefined && textWidth(cur + sep + item, FACT_FS, 'text') <= width) {
      lines[lines.length - 1] = cur + sep + item;
    } else if (lines.length < maxLines && textWidth(item, FACT_FS, 'text') <= width) {
      lines.push(item);
    }
  }
  return lines;
}

/** Header over the poster: "Top gigs of 2025", "The gig of 2025". */
export function headerLabel(d: StoryData) {
  const label = /of the year$/i.test(d.picksLabel)
    ? d.picksLabel.replace(/of the year$/i, `of ${d.year}`)
    : `${d.picksLabel} ${d.year}`;
  return /^gig\b/i.test(label) ? `The ${label.toLowerCase()}` : label;
}

export function headlinerLayout(d: StoryData) {
  const rest = Math.max(0, d.concerts.length - 1);
  const rows = d.concerts.slice(1).map((c) => rowName(c.name));
  const rowsH = rest ? ROWS_GAP + rest * ROW + (rest - 1) * ROW_GAP : 0;
  const facts = factLines(d, rest ? 2 : 3);
  const factsH = facts.length ? FACTS_GAP + facts.length * FACT_LH : 0;
  const hero = Math.round(Math.max(HERO_MIN, Math.min(HERO_MAX, BOTTOM - rowsH - factsH)));
  const name = d.concerts[0] ? heroName(d.concerts[0].name) : { fontSize: 0, lines: 0 };
  // Top of #1's rank chip: must stay well clear of the header.
  const nameTop = hero - HERO_PAD - META_FS * 1.25 - 14 - name.lines * name.fontSize * NAME_LH - 18 - CHIP_H;
  return { hero, rows, facts, name, nameTop, contentBottom: hero + rowsH + factsH };
}

/** Red label: high contrast on any photo. */
function Chip({ children, size = 30 }: { children: string; size?: number }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        height: size + 14,
        padding: '0 12px',
        background: RED,
        color: '#fff',
        fontFamily: MONO,
        fontWeight: 700,
        fontSize: size,
        lineHeight: 1,
      }}
    >
      {children}
    </div>
  );
}

const initial = (name: string) => [...name.trim()][0]?.toUpperCase() ?? '•';

/** No photo for #1: a dark red field with the name's initial, so the poster still reads as one. */
function HeroFallback({ c, height }: { c: StoryConcert | undefined; height: number }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: W,
        height,
        backgroundImage: 'linear-gradient(160deg, #5a0805 0%, #2a0302 45%, #000 100%)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          fontFamily: DISPLAY,
          fontSize: 900,
          lineHeight: 1,
          color: 'rgba(255,255,255,0.06)',
          marginTop: -height * 0.12,
        }}
      >
        {c ? initial(c.name) : ''}
      </div>
    </div>
  );
}

function Thumb({ c, src }: { c: StoryConcert; src: string | null }) {
  return (
    <div style={{ display: 'flex', position: 'relative', width: ROW, height: ROW }}>
      {src ? (
        <Photo src={src} width={ROW} height={ROW} />
      ) : (
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'flex-end',
            width: ROW,
            height: ROW,
            background: '#1c1c1c',
            padding: '0 14px 8px 0',
            fontFamily: DISPLAY,
            fontSize: 92,
            lineHeight: 1,
            color: '#3d3d3d',
            overflow: 'hidden',
          }}
        >
          {initial(c.name)}
        </div>
      )}
      <div style={{ display: 'flex', position: 'absolute', top: 0, left: 0 }}>
        <Chip size={24}>{`#${c.rank}`}</Chip>
      </div>
    </div>
  );
}

export const headliner: StoryTemplate = {
  credit: { left: X, color: '#8a8a8a', fontFamily: MONO, fontSize: 20, letterSpacing: 3, uppercase: true },
  id: 'headliner',
  name: 'Headliner',
  description: 'Your #1 as a full-bleed poster, the rest below',
  photo: (rank, d) =>
    rank === 1
      ? { width: W, height: headlinerLayout(d).hero, mode: 'color' }
      : { width: ROW, height: ROW, mode: 'color' },
  render: (d: StoryData, photos) => {
    const { hero, rows, facts, name } = headlinerLayout(d);
    const [first, ...rest] = d.concerts;
    const shadow = '0 2px 16px rgba(0,0,0,0.55)';
    return (
      <div
        style={{
          width: W,
          height: H,
          display: 'flex',
          flexDirection: 'column',
          background: '#000',
          color: '#fff',
          fontFamily: TEXT,
        }}
      >
        <div style={{ display: 'flex', position: 'relative', width: W, height: hero }}>
          {photos[0] ? (
            <Photo src={photos[0]} width={W} height={hero} />
          ) : (
            <HeroFallback c={first} height={hero} />
          )}
          {/* Top: darkens Instagram's own UI zone and the header; bottom: fades into the black page. */}
          <div
            style={{
              display: 'flex',
              position: 'absolute',
              top: 0,
              left: 0,
              width: W,
              height: hero,
              backgroundImage: `linear-gradient(180deg, rgba(0,0,0,0.82) 0px, rgba(0,0,0,0.62) ${SAFE_TOP + 90}px, rgba(0,0,0,0) ${SAFE_TOP + 300}px, rgba(0,0,0,0) ${Math.round(hero * 0.5)}px, rgba(0,0,0,0.72) ${Math.round(hero * 0.78)}px, rgba(0,0,0,1) ${hero}px)`,
            }}
          />
          <div
            style={{
              display: 'flex',
              position: 'absolute',
              top: SAFE_TOP + 10,
              left: X,
              width: INNER,
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: 30,
              fontWeight: 700,
              letterSpacing: 4,
              textTransform: 'uppercase',
              textShadow: shadow,
            }}
          >
            <div style={{ display: 'flex', flexShrink: 0 }}>{headerLabel(d)}</div>
            <div style={{ ...oneLine, maxWidth: INNER * 0.42, color: '#e6e6e6' }}>{`@${d.username}`}</div>
          </div>
          {first && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                position: 'absolute',
                left: X,
                bottom: HERO_PAD,
                width: INNER,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <Chip>#1</Chip>
                {first.festival && (
                  <div
                    style={{
                      display: 'flex',
                      marginLeft: 16,
                      fontSize: 24,
                      fontWeight: 700,
                      letterSpacing: 4,
                      textTransform: 'uppercase',
                      color: '#e6e6e6',
                      textShadow: shadow,
                    }}
                  >
                    Festival
                  </div>
                )}
              </div>
              <div
                style={{
                  ...clamp(name.lines),
                  fontFamily: DISPLAY,
                  fontSize: name.fontSize,
                  lineHeight: NAME_LH,
                  letterSpacing: name.fontSize >= 100 ? -2 : -1,
                  marginTop: 18,
                  textShadow: shadow,
                }}
              >
                {first.name}
              </div>
              <div
                style={{
                  ...oneLine,
                  fontSize: META_FS,
                  lineHeight: 1.25,
                  color: '#dadada',
                  marginTop: 14,
                }}
              >
                {meta(first)}
              </div>
            </div>
          )}
        </div>

        {rest.length > 0 && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              padding: `${ROWS_GAP}px ${X}px 0`,
              gap: ROW_GAP,
            }}
          >
            {rest.map((c, i) => {
              const r = rows[i]!;
              return (
                <div key={c.rank} style={{ display: 'flex', alignItems: 'center', height: ROW }}>
                  <Thumb c={c} src={photos[i + 1] ?? null} />
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      marginLeft: 32,
                      width: ROW_TEXT_W,
                    }}
                  >
                    <div
                      style={{
                        ...(r.lines > 1 ? clamp(2) : oneLine),
                        fontWeight: 700,
                        fontSize: r.fontSize,
                        lineHeight: 1.12,
                      }}
                    >
                      {c.name}
                    </div>
                    <div style={{ ...oneLine, fontSize: 28, color: '#9c9c9c', marginTop: 6 }}>{meta(c)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {facts.length > 0 && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              padding: `${FACTS_GAP}px ${X}px 0`,
              fontSize: FACT_FS,
              lineHeight: 1.45,
              color: '#8e8e8e',
            }}
          >
            {facts.map((line) => (
              <div key={line} style={{ ...oneLine, width: INNER }}>
                {line}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  },
};

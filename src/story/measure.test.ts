// @vitest-environment node
import satori from 'satori';
import { Window } from 'happy-dom';
import { describe, expect, it } from 'vitest';
import { buildFixturePayload } from '../shared/parse/fixture-payload.ts';
import { loadFonts } from '../server/render.ts';
import { DISPLAY, GEOMETRIC, HELVETICA, MONO, TEXT } from './fonts.ts';
import { fitSize, lineCount, textWidth, wrapText, type TextStyle } from './measure.ts';

/** How many lines Satori itself lays the text out in: render with auto height, divide by line height. */
async function satoriLines(text: string, style: TextStyle, width: number): Promise<number> {
  const lineHeight = Math.round(style.size * 1.25);
  const svg = await satori(
    {
      type: 'div',
      props: {
        style: {
          display: 'flex',
          width,
          fontFamily: style.font,
          fontWeight: style.weight,
          fontSize: style.size,
          lineHeight: `${lineHeight}px`,
          letterSpacing: style.letterSpacing ?? 0,
        },
        children: text,
      },
    } as never,
    { width, fonts: await loadFonts() },
  );
  const height = Number(svg.match(/height="([\d.]+)"/)![1]);
  return Math.round(height / lineHeight);
}

const NAMES = [
  'Rome',
  'Pink Turns Blue',
  'Hania Rani & Ensemble present: Ghosts',
  'Ludzie wschodu, Bialoruska zimna fala',
  'Петля Пристрастия',
  'Георгий Добро',
  'Santander Letnie Brzmienia 2025',
  'And So I Watch You From Afar',
  'Mieżyński, 2KOŁA Pub Motocyklowy',
  'TisDass (tuareg rock, Niger) @ Ada Puławska',
];
const STYLES: [string, TextStyle][] = [
  ['Unbounded 800', { font: DISPLAY, weight: 800, size: 56 }],
  ['Arimo 700 tracked', { font: HELVETICA, weight: 700, size: 52, letterSpacing: -1.5 }],
  ['Arimo 700 wide tracking', { font: HELVETICA, weight: 700, size: 30, letterSpacing: 4 }],
  ['Jost 700', { font: GEOMETRIC, weight: 700, size: 46 }],
  ['Inter 700', { font: TEXT, weight: 700, size: 36 }],
  ['JetBrains Mono 400', { font: MONO, weight: 400, size: 26 }],
];
const WIDTHS = [310, 560, 832];

describe('measure agrees with Satori', () => {
  for (const [label, style] of STYLES) {
    it(`${label}: line counts for real names at 3 widths`, async () => {
      const mismatches: string[] = [];
      for (const name of NAMES) {
        for (const w of WIDTHS) {
          const ours = lineCount(name, style, w);
          const theirs = await satoriLines(name, style, w);
          if (ours !== theirs) mismatches.push(`"${name}" @${w}px: ours ${ours}, Satori ${theirs}`);
        }
      }
      expect(mismatches).toEqual([]);
    });
  }
});

describe('measure on every real concert title', () => {
  it('2025 and 2026 titles, two fonts', { timeout: 120_000 }, async () => {
    const win = new Window({ settings: { disableJavaScriptEvaluation: true, disableCSSFileLoading: true } });
    const parse = (html: string) =>
      new win.DOMParser().parseFromString(html, 'text/html') as unknown as Document;
    const titles = new Set<string>();
    for (const year of [2025, 2026] as const) {
      for (const c of (await buildFixturePayload(year, parse, { details: 'none' })).concerts)
        titles.add(c.title);
    }
    await win.happyDOM.close();
    const cases: [TextStyle, number][] = [
      [{ font: DISPLAY, weight: 800, size: 56 }, 560],
      [{ font: HELVETICA, weight: 700, size: 52, letterSpacing: -1.5 }, 832],
    ];
    // Never fewer lines than Satori (that would let text run into the next block); an extra line now and
    // then only wastes a little space. Known case: "TYLKO TEN PUNK - CHAIN CULT, …" (6 vs 5).
    const under: string[] = [];
    let exact = 0;
    let total = 0;
    for (const t of titles) {
      for (const [style, w] of cases) {
        const ours = lineCount(t, style, w);
        const theirs = await satoriLines(t, style, w);
        total++;
        if (ours === theirs) exact++;
        if (ours < theirs) under.push(`"${t}" ${style.size}px @${w}: ours ${ours}, Satori ${theirs}`);
      }
    }
    expect(titles.size).toBeGreaterThan(60);
    expect(under).toEqual([]);
    expect(exact / total).toBeGreaterThanOrEqual(0.98);
  });
});

describe('measure helpers', () => {
  const style: TextStyle = { font: HELVETICA, weight: 700, size: 52 };

  it('width grows with text, letter spacing and size', () => {
    expect(textWidth('Rome', style)).toBeGreaterThan(0);
    expect(textWidth('Romeo', style)).toBeGreaterThan(textWidth('Rome', style));
    expect(textWidth('Rome', { ...style, letterSpacing: 2 })).toBeCloseTo(textWidth('Rome', style) + 8, 5);
    expect(textWidth('Rome', { ...style, size: 104 })).toBeCloseTo(textWidth('Rome', style) * 2, 5);
  });

  it('Cyrillic and Polish letters are measured with their own subset (not as zero-width boxes)', () => {
    expect(textWidth('Ж', style)).toBeGreaterThan(20);
    expect(textWidth('ł', style)).toBeGreaterThan(5);
  });

  it('wraps at word boundaries, a single long word stays on one line', () => {
    expect(wrapText('Hania Rani & Ensemble present: Ghosts', style, 832)).toEqual([
      'Hania Rani & Ensemble present:',
      'Ghosts',
    ]);
    expect(wrapText('Supercalifragilisticexpialidocious', style, 200)).toHaveLength(1);
    expect(wrapText('', style, 200)).toEqual(['']);
  });

  it('fitSize picks the largest size that fits', () => {
    const long = 'Hania Rani & Ensemble present: Ghosts, live with strings and choir';
    expect(fitSize('Rome', style, 832, 1, [52, 44, 38])).toEqual({ size: 52, lines: 1 });
    const f = fitSize(long, style, 832, 2, [52, 44, 38]);
    expect(f.lines).toBeLessThanOrEqual(2);
    expect(f.size).toBeLessThan(52);
  });
});

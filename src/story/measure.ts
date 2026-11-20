/**
 * Text measurement for story templates, with the same font files and the same line-break rules
 * Satori uses, so a template can know before rendering how wide a name is and how many lines it takes.
 * Server/test only (reads the font files); the browser never imports templates.
 *
 *   textWidth('Pink Turns Blue', { font: DISPLAY, weight: 800, size: 64 })       → px
 *   lineCount('Hania Rani & Ensemble present: Ghosts', { font: HELVETICA, weight: 700, size: 52 }, 832) → 2
 *
 * measure.test.ts checks these numbers against Satori's own layout.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import LineBreaker from 'linebreak';
import opentype, { type Font } from 'opentype.js';
import { FONT_FILES, SUBSETS } from './fonts.ts';

export interface TextStyle {
  /** A family constant from fonts.ts (e.g. DISPLAY) or a bare family name ("Unbounded"). */
  font: string;
  weight: number;
  /** px */
  size: number;
  /** px added after every character, like CSS letter-spacing. */
  letterSpacing?: number;
}

const require = createRequire(import.meta.url);
const fonts = new Map<string, Font[]>(); // "Family|weight" → one Font per subset, in fallback order

function load(): void {
  if (fonts.size) return;
  for (const [pkg, family, weight] of FONT_FILES) {
    const dir = join(dirname(require.resolve(`@fontsource/${pkg}/package.json`)), 'files');
    fonts.set(
      `${family}|${weight}`,
      SUBSETS.map((subset) => {
        const buf = readFileSync(join(dir, `${pkg}-${subset}-${weight}-normal.woff`));
        return opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
      }),
    );
  }
}

/** "Unbounded latin, Unbounded latin-ext, …" or "Unbounded" → "Unbounded" */
const baseFamily = (font: string) =>
  font
    .split(',')[0]!
    .trim()
    .replace(new RegExp(` (${SUBSETS.join('|')})$`), '');

function fontsFor(style: TextStyle): Font[] {
  load();
  const list = fonts.get(`${baseFamily(style.font)}|${style.weight}`);
  if (!list) throw new Error(`No font loaded for ${baseFamily(style.font)} ${style.weight}`);
  return list;
}

/** Width in px of a single line of text. */
export function textWidth(text: string, style: TextStyle): number {
  const list = fontsFor(style);
  const scale = style.size;
  let width = 0;
  let prev: { font: Font; glyph: opentype.Glyph } | null = null;
  for (const ch of text) {
    // Same fallback as Satori: the first subset that has the glyph.
    const font = list.find((f) => f.charToGlyphIndex(ch) > 0) ?? list[0]!;
    const glyph = font.charToGlyph(ch);
    width += ((glyph.advanceWidth ?? 0) * scale) / font.unitsPerEm;
    if (prev && prev.font === font)
      width += (font.getKerningValue(prev.glyph, glyph) * scale) / font.unitsPerEm;
    width += style.letterSpacing ?? 0;
    prev = { font, glyph };
  }
  return width;
}

/**
 * Break text into lines the way Satori does, verified against it in measure.test.ts:
 * - break opportunities from UAX #14 (the `linebreak` package Satori uses);
 * - trailing spaces hang past the edge and never force a break;
 * - a line is the sum of its words measured one by one (no kerning across word boundaries);
 * - a word wider than the box widens the box (flex min-content), so lines wrap at that word's width.
 */
export function wrapText(text: string, style: TextStyle, maxWidth: number): string[] {
  const segments: string[] = [];
  const breaker = new LineBreaker(text);
  let last = 0;
  for (let bk = breaker.nextBreak(); bk; bk = breaker.nextBreak()) {
    segments.push(text.slice(last, bk.position));
    last = bk.position;
  }
  const widest = Math.max(0, ...segments.map((s) => textWidth(s.trimEnd(), style)));
  const width = Math.max(maxWidth, widest);
  const lines: string[] = [];
  let line = '';
  let lineWidth = 0; // words so far, each with its trailing space
  for (const seg of segments) {
    const fitWidth = lineWidth + textWidth(seg.trimEnd(), style);
    if (line && fitWidth > width) {
      lines.push(line.trimEnd());
      line = seg;
      lineWidth = textWidth(seg, style);
    } else {
      line += seg;
      lineWidth += textWidth(seg, style);
    }
  }
  if (line.trim() || !lines.length) lines.push(line.trimEnd());
  return lines;
}

export function lineCount(text: string, style: TextStyle, maxWidth: number): number {
  return wrapText(text, style, maxWidth).length;
}

/** Largest font size from `sizes` (tried in order) at which text fits in maxLines lines. */
export function fitSize(
  text: string,
  style: Omit<TextStyle, 'size'>,
  maxWidth: number,
  maxLines: number,
  sizes: number[],
): { size: number; lines: number } {
  for (const size of sizes) {
    const lines = lineCount(text, { ...style, size }, maxWidth);
    if (lines <= maxLines) return { size, lines };
  }
  const size = sizes.at(-1)!;
  return { size, lines: Math.min(maxLines, lineCount(text, { ...style, size }, maxWidth)) };
}

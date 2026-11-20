/**
 * Font families for story templates. Satori does not fall back between same-named fonts, so each
 * Unicode subset is registered under its own name and templates list all of them (latin, Polish/Czech
 * letters, Cyrillic).
 */
export const SUBSETS = ['latin', 'latin-ext', 'cyrillic'] as const;

const family = (name: string) => SUBSETS.map((s) => `${name} ${s}`).join(', ');

export const DISPLAY = family('Unbounded');
export const TEXT = family('Inter');
export const MONO = family('JetBrains Mono');
/** Arimo: free, metric-compatible with Helvetica/Arial (Helvetica itself is licensed). */
export const HELVETICA = family('Arimo');
/** Jost: free geometric sans in the spirit of Futura, for the Bauhaus design. */
export const GEOMETRIC = family('Jost');

/** Files to load: [fontsource package, family name, weight]. */
export const FONT_FILES = [
  ['unbounded', 'Unbounded', 800],
  ['inter', 'Inter', 400],
  ['inter', 'Inter', 700],
  ['jetbrains-mono', 'JetBrains Mono', 400],
  ['jetbrains-mono', 'JetBrains Mono', 700],
  ['arimo', 'Arimo', 400],
  ['arimo', 'Arimo', 700],
  ['jost', 'Jost', 500],
  ['jost', 'Jost', 700],
] as const;

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const FIXTURES = join(import.meta.dirname, '__fixtures__');

export function readFixture(name: string): string {
  return readFileSync(join(FIXTURES, name), 'utf8');
}

/**
 * Parse HTML the way the browser's DOMParser would (happy-dom in tests).
 * Scripts and iframes are stripped first: the parsers never look at them and happy-dom would try to load them.
 */
export function parseHtml(html: string): Document {
  const cleaned = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe\b[\s\S]*?<\/iframe>/gi, '');
  return new DOMParser().parseFromString(cleaned, 'text/html');
}

/** Load a saved last.fm page as a Document. */
export function loadFixture(name: string): Document {
  return parseHtml(readFixture(name));
}

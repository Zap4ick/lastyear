import { describe, expect, it } from 'vitest';
import { STORY_DESIGNS } from './catalog.ts';
import { TEMPLATES } from './templates/index.ts';

describe('story design catalog', () => {
  it('matches the real templates (ids, names, order)', () => {
    expect(STORY_DESIGNS.map((d) => [d.id, d.name])).toEqual(TEMPLATES.map((t) => [t.id, t.name]));
  });
});

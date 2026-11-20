import type { StoryTemplate } from '../template.ts';
import { bands } from './bands.tsx';
import { bauhaus } from './bauhaus.tsx';
import { collage } from './collage.tsx';
import { columns } from './columns.tsx';
import { headliner } from './headliner.tsx';
import { indexList } from './index-list.tsx';
import { poster } from './poster.tsx';
import { swiss } from './swiss.tsx';

// Swiss is the house design (picked 19.11.2026); the first entry is the default on the design page.
export const TEMPLATES: StoryTemplate[] = [
  swiss,
  bauhaus,
  collage,
  poster,
  bands,
  headliner,
  indexList,
  columns,
];

export const templateById = (id: string) => TEMPLATES.find((t) => t.id === id);

// The web app lists designs from `../catalog.ts`, which a test keeps in sync with this list.

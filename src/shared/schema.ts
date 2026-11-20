/**
 * Runtime validation of the import payload. It arrives from a URL fragment and is then POSTed to our
 * server, so neither side can trust it: bounded sizes, plain strings, https image URLs on last.fm's CDN only.
 */
import { z } from 'zod';
import type { ImportPayload } from './types.ts';

const str = (max = 300) => z.string().max(max);
const sitePath = z
  .string()
  .max(500)
  .regex(/^\/[^\s]*$/, 'site-relative path');
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const cdnImage = z
  .string()
  .max(300)
  .regex(/^https:\/\/lastfm(?:-img)?\.freetls\.fastly\.net\/i\/u\/ar0\/[0-9a-f]{32}(\.\w{2,5})?$/);

const performer = z.object({ name: str(), url: sitePath, imageUrl: cdnImage.nullable() });

const details = z.object({
  title: str(),
  date: z.union([date, z.literal('')]),
  performers: z.array(performer).max(200),
  lineupTotal: z.number().int().nonnegative().nullable(),
  headerImageUrl: cdnImage.nullable(),
  venue: z
    .object({ name: str(), street: str().nullable(), city: str().nullable(), country: str().nullable() })
    .nullable(),
});

const concert = z.object({
  id: z.string().regex(/^\d{1,12}$/),
  kind: z.enum(['event', 'festival']),
  url: sitePath,
  date,
  title: str(),
  lineup: z.array(str()).max(200),
  venue: str(),
  city: str(),
  country: str(),
  status: str(100),
  details: details.nullable(),
});

export const importPayloadSchema = z.object({
  v: z.literal(1),
  username: z
    .string()
    .min(2)
    .max(30)
    .regex(/^[A-Za-z0-9_.-]+$/),
  year: z.number().int().min(2002).max(2100),
  collectedAt: z.iso.datetime(),
  wentTo: z.number().int().nonnegative().nullable(),
  concerts: z.array(concert).max(600),
  warnings: z.array(str(500)).max(50),
});

// Compile-time check that the schema and the hand-written type agree.
type Parsed = z.infer<typeof importPayloadSchema>;
const _sameShape: [Parsed, ImportPayload] extends [ImportPayload, Parsed] ? true : never = true;
void _sameShape;

export function parseImportPayload(data: unknown): ImportPayload {
  return importPayloadSchema.parse(data) as ImportPayload;
}

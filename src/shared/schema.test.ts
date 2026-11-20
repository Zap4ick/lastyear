import { describe, expect, it } from 'vitest';
import { buildFixturePayload } from './parse/fixture-payload.ts';
import { parseHtml } from './parse/test-utils.ts';
import { importPayloadSchema, parseImportPayload } from './schema.ts';

describe('importPayloadSchema', () => {
  it('accepts what the collector produces', async () => {
    for (const year of [2025, 2026] as const) {
      const payload = await buildFixturePayload(year, parseHtml);
      expect(parseImportPayload(payload)).toEqual(payload);
    }
  });

  it('rejects images outside the last.fm CDN', async () => {
    const payload = await buildFixturePayload(2026, parseHtml);
    payload.concerts[0]!.details!.performers[0]!.imageUrl = 'https://evil.example/x.jpg';
    expect(importPayloadSchema.safeParse(payload).success).toBe(false);
  });

  it('rejects odd usernames and paths', async () => {
    const payload = await buildFixturePayload(2026, parseHtml);
    expect(importPayloadSchema.safeParse({ ...payload, username: '../admin' }).success).toBe(false);
    payload.concerts[0]!.url = 'javascript:alert(1)';
    expect(importPayloadSchema.safeParse(payload).success).toBe(false);
  });

  it('rejects oversized input', async () => {
    const payload = await buildFixturePayload(2026, parseHtml);
    payload.concerts[0]!.title = 'x'.repeat(301);
    expect(importPayloadSchema.safeParse(payload).success).toBe(false);
  });
});

// @vitest-environment node
import type { FastifyRequest } from 'fastify';
import { describe, expect, it } from 'vitest';
import { logRequest } from './app.ts';
import { openDb } from './db.ts';

describe('request logs', () => {
  it('hold no IP address and no username, only the route pattern', () => {
    const req = {
      method: 'GET',
      url: '/api/user/demo123?x=1',
      ip: '203.0.113.7',
      routeOptions: { url: '/api/user/:name' },
    } as unknown as FastifyRequest;
    expect(logRequest(req)).toEqual({ method: 'GET', url: '/api/user/:name' });
    const unrouted = { ...req, url: '/nope?q=1', routeOptions: {} } as unknown as FastifyRequest;
    expect(logRequest(unrouted)).toEqual({ method: 'GET', url: '/nope' });
  });
});

describe('forgetUser', () => {
  it('erases every result and cached lookup about that user, and nobody else', () => {
    const db = openDb(':memory:');
    const add = (id: string, username: string) =>
      db.insertResult({ id, username, year: 2026, payload: '{}', tokenHash: 'x' });
    add('mine1', 'demo123');
    add('mine2', 'DEMO123');
    add('other', 'demo1234');
    const ttl = 60_000;
    db.cacheSet('lastfm:user:demo123', {}, ttl);
    db.cacheSet('lastfm:chart:demo123:2026', {}, ttl);
    db.cacheSet('lastfm:user:demo1234', {}, ttl);
    db.cacheSet('lastfm:chart:demo1234:2026', {}, ttl);
    db.cacheSet('lastfm:tags:oasis', [], ttl);

    expect(db.resultsOfUser('Demo123').map((r) => r.id)).toEqual(['mine1', 'mine2']);
    expect(db.forgetUser('Demo123')).toEqual({ results: 2, cached: 2 });
    expect(db.getResult('mine1')).toBeUndefined();
    expect(db.getResult('mine2')).toBeUndefined();
    expect(db.getResult('other')).toBeDefined();
    expect(db.cacheGet('lastfm:user:demo1234')).toBeDefined();
    expect(db.cacheGet('lastfm:chart:demo1234:2026')).toBeDefined();
    expect(db.cacheGet('lastfm:tags:oasis')).toBeDefined();
    db.close();
  });
});

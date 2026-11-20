import type { ScrobbleChart, Tag } from '../shared/stats.ts';
import type { ImportPayload } from '../shared/types.ts';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
  ) {
    super(`${status} ${code}`);
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new ApiError(res.status, body.error ?? 'error');
  return body as T;
}

export interface LastfmUser {
  name: string;
  realname: string | null;
  url: string;
  image: string | null;
  playcount: number;
}

export const api = {
  user: (name: string) => request<LastfmUser>(`/api/user/${encodeURIComponent(name)}`),
  bookmarklet: () => request<{ appUrl: string; standalone: string; loader: string }>('/api/bookmarklet'),
  saveResult: (payload: ImportPayload, mergeInto?: { id: string; token: string }) =>
    request<{ id: string; token: string; merged: boolean }>('/api/results', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payload, mergeInto }),
    }),
  deleteResult: async (id: string, token: string) => {
    const res = await fetch(`/api/results/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { 'X-Result-Token': token },
    });
    if (!res.ok && res.status !== 404) throw new ApiError(res.status, 'delete-failed');
  },
  result: (id: string) =>
    request<{ id: string; payload: ImportPayload }>(`/api/results/${encodeURIComponent(id)}`),
  tags: (artists: string[]) =>
    request<{ tags: Record<string, Tag[]> }>(
      `/api/tags?${artists.map((a) => `artist=${encodeURIComponent(a)}`).join('&')}`,
    ),
  scrobbles: (user: string, year: number) =>
    request<ScrobbleChart>(`/api/scrobbles/${encodeURIComponent(user)}/${year}`),
  photos: (artists: string[]) =>
    request<{ photos: Record<string, string | null> }>(
      `/api/photos?${artists.map((a) => `artist=${encodeURIComponent(a)}`).join('&')}`,
    ),
};

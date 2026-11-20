/**
 * Compact, URL-safe encoding for handing data from the bookmarklet to the app in a URL fragment:
 *   "v1." + base64url(deflate-raw(JSON))
 * Uses CompressionStream, available in all current browsers and Node 18+.
 */

const PREFIX = 'v1.';

export async function encodePayload(data: unknown): Promise<string> {
  const bytes = await pipe(
    new TextEncoder().encode(JSON.stringify(data)),
    new CompressionStream('deflate-raw'),
  );
  return PREFIX + toBase64Url(bytes);
}

export async function decodePayload<T = unknown>(encoded: string): Promise<T> {
  const s = encoded.startsWith('#') ? encoded.slice(1) : encoded;
  if (!s.startsWith(PREFIX)) throw new Error('Unsupported payload version');
  const bytes = await pipe(fromBase64Url(s.slice(PREFIX.length)), new DecompressionStream('deflate-raw'));
  return JSON.parse(new TextDecoder().decode(bytes)) as T;
}

async function pipe(
  input: Uint8Array,
  transform: CompressionStream | DecompressionStream,
): Promise<Uint8Array> {
  const stream = new Blob([input as BlobPart]).stream().pipeThrough(transform);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

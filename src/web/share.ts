import { useEffect, useState } from 'react';

export type FileState = 'loading' | 'ready' | 'error';

/**
 * Fetch the story PNG ahead of time and keep it as a File.
 * navigator.share() must run right inside the tap (iOS Safari drops the gesture if we fetch first),
 * so the Share button hands over a file that is already here.
 */
export function useStoryFile(url: string | null, filename: string) {
  const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState<FileState>('loading');

  useEffect(() => {
    if (!url) return;
    const ctrl = new AbortController();
    setFile(null);
    setState('loading');
    fetch(url, { signal: ctrl.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.blob();
      })
      .then((blob) => {
        setFile(new File([blob], filename, { type: 'image/png' }));
        setState('ready');
      })
      .catch((e: unknown) => {
        if (!(e instanceof DOMException && e.name === 'AbortError')) setState('error');
      });
    return () => ctrl.abort();
  }, [url, filename]);

  return { file, state };
}

/** True where the system share sheet accepts image files (mobile Safari/Chrome, some desktops). */
export function canShareFile(file: File | null): file is File {
  try {
    return !!file && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

export type ShareOutcome = 'shared' | 'cancelled' | 'failed';

export async function shareFile(file: File, title: string): Promise<ShareOutcome> {
  try {
    await navigator.share({ files: [file], title });
    return 'shared';
  } catch (e) {
    // The user closing the share sheet is not an error.
    if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled';
    return 'failed';
  }
}

/** Save a File through a temporary object URL (works where the download attribute does). */
export function saveFile(file: File) {
  const url = URL.createObjectURL(file);
  const a = Object.assign(document.createElement('a'), { href: url, download: file.name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

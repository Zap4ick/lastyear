import { afterEach, describe, expect, it, vi } from 'vitest';
import { canShareFile, shareFile } from './share.ts';

const png = () => new File([new Uint8Array([137, 80, 78, 71])], 'story.png', { type: 'image/png' });

afterEach(() => vi.unstubAllGlobals());

function stubNavigator(nav: Partial<Navigator>) {
  vi.stubGlobal('navigator', { ...navigator, ...nav });
}

describe('canShareFile', () => {
  it('false without a file or without canShare (most desktops)', () => {
    stubNavigator({ canShare: undefined as unknown as Navigator['canShare'] });
    expect(canShareFile(png())).toBe(false);
    expect(canShareFile(null)).toBe(false);
  });

  it('asks the browser whether it accepts this file', () => {
    const canShare = vi.fn(() => true);
    stubNavigator({ canShare });
    const f = png();
    expect(canShareFile(f)).toBe(true);
    expect(canShare).toHaveBeenCalledWith({ files: [f] });
  });

  it('a throwing canShare counts as no', () => {
    stubNavigator({
      canShare: () => {
        throw new TypeError('nope');
      },
    });
    expect(canShareFile(png())).toBe(false);
  });
});

describe('shareFile', () => {
  it('shared', async () => {
    const share = vi.fn(async () => {});
    stubNavigator({ share });
    expect(await shareFile(png(), 'My top gigs of 2025')).toBe('shared');
    expect(share).toHaveBeenCalledWith(expect.objectContaining({ title: 'My top gigs of 2025' }));
  });

  it('closing the share sheet is a cancel, not a failure', async () => {
    stubNavigator({
      share: async () => {
        throw new DOMException('cancelled', 'AbortError');
      },
    });
    expect(await shareFile(png(), 't')).toBe('cancelled');
  });

  it('anything else is a failure (the page then saves the file instead)', async () => {
    stubNavigator({
      share: async () => {
        throw new DOMException('gesture expired', 'NotAllowedError');
      },
    });
    expect(await shareFile(png(), 't')).toBe('failed');
  });
});

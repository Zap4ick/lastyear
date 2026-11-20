import type { ReactElement } from 'react';
import type { StoryData } from './data.ts';

/** Instagram story canvas. Instagram's own UI covers roughly the top 250 px and the bottom 340 px. */
export const W = 1080;
export const H = 1920;
export const SAFE_TOP = 250;
export const SAFE_BOTTOM = H - 340;

/**
 * Every story says where it was made, small, in the strip just under SAFE_BOTTOM: content never
 * reaches it, and Instagram's reply bar sits lower still. The renderer draws it; templates style it.
 */
export const CREDIT_TOP = SAFE_BOTTOM + 44;
export const DEFAULT_CREDIT = 'lastyear.fly.dev';

export interface CreditStyle {
  /** Left edge, usually the template's text margin. */
  left: number;
  color: string;
  fontFamily: string;
  fontSize?: number;
  fontWeight?: number;
  letterSpacing?: number;
  uppercase?: boolean;
  /** A label behind the text, for designs whose decoration can run under it. */
  background?: string;
}

export type PhotoMode = 'color' | 'mono' | 'red';

export interface PhotoSpec {
  width: number;
  height: number;
  mode: PhotoMode;
}

export interface StoryTemplate {
  id: string;
  name: string;
  description: string;
  /**
   * Size and treatment of each concert's photo; the server prepares them before rendering.
   * Gets the whole story so a layout can depend on it (number of picks, name lengths).
   */
  photo: (rank: number, data: StoryData) => PhotoSpec;
  /**
   * Satori-compatible JSX: inline styles, flexbox only, every element with several children needs
   * display: flex. photos[i] is a ready data URI for data.concerts[i], or null.
   */
  render: (data: StoryData, photos: (string | null)[]) => ReactElement;
  /** How the "made with" line looks on this design (quiet, but readable on its background). */
  credit: CreditStyle;
}

import type { ReactElement } from 'react';
import type { StoryData } from './data.ts';

/** Instagram story canvas. Instagram's own UI covers roughly the top 250 px and the bottom 340 px. */
export const W = 1080;
export const H = 1920;
export const SAFE_TOP = 250;
export const SAFE_BOTTOM = H - 340;

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
}

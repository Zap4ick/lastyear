declare module 'linebreak' {
  /** Unicode line breaking (UAX #14), the same package Satori uses. */
  export default class LineBreaker {
    constructor(text: string);
    nextBreak(): { position: number; required: boolean } | null;
  }
}

/**
 * Loading indicator: a small disco ball that sways, sparkles and cycles through the story colors.
 * The colors and motion are CSS (`.disco*` in styles.css); the only script is a random start for each
 * mirror tile, so they twinkle out of step.
 */
import { useId, useMemo } from 'react';

const CX = 32;
const CY = 44;
const R = 22;
const STEP = 6;

/** Top-left corners of the mirror tiles whose centre falls inside the ball. */
const TILES: [number, number][] = [];
for (let y = CY - R; y < CY + R; y += STEP) {
  for (let x = CX - R; x < CX + R; x += STEP) {
    if (Math.hypot(x + STEP / 2 - CX, y + STEP / 2 - CY) < R) TILES.push([x, y]);
  }
}

const sparkle = (x: number, y: number, s: number) =>
  `M${x} ${y - s}Q${x} ${y} ${x + s} ${y}Q${x} ${y} ${x} ${y + s}Q${x} ${y} ${x - s} ${y}Q${x} ${y} ${x} ${y - s}Z`;

export function DiscoBall({ label, className = '' }: { label?: string; className?: string }) {
  const id = useId();
  const delays = useMemo(() => TILES.map(() => `-${(Math.random() * 1.8).toFixed(2)}s`), []);
  return (
    <span className={`disco ${className}`} role="status">
      <svg className="disco-ball" viewBox="0 0 64 76" aria-hidden="true">
        <defs>
          <clipPath id={`${id}clip`}>
            <circle cx={CX} cy={CY} r={R} />
          </clipPath>
          <radialGradient id={`${id}shine`} cx="0.35" cy="0.3" r="0.75">
            <stop offset="0" stopColor="#fff" stopOpacity="0.55" />
            <stop offset="0.6" stopColor="#fff" stopOpacity="0" />
            <stop offset="1" stopColor="#000" stopOpacity="0.25" />
          </radialGradient>
        </defs>
        <line className="disco-string" x1={CX} y1="0" x2={CX} y2={CY - R} />
        <circle cx={CX} cy={CY} r={R} fill="currentColor" />
        <g clipPath={`url(#${id}clip)`}>
          {TILES.map(([x, y], i) => (
            <rect
              key={i}
              className="disco-tile"
              x={x + 0.6}
              y={y + 0.6}
              width={STEP - 1.2}
              height={STEP - 1.2}
              style={{ animationDelay: delays[i] }}
            />
          ))}
        </g>
        <circle cx={CX} cy={CY} r={R} fill={`url(#${id}shine)`} />
        <path className="disco-sparkle" d={sparkle(56, 24, 5)} />
        <path className="disco-sparkle late" d={sparkle(7, 58, 4)} />
      </svg>
      {label ? <span className="disco-label">{label}</span> : <span className="sr-only">Loading</span>}
    </span>
  );
}

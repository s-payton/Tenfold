import type { CSSProperties } from 'react';

const COLORS = ['#e5484d', '#3e7bfa', '#22a06b', '#f2c037', '#fcb52b', '#f6f3ea'];
const PIECES_COUNT = 90;

/** A fixed shuffle, worked out once, so every render draws the same confetti. */
const pieces = (() => {
  let seed = 7;
  const next = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  return Array.from({ length: PIECES_COUNT }, (_, i) => ({
    key: i,
    style: {
      left: `${(next() * 100).toFixed(1)}%`,
      width: `${String(6 + Math.round(next() * 6))}px`,
      height: `${String(10 + Math.round(next() * 8))}px`,
      background: COLORS[i % COLORS.length],
      borderRadius: next() < 0.3 ? '50%' : '2px',
      animationDelay: `${(next() * 1.4).toFixed(2)}s`,
      animationDuration: `${(2.6 + next() * 1.8).toFixed(2)}s`,
      '--drift': `${String(Math.round((next() - 0.5) * 160))}px`,
      '--spin': `${String(Math.round(360 + next() * 720))}deg`,
    } as CSSProperties,
  }));
})();

/** Falls once over the whole screen when someone wins the game. */
export const Confetti = () => (
  <div className="confetti" aria-hidden="true">
    {pieces.map((p) => (
      <span key={p.key} className="confetti__piece" style={p.style} />
    ))}
  </div>
);

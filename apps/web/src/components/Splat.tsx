import type { Throwable } from '@tenfold/server';

interface Props {
  readonly item: Throwable;
  readonly className?: string;
}

/** A lumpy blob with a few drops flung off it. */
const BLOB =
  'M50 9 C60 8 61 21 71 19 C83 16 92 29 86 39 C81 47 94 55 88 66 C82 78 70 71 64 81 ' +
  'C58 92 44 94 38 84 C33 75 19 83 13 71 C7 59 19 53 15 43 C11 31 22 22 32 24 C41 26 40 10 50 9 Z';

const DROPS = [
  [94, 22, 3.5],
  [8, 30, 2.5],
  [90, 84, 4],
  [20, 92, 3],
  [52, 2, 2],
] as const;

/** Original art for a thrown egg or pie hitting its target. */
export const Splat = ({ item, className }: Props) => {
  const egg = item === 'egg';
  const goo = egg ? '#fffbef' : '#fff1cf';
  return (
    <svg className={className} viewBox="0 0 100 100" aria-hidden="true">
      <path d={BLOB} fill={goo} stroke={egg ? '#e9e1c9' : '#e8c88f'} strokeWidth="1.5" />
      {DROPS.map(([cx, cy, r]) => (
        <circle key={`${String(cx)}-${String(cy)}`} cx={cx} cy={cy} r={r} fill={goo} />
      ))}
      {egg ? (
        <>
          <circle cx="50" cy="51" r="17" fill="#ffb21c" />
          <ellipse cx="44" cy="45" rx="5" ry="3" fill="#ffd877" />
        </>
      ) : (
        <>
          <path d="M28 60 l9 -4 l3 6 l-8 4 Z" fill="#c98a4b" />
          <path d="M62 30 l8 2 l-2 7 l-8 -2 Z" fill="#b8763a" />
          <path d="M66 64 l7 3 l-4 6 l-6 -4 Z" fill="#c98a4b" />
          <circle cx="50" cy="48" r="8" fill="#d6283b" />
          <ellipse cx="47" cy="45" rx="2.5" ry="1.6" fill="#ff8a95" />
        </>
      )}
    </svg>
  );
};

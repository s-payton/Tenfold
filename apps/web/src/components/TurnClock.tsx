import { COPY } from '../copy.ts';
import { useNow } from '../game/useNow.ts';

interface Props {
  readonly deadline: number | null;
  readonly totalMs: number;
  readonly mine: boolean;
}

/** A shrinking bar with seconds left. Turns red in the last 10 seconds. */
export const TurnClock = ({ deadline, totalMs, mine }: Props) => {
  const now = useNow(deadline !== null);
  if (deadline === null) return null;
  const left = Math.max(0, deadline - now);
  const seconds = Math.ceil(left / 1000);
  const urgent = mine && seconds <= 10;
  return (
    <div className={`clock ${urgent ? 'clock--urgent' : ''}`} role="timer" aria-label={COPY.secondsLeft(seconds)}>
      <div className="clock__bar" style={{ width: `${String(Math.min(100, (left / totalMs) * 100))}%` }} />
      <span className="clock__label">{COPY.secondsLeft(seconds)}</span>
    </div>
  );
};

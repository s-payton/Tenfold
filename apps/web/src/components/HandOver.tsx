import { motion } from 'framer-motion';
import type { PublicView } from '@tenfold/engine';
import { COPY } from '../copy.ts';

interface Props {
  readonly view: PublicView;
  /** Each player's level when the hand started. */
  readonly startLevels: Readonly<Record<string, number>>;
  readonly names: Readonly<Record<string, string>>;
  readonly onNext: () => void;
  readonly onHome: () => void;
}

export const HandOver = ({ view, startLevels, names, onNext, onHome }: Props) => {
  const name = (id: string | null) => (id === null ? '' : (names[id] ?? id));
  const gameOver = view.status === 'game-over';
  return (
    <div className="overlay" role="dialog" aria-modal="true">
      <motion.div
        className="sheet"
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
      >
        <h2 className="sheet__title">
          {gameOver ? COPY.wins(name(view.winnerId)) : COPY.wentOut(name(view.handWinnerId))}
        </h2>
        <ul className="results">
          {view.players.map((p) => {
            const advanced = p.level > (startLevels[p.id] ?? p.level);
            return (
              <li key={p.id} className="results__row">
                <span className="results__name">{names[p.id] ?? p.id}</span>
                <span className="results__level">
                  {gameOver ? COPY.levelOf(p.level) : advanced ? COPY.advances(p.level) : COPY.repeats(p.level)}
                </span>
                <span className="results__score">{COPY.points(p.score)}</span>
              </li>
            );
          })}
        </ul>
        {gameOver ? (
          <button type="button" className="btn btn--primary" onClick={onHome}>
            {COPY.playAgain}
          </button>
        ) : (
          <button type="button" className="btn btn--primary" onClick={onNext}>
            {COPY.nextHand}
          </button>
        )}
      </motion.div>
    </div>
  );
};

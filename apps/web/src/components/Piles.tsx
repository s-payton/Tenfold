import { AnimatePresence } from 'framer-motion';
import type { PublicView } from '@tenfold/engine';
import { COPY } from '../copy.ts';
import { Card, CardBack } from './Card.tsx';

interface Props {
  readonly view: PublicView;
  readonly canDraw: boolean;
  /** A draw is on its way from the server. */
  readonly pending: boolean;
  readonly onDrawDeck: () => void;
  readonly onDrawDiscard: () => void;
}

export const Piles = ({ view, canDraw, pending, onDrawDeck, onDrawDiscard }: Props) => {
  const top = view.discardTop;
  // A Skip on top stays tappable so the engine's refusal can explain why.
  const canTakeDiscard = canDraw && top !== null && top.kind !== 'skip';
  return (
    <div className={`piles ${pending ? 'piles--pending' : ''}`}>
      <button
        type="button"
        className={`pile ${canDraw ? 'pile--ready' : ''}`}
        onClick={onDrawDeck}
        disabled={!canDraw}
        aria-label={`${COPY.deck}, ${COPY.cards(view.drawCount)}`}
      >
        <CardBack size="lg" />
        <span className="pile__label">{COPY.deck} · {view.drawCount}</span>
      </button>
      <div className={`pile ${canTakeDiscard ? 'pile--ready' : ''}`}>
        <div className="pile__slot">
          <AnimatePresence mode="popLayout">
            {top && (
              <Card
                key={top.id}
                card={top}
                size="lg"
                {...(canDraw ? { onClick: onDrawDiscard } : {})}
              />
            )}
          </AnimatePresence>
        </div>
        <span className="pile__label">{COPY.discardPile}</span>
      </div>
    </div>
  );
};

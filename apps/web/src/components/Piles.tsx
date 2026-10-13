import { AnimatePresence } from 'framer-motion';
import type { PublicView } from '@tenfold/engine';
import { COPY } from '../copy.ts';
import { Card, CardBack } from './Card.tsx';

interface Props {
  readonly view: PublicView;
  readonly canDraw: boolean;
  readonly onDrawDeck: () => void;
  readonly onDrawDiscard: () => void;
}

export const Piles = ({ view, canDraw, onDrawDeck, onDrawDiscard }: Props) => {
  const top = view.discardTop;
  const canTakeDiscard = canDraw && top !== null && top.kind !== 'skip';
  return (
    <div className="piles">
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
                {...(canTakeDiscard ? { onClick: onDrawDiscard } : {})}
              />
            )}
          </AnimatePresence>
        </div>
        <span className="pile__label">{COPY.discardPile}</span>
      </div>
    </div>
  );
};

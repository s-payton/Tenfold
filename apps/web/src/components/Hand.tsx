import { AnimatePresence, LayoutGroup, m } from 'framer-motion';
import type { Card as CardData } from '@tenfold/engine';
import { Card } from './Card.tsx';

interface Props {
  readonly cards: readonly CardData[];
  readonly selected: ReadonlySet<string>;
  readonly onToggle: (id: string) => void;
  readonly dealing: boolean;
  /** A draw on its way: the known card (from the discard pile) or a face-down stand-in. */
  readonly incoming?: CardData | 'face-down' | null;
}

export const Hand = ({ cards, selected, onToggle, dealing, incoming }: Props) => (
  <LayoutGroup>
    <div className="hand">
      <AnimatePresence>
        {cards.map((card, i) => (
          <Card
            key={card.id}
            card={card}
            selected={selected.has(card.id)}
            onClick={() => onToggle(card.id)}
            enterDelay={dealing ? i * 0.06 : 0}
          />
        ))}
        {incoming === 'face-down' && (
          <m.span
            key="incoming"
            className="card card--md card--back card--incoming"
            aria-hidden="true"
            initial={{ opacity: 0, y: -160, rotate: -8 }}
            animate={{ opacity: 1, y: 0, rotate: 0 }}
            exit={{ opacity: 0 }}
            transition={{ type: 'spring', stiffness: 420, damping: 30 }}
          >
            <span className="card__mark">X</span>
          </m.span>
        )}
        {incoming && incoming !== 'face-down' && <Card key={incoming.id} card={incoming} />}
      </AnimatePresence>
    </div>
  </LayoutGroup>
);

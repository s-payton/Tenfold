import { AnimatePresence, LayoutGroup } from 'framer-motion';
import type { Card as CardData } from '@tenfold/engine';
import { Card } from './Card.tsx';

interface Props {
  readonly cards: readonly CardData[];
  readonly selected: ReadonlySet<string>;
  readonly onToggle: (id: string) => void;
  readonly dealing: boolean;
}

export const Hand = ({ cards, selected, onToggle, dealing }: Props) => (
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
      </AnimatePresence>
    </div>
  </LayoutGroup>
);

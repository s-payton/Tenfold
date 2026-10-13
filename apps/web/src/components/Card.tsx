import { motion } from 'framer-motion';
import type { Card as CardData } from '@tenfold/engine';

export type CardSize = 'sm' | 'md' | 'lg';

interface CardProps {
  readonly card: CardData;
  readonly size?: CardSize;
  readonly selected?: boolean;
  readonly highlight?: boolean;
  readonly onClick?: () => void;
  readonly enterDelay?: number;
}

export const cardLabel = (card: CardData): string =>
  card.kind === 'number' ? `${card.color} ${String(card.value)}` : card.kind;

const Face = ({ card }: { readonly card: CardData }) => {
  if (card.kind === 'wild') {
    return (
      <>
        <span className="card__ring" />
        <span className="card__word">Wild</span>
      </>
    );
  }
  if (card.kind === 'skip') {
    return (
      <>
        <span className="card__symbol">⊘</span>
        <span className="card__word">Skip</span>
      </>
    );
  }
  return (
    <>
      <span className="card__corner card__corner--top">{card.value}</span>
      <span className="card__value">{card.value}</span>
    </>
  );
};

export const Card = ({ card, size = 'md', selected, highlight, onClick, enterDelay = 0 }: CardProps) => {
  const className = [
    'card',
    `card--${size}`,
    `card--${card.kind === 'number' ? card.color : card.kind}`,
    selected ? 'card--selected' : '',
    highlight ? 'card--highlight' : '',
  ].join(' ');
  const motionProps = {
    layout: true,
    layoutId: card.id,
    className,
    'aria-label': cardLabel(card),
    initial: { opacity: 0, y: -80, rotate: -6 },
    animate: { opacity: 1, y: selected ? -10 : 0, rotate: 0 },
    exit: { opacity: 0, scale: 0.8 },
    transition: { type: 'spring', stiffness: 420, damping: 32, delay: enterDelay },
  } as const;
  if (!onClick) {
    return (
      <motion.div {...motionProps}>
        <Face card={card} />
      </motion.div>
    );
  }
  return (
    <motion.button type="button" aria-pressed={Boolean(selected)} onClick={onClick} {...motionProps}>
      <Face card={card} />
    </motion.button>
  );
};

export const CardBack = ({ size = 'md' }: { readonly size?: CardSize }) => (
  <span className={`card card--${size} card--back`} aria-hidden="true">
    <span className="card__mark">X</span>
  </span>
);

import type { Card as CardData, GroupRequirement, GroupResult } from '@tenfold/engine';
import { COPY, describeRequirement, explainRequirement, groupErrorMessage } from '../copy.ts';
import { Card } from './Card.tsx';

export interface BuilderSlot {
  readonly requirement: GroupRequirement;
  /** Cards in play order (runs are already arranged). */
  readonly cards: readonly CardData[];
  readonly result: GroupResult;
  readonly canShift: boolean;
}

interface Props {
  readonly slots: readonly BuilderSlot[];
  readonly active: number;
  readonly onActivate: (index: number) => void;
  readonly onRemove: (cardId: string) => void;
  readonly onShift: (index: number) => void;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

/** One box per group, side by side. Tap a box, then tap hand cards to fill it. */
export const LayDownBuilder = ({ slots, active, onActivate, onRemove, onShift, onConfirm, onCancel }: Props) => {
  const ready = slots.every((s) => s.result.ok);
  return (
    <section className="builder" aria-label={COPY.layDown}>
      <div className="builder__boxes">
        {slots.map((slot, i) => {
          const full = slot.result.ok;
          const className = ['box', i === active ? 'box--active' : '', full ? 'box--ok' : ''].join(' ');
          return (
            <div
              key={`${slot.requirement.type}-${String(i)}`}
              className={className}
              role="button"
              tabIndex={0}
              aria-pressed={i === active}
              onClick={() => onActivate(i)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') onActivate(i);
              }}
            >
              <div className="box__head">
                <span className="box__title">{describeRequirement(slot.requirement)}</span>
                <span className="box__count">
                  {full ? '✓' : `${String(slot.cards.length)}/${String(slot.requirement.size)}`}
                </span>
              </div>
              <p className="box__explain">{explainRequirement(slot.requirement)}</p>
              <div className="box__cards">
                {slot.cards.map((c) => (
                  <Card
                    key={c.id}
                    card={c}
                    size="sm"
                    onClick={() => {
                      onRemove(c.id);
                      onActivate(i);
                    }}
                  />
                ))}
              </div>
              {!slot.result.ok && slot.cards.length >= slot.requirement.size && (
                <p className="box__error">{groupErrorMessage(slot.result.error)}</p>
              )}
              {slot.canShift && (
                <button
                  type="button"
                  className="btn btn--small btn--ghost box__shift"
                  onClick={(e) => {
                    e.stopPropagation();
                    onShift(i);
                  }}
                >
                  {COPY.shiftWilds}
                </button>
              )}
            </div>
          );
        })}
      </div>
      <div className="builder__actions">
        <button type="button" className="btn btn--ghost" onClick={onCancel}>
          {COPY.cancel}
        </button>
        <button type="button" className="btn btn--primary" disabled={!ready} onClick={onConfirm}>
          {COPY.layDownConfirm}
        </button>
      </div>
    </section>
  );
};

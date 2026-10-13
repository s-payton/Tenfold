import type { Card as CardData, GroupRequirement, GroupResult } from '@tenfold/engine';
import { COPY, describeRequirement, groupErrorMessage } from '../copy.ts';
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
  readonly hasSelection: boolean;
  readonly onAdd: (index: number) => void;
  readonly onRemove: (cardId: string) => void;
  readonly onShift: (index: number) => void;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

export const LayDownBuilder = (props: Props) => {
  const ready = props.slots.every((s) => s.result.ok);
  return (
    <section className="builder" aria-label={COPY.layDown}>
      {props.slots.map((slot, i) => (
        <div
          key={`${slot.requirement.type}-${String(i)}`}
          className={`slot ${slot.result.ok ? 'slot--ok' : ''}`}
        >
          <div className="slot__head">
            <span className="slot__title">
              {describeRequirement(slot.requirement)} {slot.result.ok && '✓'}
            </span>
            {slot.canShift && (
              <button type="button" className="btn btn--small" onClick={() => props.onShift(i)}>
                {COPY.shiftWilds}
              </button>
            )}
            <button
              type="button"
              className="btn btn--small btn--primary"
              disabled={!props.hasSelection}
              onClick={() => props.onAdd(i)}
            >
              {COPY.addToGroup}
            </button>
          </div>
          <div className="slot__cards">
            {slot.cards.map((c) => (
              <Card key={c.id} card={c} size="sm" onClick={() => props.onRemove(c.id)} />
            ))}
          </div>
          {!slot.result.ok && slot.cards.length > 0 && (
            <p className="slot__error">{groupErrorMessage(slot.result.error)}</p>
          )}
        </div>
      ))}
      <div className="builder__actions">
        <button type="button" className="btn btn--ghost" onClick={props.onCancel}>
          {COPY.cancel}
        </button>
        <button
          type="button"
          className="btn btn--primary"
          disabled={!ready}
          onClick={props.onConfirm}
        >
          {COPY.layDownConfirm}
        </button>
      </div>
    </section>
  );
};

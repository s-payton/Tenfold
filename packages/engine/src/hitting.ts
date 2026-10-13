import { MAX_VALUE, MIN_VALUE, isNatural, type Card } from './cards.ts';
import type { RulesConfig } from './config.ts';
import {
  validateColorGroup,
  validateSet,
  type GroupError,
  type LaidGroup,
} from './validation.ts';

/** Which end of a run a card goes on. Only needed for a wild when both ends are open. */
export type RunEnd = 'start' | 'end';

export type HitError = GroupError | 'needs-position';

export type HitResult =
  | { readonly ok: true; readonly group: LaidGroup }
  | { readonly ok: false; readonly error: HitError };

type RunGroup = Extract<LaidGroup, { type: 'run' }>;

const pickRunEnd = (group: RunGroup, card: Card, position?: RunEnd): RunEnd | HitError => {
  const startOpen = group.start > MIN_VALUE;
  const endOpen = group.end < MAX_VALUE;
  if (isNatural(card)) {
    const fits: RunEnd | null =
      card.value === group.start - 1 ? 'start' : card.value === group.end + 1 ? 'end' : null;
    if (!fits || (position && position !== fits)) return 'not-in-sequence';
    return fits;
  }
  if (position) return (position === 'start' ? startOpen : endOpen) ? position : 'out-of-range';
  if (startOpen && endOpen) return 'needs-position';
  if (startOpen) return 'start';
  if (endOpen) return 'end';
  return 'out-of-range';
};

const hitRun = (group: RunGroup, card: Card, position?: RunEnd): HitResult => {
  if (card.kind === 'skip') return { ok: false, error: 'contains-skip' };
  const end = pickRunEnd(group, card, position);
  if (end !== 'start' && end !== 'end') return { ok: false, error: end };
  const next: RunGroup =
    end === 'start'
      ? { type: 'run', start: group.start - 1, end: group.end, cards: [card, ...group.cards] }
      : { type: 'run', start: group.start, end: group.end + 1, cards: [...group.cards, card] };
  return { ok: true, group: next };
};

/**
 * Adds one card to a laid-down group and returns the new group. The original is not
 * changed. Who may hit (own level laid down, own turn) is checked by the turn logic.
 */
export const hit = (
  group: LaidGroup,
  card: Card,
  config: RulesConfig,
  position?: RunEnd,
): HitResult => {
  switch (group.type) {
    case 'set':
      return validateSet([...group.cards, card], 0, config);
    case 'color':
      return validateColorGroup([...group.cards, card], 0, config);
    case 'run':
      return hitRun(group, card, position);
  }
};

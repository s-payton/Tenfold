import { MAX_VALUE, MIN_VALUE, isNatural, type Card, type Color } from './cards.ts';
import type { RulesConfig } from './config.ts';
import type { GroupRequirement, LevelDefinition } from './levels.ts';

/** A validated group. Run cards are in position order, so wilds keep their value. */
export type LaidGroup =
  | { readonly type: 'set'; readonly value: number | null; readonly cards: readonly Card[] }
  | {
      readonly type: 'run';
      readonly start: number;
      readonly end: number;
      readonly cards: readonly Card[];
    }
  | { readonly type: 'color'; readonly color: Color | null; readonly cards: readonly Card[] };

export type GroupError =
  | 'too-small'
  | 'contains-skip'
  | 'no-natural'
  | 'mixed-numbers'
  | 'mixed-colors'
  | 'not-in-sequence'
  | 'out-of-range';

export type GroupResult =
  | { readonly ok: true; readonly group: LaidGroup }
  | { readonly ok: false; readonly error: GroupError };

export type LevelError =
  | { readonly code: 'wrong-group-count'; readonly expected: number; readonly actual: number }
  | { readonly code: 'duplicate-card'; readonly cardId: string }
  | { readonly code: 'group-invalid'; readonly index: number; readonly error: GroupError };

export type LevelResult =
  | { readonly ok: true; readonly groups: readonly LaidGroup[] }
  | { readonly ok: false; readonly error: LevelError };

const fail = (error: GroupError): GroupResult => ({ ok: false, error });

/** Checks shared by every group type. Returns an error or null. */
const commonError = (cards: readonly Card[], minSize: number, config: RulesConfig) => {
  if (cards.length < minSize) return 'too-small';
  if (cards.some((c) => c.kind === 'skip')) return 'contains-skip';
  if (config.requireNaturalCard && !cards.some(isNatural)) return 'no-natural';
  return null;
};

export const validateSet = (
  cards: readonly Card[],
  minSize: number,
  config: RulesConfig,
): GroupResult => {
  const error = commonError(cards, minSize, config);
  if (error) return fail(error);
  const values = new Set(cards.filter(isNatural).map((c) => c.value));
  if (values.size > 1) return fail('mixed-numbers');
  const [value = null] = values;
  return { ok: true, group: { type: 'set', value, cards } };
};

/** Validates a run whose cards are given in position order. */
export const validateRun = (
  cards: readonly Card[],
  minSize: number,
  config: RulesConfig,
): GroupResult => {
  const error = commonError(cards, minSize, config);
  if (error) return fail(error);
  const firstNatural = cards.findIndex(isNatural);
  const anchor = cards[firstNatural];
  const start = anchor && isNatural(anchor) ? anchor.value - firstNatural : MIN_VALUE;
  const inSequence = cards.every((c, i) => !isNatural(c) || c.value === start + i);
  if (!inSequence) return fail('not-in-sequence');
  const end = start + cards.length - 1;
  if (start < MIN_VALUE || end > MAX_VALUE) return fail('out-of-range');
  return { ok: true, group: { type: 'run', start, end, cards } };
};

/**
 * Every way to order loose cards into a legal run, one per possible start value,
 * sorted by start. Wilds fill gaps first, then extend the ends.
 */
export const arrangeRun = (cards: readonly Card[], config: RulesConfig): Card[][] => {
  if (commonError(cards, 0, config)) return [];
  const naturals = cards.filter(isNatural);
  const wilds = cards.filter((c) => !isNatural(c));
  if (new Set(naturals.map((c) => c.value)).size !== naturals.length) return [];
  const length = cards.length;
  const arrangements: Card[][] = [];
  for (let start = MIN_VALUE; start + length - 1 <= MAX_VALUE; start++) {
    if (!naturals.every((c) => c.value >= start && c.value < start + length)) continue;
    const slots: (Card | undefined)[] = Array.from({ length });
    for (const c of naturals) slots[c.value - start] = c;
    let nextWild = 0;
    arrangements.push(slots.map((slot) => slot ?? (wilds[nextWild++] as Card)));
  }
  return arrangements;
};

export const validateColorGroup = (
  cards: readonly Card[],
  minSize: number,
  config: RulesConfig,
): GroupResult => {
  const error = commonError(cards, minSize, config);
  if (error) return fail(error);
  const colors = new Set(cards.filter(isNatural).map((c) => c.color));
  if (colors.size > 1) return fail('mixed-colors');
  const [color = null] = colors;
  return { ok: true, group: { type: 'color', color, cards } };
};

export const validateGroup = (
  requirement: GroupRequirement,
  cards: readonly Card[],
  config: RulesConfig,
): GroupResult => {
  switch (requirement.type) {
    case 'set':
      return validateSet(cards, requirement.size, config);
    case 'run':
      return validateRun(cards, requirement.size, config);
    case 'color':
      return validateColorGroup(cards, requirement.size, config);
  }
};

/** Validates a full level lay-down. `groups[i]` must satisfy `level.requirements[i]`. */
export const validateLevel = (
  level: LevelDefinition,
  groups: readonly (readonly Card[])[],
  config: RulesConfig,
): LevelResult => {
  const expected = level.requirements.length;
  if (groups.length !== expected) {
    return { ok: false, error: { code: 'wrong-group-count', expected, actual: groups.length } };
  }
  const seen = new Set<string>();
  for (const card of groups.flat()) {
    if (seen.has(card.id)) return { ok: false, error: { code: 'duplicate-card', cardId: card.id } };
    seen.add(card.id);
  }
  const laid: LaidGroup[] = [];
  for (const [index, requirement] of level.requirements.entries()) {
    const result = validateGroup(requirement, groups[index] ?? [], config);
    if (!result.ok) return { ok: false, error: { code: 'group-invalid', index, error: result.error } };
    laid.push(result.group);
  }
  return { ok: true, groups: laid };
};

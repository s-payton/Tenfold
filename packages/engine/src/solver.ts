import { COLORS, MAX_VALUE, MIN_VALUE, isNatural, type Card, type NumberCard } from './cards.ts';
import type { RulesConfig } from './config.ts';
import type { TableGroup } from './game.ts';
import { hit } from './hitting.ts';
import type { GroupRequirement, LevelDefinition } from './levels.ts';
import type { Move } from './moves.ts';
import { validateLevel } from './validation.ts';

type Pool = { readonly naturals: readonly NumberCard[]; readonly wilds: readonly Card[] };

const toPool = (cards: readonly Card[]): Pool => ({
  naturals: cards.filter(isNatural),
  wilds: cards.filter((c) => c.kind === 'wild'),
});

const without = (pool: Pool, used: readonly Card[]): Pool => {
  const ids = new Set(used.map((c) => c.id));
  return {
    naturals: pool.naturals.filter((c) => !ids.has(c.id)),
    wilds: pool.wilds.filter((c) => !ids.has(c.id)),
  };
};

/** Candidate sets of exactly `size`, trying more naturals first so wilds stay free. */
const setCandidates = (pool: Pool, size: number): Card[][] => {
  const out: Card[][] = [];
  for (let value = MIN_VALUE; value <= MAX_VALUE; value++) {
    const naturals = pool.naturals.filter((c) => c.value === value);
    for (let n = Math.min(naturals.length, size); n >= 1 && size - n <= pool.wilds.length; n--) {
      out.push([...naturals.slice(0, n), ...pool.wilds.slice(0, size - n)]);
    }
  }
  return out;
};

/** Candidate runs of exactly `size`, in position order, using a wild only where no natural fits. */
const runCandidates = (pool: Pool, size: number): Card[][] => {
  const out: Card[][] = [];
  for (let start = MIN_VALUE; start + size - 1 <= MAX_VALUE; start++) {
    let wildsUsed = 0;
    let naturalsUsed = 0;
    const run: Card[] = [];
    for (let value = start; value < start + size; value++) {
      const natural = pool.naturals.find((c) => c.value === value);
      const card = natural ?? pool.wilds[wildsUsed++];
      if (!card) break;
      if (natural) naturalsUsed++;
      run.push(card);
    }
    if (run.length === size && naturalsUsed > 0) out.push(run);
  }
  return out;
};

const colorCandidates = (pool: Pool, size: number): Card[][] =>
  COLORS.flatMap((color) => {
    const naturals = pool.naturals.filter((c) => c.color === color);
    const n = Math.min(naturals.length, size);
    return n >= 1 && size - n <= pool.wilds.length
      ? [[...naturals.slice(0, n), ...pool.wilds.slice(0, size - n)]]
      : [];
  });

const candidates = (pool: Pool, requirement: GroupRequirement): Card[][] => {
  switch (requirement.type) {
    case 'set':
      return setCandidates(pool, requirement.size);
    case 'run':
      return runCandidates(pool, requirement.size);
    case 'color':
      return colorCandidates(pool, requirement.size);
  }
};

const search = (
  pool: Pool,
  requirements: readonly GroupRequirement[],
): Card[][] | null => {
  const [first, ...rest] = requirements;
  if (!first) return [];
  for (const group of candidates(pool, first)) {
    const tail = search(without(pool, group), rest);
    if (tail) return [group, ...tail];
  }
  return null;
};

/**
 * Finds a way to lay down `level` from `hand` using the minimum cards per group, or null.
 * Run groups come back in position order, ready to send as a lay-down move.
 */
export const findLevel = (
  hand: readonly Card[],
  level: LevelDefinition,
  config: RulesConfig,
): Card[][] | null => {
  const groups = search(toPool(hand), level.requirements);
  return groups && validateLevel(level, groups, config).ok ? groups : null;
};

/** Every single-card hit `playerId` could make right now. Wilds on open runs go on the high end. */
export const findHits = (
  hand: readonly Card[],
  table: readonly TableGroup[],
  playerId: string,
  config: RulesConfig,
): Move[] => {
  const moves: Move[] = [];
  for (const card of hand) {
    for (const target of table) {
      if (target.ownerId !== playerId && !config.allowHitOnOthers) continue;
      const result = hit(target.group, card, config);
      if (result.ok) moves.push({ type: 'hit', groupId: target.id, cardId: card.id });
      else if (result.error === 'needs-position') {
        moves.push({ type: 'hit', groupId: target.id, cardId: card.id, position: 'end' });
      }
    }
  }
  return moves;
};

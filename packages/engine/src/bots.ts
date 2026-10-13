import { COLORS, MAX_VALUE, MIN_VALUE, isNatural, type Card, type NumberCard } from './cards.ts';
import type { RulesConfig } from './config.ts';
import type { Rng } from './deck.ts';
import { hit } from './hitting.ts';
import { getLevel, type GroupRequirement, type LevelDefinition } from './levels.ts';
import type { Move } from './moves.ts';
import { cardPoints } from './scoring.ts';
import { findHits, findLevel } from './solver.ts';
import type { PublicPlayer, PublicView } from './view.ts';

export type BotLevel = 'easy' | 'medium' | 'hard';
export const BOT_LEVELS: readonly BotLevel[] = ['easy', 'medium', 'hard'];

/** The best partial group of natural cards toward one requirement. */
const bestPartial = (naturals: readonly NumberCard[], requirement: GroupRequirement): NumberCard[] => {
  const { size } = requirement;
  if (requirement.type === 'set') {
    let best: NumberCard[] = [];
    for (let value = MAX_VALUE; value >= MIN_VALUE; value--) {
      const group = naturals.filter((c) => c.value === value).slice(0, size);
      if (group.length > best.length) best = group;
    }
    return best;
  }
  if (requirement.type === 'color') {
    let best: NumberCard[] = [];
    for (const color of COLORS) {
      const group = naturals.filter((c) => c.color === color).slice(0, size);
      if (group.length > best.length) best = group;
    }
    return best;
  }
  let best: NumberCard[] = [];
  for (let start = MIN_VALUE; start + size - 1 <= MAX_VALUE; start++) {
    const group: NumberCard[] = [];
    for (let value = start; value < start + size; value++) {
      const card = naturals.find((c) => c.value === value);
      if (card) group.push(card);
    }
    if (group.length > best.length) best = group;
  }
  return best;
};

/**
 * How close a hand is to a level, from 0 to 1: the share of the level's cards it could
 * fill now, building groups greedily and topping up with wilds.
 */
export const handProgress = (hand: readonly Card[], level: LevelDefinition): number => {
  let naturals = hand.filter(isNatural);
  let covered = 0;
  let total = 0;
  for (const requirement of level.requirements) {
    total += requirement.size;
    const group = bestPartial(naturals, requirement);
    covered += group.length;
    const used = new Set(group.map((c) => c.id));
    naturals = naturals.filter((c) => !used.has(c.id));
  }
  const wilds = hand.filter((c) => c.kind === 'wild').length;
  return total === 0 ? 1 : (covered + Math.min(wilds, total - covered)) / total;
};

const currentPlayer = (view: PublicView): PublicPlayer => {
  const me = view.players[view.currentIndex];
  if (!me || me.id !== view.viewerId) throw new RangeError("It is not the viewer's turn");
  return me;
};

const pick = <T>(items: readonly T[], random: Rng): T | undefined =>
  items[Math.floor(random() * items.length)];

const fitsTable = (card: Card, view: PublicView, config: RulesConfig, ownerFilter: (id: string) => boolean) =>
  view.table.some((g) => {
    if (!ownerFilter(g.ownerId)) return false;
    const result = hit(g.group, card, config);
    return result.ok || result.error === 'needs-position';
  });

/** How dangerous an opponent is: laid down first, then fewest cards, then highest level. */
const threat = (p: PublicPlayer) => (p.laidDown ? 1000 : 0) - p.handCount * 10 + p.level;

const skipTargetFor = (
  view: PublicView,
  me: PublicPlayer,
  level: BotLevel,
  random: Rng,
): string | undefined => {
  const count = view.players.length;
  const inOrder = Array.from({ length: count - 1 }, (_, k) => view.players[(view.currentIndex + 1 + k) % count])
    .filter((p): p is PublicPlayer => p !== undefined && p.id !== me.id && !p.skipPending);
  if (level === 'easy') return pick(inOrder, random)?.id;
  if (level === 'medium') return inOrder[0]?.id;
  return [...inOrder].sort((a, b) => threat(b) - threat(a))[0]?.id;
};

const discardMove = (card: Card, view: PublicView, me: PublicPlayer, config: RulesConfig, level: BotLevel, random: Rng): Move => {
  if (card.kind !== 'skip' || !config.skipLosesTurn || view.hand.length === 1) {
    return { type: 'discard', cardId: card.id };
  }
  const target = skipTargetFor(view, me, level, random);
  return target ? { type: 'discard', cardId: card.id, skipTarget: target } : { type: 'discard', cardId: card.id };
};

/** Picks the card to throw away. */
const chooseDiscard = (view: PublicView, me: PublicPlayer, config: RulesConfig, level: BotLevel, random: Rng): Card => {
  const hand = view.hand;
  const nonWild = hand.filter((c) => c.kind !== 'wild');
  if (level === 'easy') {
    const pool = config.allowWildDiscard ? hand : nonWild.length > 0 ? nonWild : hand;
    return pick(pool, random) ?? (hand[0] as Card);
  }
  const pool = nonWild.length > 0 ? nonWild : hand;
  const goal = getLevel(config, me.level);
  const base = goal && !me.laidDown ? handProgress(hand, goal) : 0;
  const opponentsDown = new Set(view.players.filter((p) => p.id !== me.id && p.laidDown).map((p) => p.id));
  const cost = (card: Card): number => {
    const without = hand.filter((c) => c.id !== card.id);
    const usefulness = goal && !me.laidDown ? base - handProgress(without, goal) : 0;
    // Hard also avoids feeding a card that an opponent who has laid down could hit.
    const feeds =
      level === 'hard' && config.allowHitOnOthers && fitsTable(card, view, config, (id) => opponentsDown.has(id) || id === me.id)
        ? 0.05
        : 0;
    return usefulness + feeds - cardPoints(card) / 1000;
  };
  return pool.reduce((best, c) => (cost(c) < cost(best) ? c : best));
};

/** Whether taking the top discard is worth it. */
const wantsDiscard = (view: PublicView, me: PublicPlayer, config: RulesConfig, level: BotLevel, random: Rng): boolean => {
  const top = view.discardTop;
  if (!top || top.kind === 'skip') return false;
  if (level === 'easy') return random() < 0.5;
  if (top.kind === 'wild') return true;
  if (me.laidDown) return fitsTable(top, view, config, (id) => config.allowHitOnOthers || id === me.id);
  const goal = getLevel(config, me.level);
  return goal ? handProgress([...view.hand, top], goal) > handProgress(view.hand, goal) : false;
};

/**
 * A computer player's next move, from its own view only (never other hands or the deck).
 * Call it once per move until the turn passes. `random` makes Easy's choices repeatable.
 */
export const botMove = (view: PublicView, config: RulesConfig, level: BotLevel, random: Rng = Math.random): Move => {
  const me = currentPlayer(view);
  if (view.step === 'draw') {
    return { type: 'draw', source: wantsDiscard(view, me, config, level, random) ? 'discard' : 'deck' };
  }
  if (!me.laidDown) {
    const goal = getLevel(config, me.level);
    const groups = goal ? findLevel(view.hand, goal, config) : null;
    if (groups) return { type: 'lay-down', groups: groups.map((g) => g.map((c) => c.id)) };
  } else {
    const hits = findHits(view.hand, view.table, me.id, config);
    const chosen = level === 'easy' ? pick(hits, random) : hits[0];
    if (chosen) return chosen;
  }
  return discardMove(chooseDiscard(view, me, config, level, random), view, me, config, level, random);
};

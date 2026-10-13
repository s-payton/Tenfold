import type { Card } from './cards.ts';
import type { RulesConfig } from './config.ts';
import { createRng, shuffle } from './deck.ts';
import { advanceTurn, endHand, nextSeed, type GameState, type PlayerState } from './game.ts';
import { hit, type HitError, type RunEnd } from './hitting.ts';
import { getLevel } from './levels.ts';
import { validateLevel, type LevelError } from './validation.ts';

/** A move intent sent by a client. Cards and groups are referenced by id. */
export type Move =
  | { readonly type: 'draw'; readonly source: 'deck' | 'discard' }
  /** One id list per level requirement, in order. Run ids are in position order. */
  | { readonly type: 'lay-down'; readonly groups: readonly (readonly string[])[] }
  | {
      readonly type: 'hit';
      readonly groupId: string;
      readonly cardId: string;
      readonly position?: RunEnd;
    }
  | { readonly type: 'discard'; readonly cardId: string; readonly skipTarget?: string };

export type MoveError =
  | {
      readonly code:
        | 'game-not-active'
        | 'hand-not-over'
        | 'unknown-player'
        | 'not-your-turn'
        | 'must-draw-first'
        | 'already-drew'
        | 'card-not-in-hand'
        | 'discard-empty'
        | 'cannot-take-skip'
        | 'draw-pile-empty'
        | 'already-laid-down'
        | 'must-lay-down-first'
        | 'group-not-found'
        | 'cannot-hit-others'
        | 'cannot-discard-wild'
        | 'skip-target-required'
        | 'invalid-skip-target';
    }
  | { readonly code: 'level-invalid'; readonly error: LevelError }
  | { readonly code: 'hit-invalid'; readonly error: HitError };

export type MoveResult =
  | { readonly ok: true; readonly state: GameState }
  | { readonly ok: false; readonly error: MoveError };

const fail = (error: MoveError): MoveResult => ({ ok: false, error });
const done = (state: GameState): MoveResult => ({ ok: true, state });

const withPlayer = (state: GameState, index: number, player: PlayerState): GameState => ({
  ...state,
  players: state.players.map((p, i) => (i === index ? player : p)),
});

/** Ends the hand if the current player just emptied their hand. */
const checkGoneOut = (state: GameState, config: RulesConfig): GameState =>
  state.players[state.currentIndex]?.hand.length === 0
    ? endHand(state, state.currentIndex, config)
    : state;

/**
 * Refills an empty draw pile from the discard pile. The top discard stays put unless it
 * is the only card left, so drawing from the deck never gets stuck.
 */
const refillDrawPile = (state: GameState): GameState => {
  if (state.drawPile.length > 0 || state.discardPile.length === 0) return state;
  const keep = state.discardPile.length > 1 ? 1 : 0;
  const rng = createRng(state.seed);
  return {
    ...state,
    drawPile: shuffle(state.discardPile.slice(0, state.discardPile.length - keep), rng),
    discardPile: state.discardPile.slice(state.discardPile.length - keep),
    seed: nextSeed(rng),
  };
};

const draw = (state: GameState, me: PlayerState, source: 'deck' | 'discard'): MoveResult => {
  if (state.step !== 'draw') return fail({ code: 'already-drew' });
  const from = source === 'deck' ? refillDrawPile(state) : state;
  const pile = source === 'deck' ? from.drawPile : from.discardPile;
  const card = pile.at(-1);
  if (!card) return fail({ code: source === 'deck' ? 'draw-pile-empty' : 'discard-empty' });
  if (source === 'discard' && card.kind === 'skip') return fail({ code: 'cannot-take-skip' });
  const rest = pile.slice(0, -1);
  const next = source === 'deck' ? { ...from, drawPile: rest } : { ...from, discardPile: rest };
  return done({
    ...withPlayer(next, state.currentIndex, { ...me, hand: [...me.hand, card] }),
    step: 'play',
  });
};

const findInHand = (hand: readonly Card[], ids: readonly string[]): Card[] | null => {
  const found = ids.map((id) => hand.find((c) => c.id === id));
  return found.every((c) => c !== undefined) ? found : null;
};

const layDown = (
  state: GameState,
  me: PlayerState,
  groupIds: readonly (readonly string[])[],
  config: RulesConfig,
): MoveResult => {
  if (me.laidDown) return fail({ code: 'already-laid-down' });
  const level = getLevel(config, me.level);
  if (!level) throw new RangeError(`No level ${String(me.level)} in config`);
  const groups = groupIds.map((ids) => findInHand(me.hand, ids));
  if (groups.some((g) => g === null)) return fail({ code: 'card-not-in-hand' });
  const result = validateLevel(level, groups as Card[][], config);
  if (!result.ok) return fail({ code: 'level-invalid', error: result.error });
  const used = new Set(groupIds.flat());
  const hand = me.hand.filter((c) => !used.has(c.id));
  const table = [
    ...state.table,
    ...result.groups.map((group, i) => ({ id: `${me.id}-${String(i)}`, ownerId: me.id, group })),
  ];
  const next = withPlayer({ ...state, table }, state.currentIndex, { ...me, hand, laidDown: true });
  return done(checkGoneOut(next, config));
};

const hitMove = (
  state: GameState,
  me: PlayerState,
  move: Extract<Move, { type: 'hit' }>,
  config: RulesConfig,
): MoveResult => {
  if (!me.laidDown) return fail({ code: 'must-lay-down-first' });
  const target = state.table.find((g) => g.id === move.groupId);
  if (!target) return fail({ code: 'group-not-found' });
  if (target.ownerId !== me.id && !config.allowHitOnOthers) return fail({ code: 'cannot-hit-others' });
  const card = me.hand.find((c) => c.id === move.cardId);
  if (!card) return fail({ code: 'card-not-in-hand' });
  const result = hit(target.group, card, config, move.position);
  if (!result.ok) return fail({ code: 'hit-invalid', error: result.error });
  const table = state.table.map((g) => (g.id === target.id ? { ...g, group: result.group } : g));
  const hand = me.hand.filter((c) => c.id !== card.id);
  const next = withPlayer({ ...state, table }, state.currentIndex, { ...me, hand });
  return done(checkGoneOut(next, config));
};

const discard = (
  state: GameState,
  me: PlayerState,
  move: Extract<Move, { type: 'discard' }>,
  config: RulesConfig,
): MoveResult => {
  const card = me.hand.find((c) => c.id === move.cardId);
  if (!card) return fail({ code: 'card-not-in-hand' });
  if (card.kind === 'wild' && !config.allowWildDiscard) return fail({ code: 'cannot-discard-wild' });
  const hand = me.hand.filter((c) => c.id !== card.id);
  let next = withPlayer(
    { ...state, discardPile: [...state.discardPile, card] },
    state.currentIndex,
    { ...me, hand },
  );
  if (hand.length === 0) return done(endHand(next, state.currentIndex, config));
  if (card.kind === 'skip' && config.skipLosesTurn) {
    const targets = state.players.filter((p) => p.id !== me.id && !p.skipPending);
    if (move.skipTarget === undefined) {
      if (targets.length > 0) return fail({ code: 'skip-target-required' });
    } else {
      const targetIndex = state.players.findIndex((p) => p.id === move.skipTarget);
      const target = targets.find((p) => p.id === move.skipTarget);
      if (!target) return fail({ code: 'invalid-skip-target' });
      next = withPlayer(next, targetIndex, { ...target, skipPending: true });
    }
  }
  return done(advanceTurn(next));
};

/**
 * The referee. Applies one move by `playerId` and returns the new state, or the reason
 * the move is illegal. Never mutates `state`.
 */
export const applyMove = (
  state: GameState,
  playerId: string,
  move: Move,
  config: RulesConfig,
): MoveResult => {
  if (state.status !== 'playing') return fail({ code: 'game-not-active' });
  const index = state.players.findIndex((p) => p.id === playerId);
  const me = state.players[index];
  if (!me) return fail({ code: 'unknown-player' });
  if (index !== state.currentIndex) return fail({ code: 'not-your-turn' });
  if (move.type === 'draw') return draw(state, me, move.source);
  if (state.step === 'draw') return fail({ code: 'must-draw-first' });
  switch (move.type) {
    case 'lay-down':
      return layDown(state, me, move.groups, config);
    case 'hit':
      return hitMove(state, me, move, config);
    case 'discard':
      return discard(state, me, move, config);
  }
};

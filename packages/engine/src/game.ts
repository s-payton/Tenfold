import type { Card } from './cards.ts';
import type { RulesConfig } from './config.ts';
import { createDeck, createRng, shuffle, type Rng } from './deck.ts';
import type { MoveResult } from './moves.ts';
import { handPoints } from './scoring.ts';
import type { LaidGroup } from './validation.ts';

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;

export interface PlayerState {
  readonly id: string;
  readonly level: number;
  readonly score: number;
  readonly hand: readonly Card[];
  /** Has laid down their level this hand. */
  readonly laidDown: boolean;
  /** Will lose their next turn. */
  readonly skipPending: boolean;
}

export interface TableGroup {
  readonly id: string;
  readonly ownerId: string;
  readonly group: LaidGroup;
}

/** `draw`: the current player must draw. `play`: they may lay down, hit, then discard. */
export type TurnStep = 'draw' | 'play';
export type GameStatus = 'playing' | 'hand-over' | 'game-over';

export interface GameState {
  readonly players: readonly PlayerState[];
  readonly dealerIndex: number;
  readonly currentIndex: number;
  readonly step: TurnStep;
  /** Top card is the last element. */
  readonly drawPile: readonly Card[];
  /** Top card is the last element. */
  readonly discardPile: readonly Card[];
  readonly table: readonly TableGroup[];
  readonly handNumber: number;
  readonly status: GameStatus;
  readonly handWinnerId: string | null;
  readonly winnerId: string | null;
  /** Counts turn changes for the whole game, so screens can tell a new turn from a re-send. */
  readonly turn: number;
  /** Players who lost their turn in the most recent turn change. */
  readonly lastSkipped: readonly string[];
  /** Seed for the next shuffle. Secret: it predicts the draw pile. */
  readonly seed: number;
}

export const nextSeed = (rng: Rng): number => Math.floor(rng() * 0x100000000);

/** Moves the turn to the next player clockwise, using up any pending skips on the way. */
export const advanceTurn = (state: GameState): GameState => {
  const players = [...state.players];
  const skipped: string[] = [];
  let index = state.currentIndex;
  for (;;) {
    index = (index + 1) % players.length;
    const player = players[index] as PlayerState;
    if (!player.skipPending) break;
    players[index] = { ...player, skipPending: false };
    skipped.push(player.id);
  }
  return {
    ...state,
    players,
    currentIndex: index,
    step: 'draw',
    turn: state.turn + 1,
    lastSkipped: skipped,
  };
};

type HandSetup = Pick<GameState, 'players' | 'dealerIndex' | 'handNumber' | 'seed' | 'turn'>;

const dealHand = (setup: HandSetup, config: RulesConfig): GameState => {
  const rng = createRng(setup.seed);
  const deck = shuffle(createDeck(), rng);
  const count = setup.players.length;
  if (count * config.handSize + 1 > deck.length) throw new RangeError('Not enough cards to deal');
  const hands: Card[][] = setup.players.map(() => []);
  for (let round = 0; round < config.handSize; round++) {
    for (let k = 1; k <= count; k++) hands[(setup.dealerIndex + k) % count]?.push(deck.pop() as Card);
  }
  const firstDiscard = deck.pop() as Card;
  const firstIndex = (setup.dealerIndex + 1) % count;
  const players = setup.players.map((p, i) => ({
    ...p,
    hand: hands[i] ?? [],
    laidDown: false,
    skipPending: config.skipLosesTurn && firstDiscard.kind === 'skip' && i === firstIndex,
  }));
  return advanceTurn({
    ...setup,
    players,
    currentIndex: setup.dealerIndex,
    step: 'draw',
    drawPile: deck,
    discardPile: [firstDiscard],
    table: [],
    status: 'playing',
    handWinnerId: null,
    winnerId: null,
    lastSkipped: [],
    seed: nextSeed(rng),
  });
};

/** Starts a new game and deals the first hand. Throws on an invalid player list. */
export const createGame = (
  playerIds: readonly string[],
  config: RulesConfig,
  seed: number,
  dealerIndex = 0,
): GameState => {
  if (playerIds.length < MIN_PLAYERS || playerIds.length > MAX_PLAYERS) {
    throw new RangeError(`A game needs ${String(MIN_PLAYERS)} to ${String(MAX_PLAYERS)} players`);
  }
  if (new Set(playerIds).size !== playerIds.length) throw new RangeError('Player ids must be unique');
  const players = playerIds.map((id) => ({
    id,
    level: 1,
    score: 0,
    hand: [],
    laidDown: false,
    skipPending: false,
  }));
  return dealHand({ players, dealerIndex, handNumber: 1, seed, turn: 0 }, config);
};

/** The lowest total score wins; on a tie, the first such player in seat order. */
const lowestScore = (players: readonly PlayerState[]): string | null =>
  players.reduce<PlayerState | null>((best, p) => (!best || p.score < best.score ? p : best), null)
    ?.id ?? null;

/** Scores the hand after `winnerIndex` goes out and moves players up a level. */
export const endHand = (state: GameState, winnerIndex: number, config: RulesConfig): GameState => {
  const finalLevel = config.levels.length;
  const winner = state.players[winnerIndex] as PlayerState;
  const scored = state.players.map((p) => ({ ...p, score: p.score + handPoints(p.hand) }));

  if (config.everyoneAdvances) {
    const lastHand = state.players.every((p) => p.level >= finalLevel);
    const players = lastHand ? scored : scored.map((p) => ({ ...p, level: p.level + 1 }));
    const winnerId = lastHand ? lowestScore(players) : null;
    return {
      ...state,
      players,
      status: lastHand ? 'game-over' : 'hand-over',
      handWinnerId: winner.id,
      winnerId,
    };
  }

  const players = scored.map((p) => ({
    ...p,
    level: p.laidDown && p.level < finalLevel ? p.level + 1 : p.level,
  }));
  const gameWon = winner.level === finalLevel;
  return {
    ...state,
    players,
    status: gameWon ? 'game-over' : 'hand-over',
    handWinnerId: winner.id,
    winnerId: gameWon ? winner.id : null,
  };
};

/** Picks the next dealer. The first player is always the one left of the dealer. */
const nextDealer = (state: GameState, config: RulesConfig): number => {
  const count = state.players.length;
  const winner = state.players.findIndex((p) => p.id === state.handWinnerId);
  return config.nextHandLeader === 'hand-winner' && winner >= 0
    ? (winner - 1 + count) % count
    : (state.dealerIndex + 1) % count;
};

/** Deals the next hand after one ends. */
export const startNextHand = (state: GameState, config: RulesConfig): MoveResult => {
  if (state.status !== 'hand-over') return { ok: false, error: { code: 'hand-not-over' } };
  const setup: HandSetup = {
    players: state.players,
    dealerIndex: nextDealer(state, config),
    handNumber: state.handNumber + 1,
    seed: state.seed,
    turn: state.turn,
  };
  return { ok: true, state: dealHand(setup, config) };
};

import {
  DEFAULT_RULES,
  applyMove,
  autoMove,
  createGame,
  publicView,
  startNextHand,
  type GameState,
  type Move,
  type MoveError,
  type PublicView,
  type RulesConfig,
} from '@tenfold/engine';
import type { GameClient } from './client.ts';

export const HUMAN_ID = 'you';
const OPPONENT_NAMES = ['Ada', 'Bo', 'Cy', 'Dee', 'Eli'];

export interface LocalGameOptions {
  readonly opponents: number;
  readonly seed?: number;
  readonly botDelayMs?: number;
  readonly config?: RulesConfig;
}

/**
 * A whole game running in the browser for UI work. Opponents use the timeout auto-play
 * (draw from deck, discard the highest card) until real bots exist.
 */
export const createLocalGame = (options: LocalGameOptions): GameClient => {
  const config = options.config ?? DEFAULT_RULES;
  const delay = options.botDelayMs ?? 700;
  const opponentIds = OPPONENT_NAMES.slice(0, options.opponents).map((n) => n.toLowerCase());
  const ids = [HUMAN_ID, ...opponentIds];
  const names: Record<string, string> = { [HUMAN_ID]: 'You' };
  for (const [i, id] of opponentIds.entries()) names[id] = OPPONENT_NAMES[i] ?? id;

  let state: GameState = createGame(ids, config, options.seed ?? Date.now() % 0x100000000);
  let view: PublicView = publicView(state, HUMAN_ID);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const listeners = new Set<() => void>();

  const commit = (next: GameState) => {
    state = next;
    view = publicView(state, HUMAN_ID);
    for (const listener of listeners) listener();
    scheduleBot();
  };

  const scheduleBot = () => {
    clearTimeout(timer);
    const current = state.players[state.currentIndex];
    if (state.status !== 'playing' || !current || current.id === HUMAN_ID) return;
    timer = setTimeout(() => {
      const result = applyMove(state, current.id, autoMove(state, config), config);
      if (result.ok) commit(result.state);
    }, delay);
  };

  scheduleBot();

  return {
    config,
    myId: HUMAN_ID,
    names,
    getView: () => view,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    send: (move: Move): MoveError | null => {
      const result = applyMove(state, HUMAN_ID, move, config);
      if (!result.ok) return result.error;
      commit(result.state);
      return null;
    },
    nextHand: () => {
      const result = startNextHand(state, config);
      if (result.ok) commit(result.state);
    },
    dispose: () => {
      clearTimeout(timer);
      listeners.clear();
    },
  };
};

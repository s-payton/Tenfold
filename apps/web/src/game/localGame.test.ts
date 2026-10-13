import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HUMAN_ID, createLocalGame } from './localGame.ts';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

/** Advances fake time until it is the human's turn to draw. */
const untilMyTurn = (game: ReturnType<typeof createLocalGame>) => {
  for (let i = 0; i < 100; i++) {
    const v = game.getView();
    if (v.players[v.currentIndex]?.id === HUMAN_ID && v.step === 'draw') return;
    vi.advanceTimersByTime(1000);
  }
  throw new Error('never my turn');
};

describe('createLocalGame', () => {
  it('names the human and opponents', () => {
    const game = createLocalGame({ opponents: 3, seed: 1 });
    expect(Object.values(game.names)).toEqual(['You', 'Ada', 'Bo', 'Cy']);
    game.dispose();
  });

  it('only ever exposes the public view', () => {
    const game = createLocalGame({ opponents: 2, seed: 2 });
    const view = game.getView();
    expect(view.viewerId).toBe(HUMAN_ID);
    expect(view.hand).toHaveLength(10);
    expect(view).not.toHaveProperty('drawPile');
    game.dispose();
  });

  it('plays opponent turns on a timer until it is my turn', () => {
    const game = createLocalGame({ opponents: 3, seed: 3, botDelayMs: 10 });
    untilMyTurn(game);
    expect(game.getView().players[game.getView().currentIndex]?.id).toBe(HUMAN_ID);
    game.dispose();
  });

  it('applies my legal moves and notifies subscribers', () => {
    const game = createLocalGame({ opponents: 1, seed: 4, botDelayMs: 10 });
    untilMyTurn(game);
    const listener = vi.fn();
    game.subscribe(listener);
    expect(game.send({ type: 'draw', source: 'deck' })).toBeNull();
    expect(listener).toHaveBeenCalled();
    expect(game.getView().hand).toHaveLength(11);
    game.dispose();
  });

  it('returns the reason for an illegal move and changes nothing', () => {
    const game = createLocalGame({ opponents: 1, seed: 5, botDelayMs: 10 });
    untilMyTurn(game);
    const before = game.getView();
    expect(game.send({ type: 'discard', cardId: 'nope' })).toEqual({ code: 'must-draw-first' });
    expect(game.getView()).toBe(before);
    game.dispose();
  });
});

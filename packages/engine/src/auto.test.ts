import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { autoMove } from './auto.ts';
import { DEFAULT_RULES } from './config.ts';
import { createGame, type GameState } from './game.ts';
import { applyMove } from './moves.ts';
import { cards, num, skip, wild } from './test-helpers.ts';

const rules = DEFAULT_RULES;

const position = (hand: GameState['players'][number]['hand'], step: GameState['step']) => {
  const base = createGame(['a', 'b', 'c'], rules, 1, 2);
  return {
    ...base,
    currentIndex: 0,
    step,
    players: base.players.map((p, i) => (i === 0 ? { ...p, hand } : p)),
  };
};

describe('autoMove (turn timeout)', () => {
  it('draws from the deck', () => {
    expect(autoMove(position(cards(1, 2), 'draw'), rules)).toEqual({ type: 'draw', source: 'deck' });
  });

  it('discards the highest-point card', () => {
    const ten = num('red', 10);
    expect(autoMove(position([num('red', 3), ten, num('blue', 9)], 'play'), rules)).toEqual({
      type: 'discard',
      cardId: ten.id,
    });
    const w = wild();
    expect(autoMove(position([skip(), w, ten], 'play'), rules)).toMatchObject({ cardId: w.id });
  });

  it('skips a Wild when the house rule forbids discarding it', () => {
    const s = skip();
    const noWild = { ...rules, allowWildDiscard: false };
    expect(autoMove(position([wild(), s, num('red', 1)], 'play'), noWild)).toMatchObject({
      cardId: s.id,
    });
  });

  it('aims a Skip at the next player who can be skipped', () => {
    const s = skip();
    const state = position([s, num('red', 1)], 'play');
    expect(autoMove(state, rules)).toEqual({ type: 'discard', cardId: s.id, skipTarget: 'b' });
    const bPending = {
      ...state,
      players: state.players.map((p) => (p.id === 'b' ? { ...p, skipPending: true } : p)),
    };
    expect(autoMove(bPending, rules)).toMatchObject({ skipTarget: 'c' });
  });

  it('property: always returns a legal move, so a game can run on it alone', () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer({ min: 2, max: 6 }), (seed, n) => {
        let s = createGame(['a', 'b', 'c', 'd', 'e', 'f'].slice(0, n), rules, seed);
        for (let i = 0; i < 300; i++) {
          const player = s.players[s.currentIndex];
          if (!player) throw new Error('bad index');
          const result = applyMove(s, player.id, autoMove(s, rules), rules);
          if (!result.ok) throw new Error(JSON.stringify(result.error));
          s = result.state;
        }
      }),
      { numRuns: 30 },
    );
  });
});

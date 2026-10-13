import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { autoMove, basicMove } from './auto.ts';
import { DEFAULT_RULES } from './config.ts';
import { createGame, type GameState } from './game.ts';
import { applyMove } from './moves.ts';
import { publicView } from './view.ts';
import { cards, num, skip, wild } from './test-helpers.ts';

const rules = DEFAULT_RULES;

const position = (hand: GameState['players'][number]['hand'], step: GameState['step']) => {
  const base = createGame(['a', 'b', 'c'], rules, 1, 2);
  return publicView(
    {
      ...base,
      currentIndex: 0,
      step,
      players: base.players.map((p, i) => (i === 0 ? { ...p, hand } : p)),
    },
    'a',
  );
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
  });

  it('keeps Wilds, discarding the highest other card', () => {
    const s = skip();
    expect(autoMove(position([wild(), s, num('red', 12)], 'play'), rules)).toMatchObject({
      cardId: s.id,
    });
    const ten = num('red', 10);
    expect(autoMove(position([wild(), wild(), ten], 'play'), rules)).toMatchObject({
      cardId: ten.id,
    });
  });

  it('discards a Wild only when nothing else is left', () => {
    const w = wild();
    expect(autoMove(position([w, wild()], 'play'), rules)).toMatchObject({ cardId: w.id });
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
          const result = applyMove(s, player.id, autoMove(publicView(s, player.id), rules), rules);
          if (!result.ok) throw new Error(JSON.stringify(result.error));
          s = result.state;
        }
      }),
      { numRuns: 30 },
    );
  });
});

describe('basicMove (simple opponent)', () => {
  it("refuses to move for someone whose turn it is not", () => {
    const view = { ...position(cards(1, 2), 'draw'), currentIndex: 1 };
    expect(() => basicMove(view, rules)).toThrow(RangeError);
  });

  it('takes a Wild from the discard pile, otherwise draws from the deck', () => {
    const view = position(cards(1, 2), 'draw');
    expect(basicMove({ ...view, discardTop: wild() }, rules)).toEqual({ type: 'draw', source: 'discard' });
    expect(basicMove({ ...view, discardTop: num('red', 5) }, rules)).toEqual({ type: 'draw', source: 'deck' });
  });

  it('lays down its level as soon as it can', () => {
    const hand = cards(5, 5, 5, 9, 9, 'W', 1, 2, 3, 4, 7);
    expect(basicMove(position(hand, 'play'), rules)).toMatchObject({ type: 'lay-down' });
  });

  it('hits after laying down, then discards when no hit is left', () => {
    const base = position([num('red', 4), num('red', 11)], 'play');
    const set = { id: 'g', ownerId: 'b', group: { type: 'set' as const, value: 4, cards: cards(4, 4, 4) } };
    const laidDown = {
      ...base,
      players: base.players.map((p) => (p.id === 'a' ? { ...p, laidDown: true } : p)),
      table: [set],
    };
    expect(basicMove(laidDown, rules)).toMatchObject({ type: 'hit', groupId: 'g' });
    expect(basicMove({ ...laidDown, table: [] }, rules)).toMatchObject({ type: 'discard' });
  });

  it('property: plays whole games of legal moves, and hands get won', () => {
    let handsWon = 0;
    fc.assert(
      fc.property(fc.integer(), fc.integer({ min: 2, max: 6 }), (seed, n) => {
        let s = createGame(['a', 'b', 'c', 'd', 'e', 'f'].slice(0, n), rules, seed);
        for (let i = 0; i < 2000 && s.status === 'playing'; i++) {
          const player = s.players[s.currentIndex];
          if (!player) throw new Error('bad index');
          const result = applyMove(s, player.id, basicMove(publicView(s, player.id), rules), rules);
          if (!result.ok) throw new Error(JSON.stringify(result.error));
          s = result.state;
        }
        if (s.status !== 'playing') handsWon++;
      }),
      { numRuns: 30 },
    );
    expect(handsWon).toBeGreaterThan(20);
  });
});

import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES } from './config.ts';
import { createGame, startNextHand, type GameState } from './game.ts';
import { DEFAULT_HOUSE_RULES, levelsFor, rulesFromHouse } from './house.ts';
import { STANDARD_LEVELS } from './levels.ts';
import { applyMove } from './moves.ts';
import { cards, num } from './test-helpers.ts';

describe('levelsFor', () => {
  it('keeps all 10 levels by default', () => {
    expect(levelsFor('all')).toEqual(STANDARD_LEVELS);
  });

  it('renumbers shorter games from 1', () => {
    expect(levelsFor('first-5').map((l) => l.number)).toEqual([1, 2, 3, 4, 5]);
    expect(levelsFor('first-7')).toHaveLength(7);
    const even = levelsFor('even');
    expect(even.map((l) => l.number)).toEqual([1, 2, 3, 4, 5]);
    expect(even.map((l) => l.requirements)).toEqual(
      [2, 4, 6, 8, 10].map((n) => STANDARD_LEVELS[n - 1]?.requirements),
    );
  });
});

describe('rulesFromHouse', () => {
  it('gives the standard config for the default house rules', () => {
    expect(rulesFromHouse(DEFAULT_HOUSE_RULES)).toEqual(DEFAULT_RULES);
  });

  it('maps every house rule onto the config', () => {
    const config = rulesFromHouse({
      hitOnOthers: false,
      skipLosesTurn: false,
      wildDiscard: false,
      nextHandLeader: 'left-of-dealer',
      levelSet: 'even',
      everyoneAdvances: true,
    });
    expect(config).toMatchObject({
      allowHitOnOthers: false,
      skipLosesTurn: false,
      allowWildDiscard: false,
      nextHandLeader: 'left-of-dealer',
      everyoneAdvances: true,
    });
    expect(config.levels).toHaveLength(5);
  });
});

describe('everyone advances (rule sheet variation)', () => {
  const rules = { ...DEFAULT_RULES, everyoneAdvances: true };
  const endWith = (levels: number[], laidDown: boolean[]): GameState => {
    const base = createGame(['a', 'b', 'c'], rules, 1);
    const last = num('red', 3);
    const s: GameState = {
      ...base,
      currentIndex: 0,
      step: 'play',
      players: base.players.map((p, i) => ({
        ...p,
        level: levels[i] ?? 1,
        laidDown: laidDown[i] ?? false,
        hand: i === 0 ? [last] : i === 1 ? cards(11, 12) : cards(2),
      })),
    };
    const result = applyMove(s, 'a', { type: 'discard', cardId: last.id }, rules);
    if (!result.ok) throw new Error('move failed');
    return result.state;
  };

  it('moves everyone up a level, laid down or not', () => {
    const s = endWith([3, 3, 3], [true, false, false]);
    expect(s.status).toBe('hand-over');
    expect(s.players.map((p) => p.level)).toEqual([4, 4, 4]);
  });

  it('ends after the last level, and the lowest total score wins', () => {
    const s = endWith([10, 10, 10], [true, true, false]);
    expect(s.status).toBe('game-over');
    expect(s.players.map((p) => p.score)).toEqual([0, 20, 5]);
    expect(s.winnerId).toBe('a');
  });

  it('can still deal the next hand in between', () => {
    expect(startNextHand(endWith([2, 2, 2], [false, false, false]), rules).ok).toBe(true);
  });
});

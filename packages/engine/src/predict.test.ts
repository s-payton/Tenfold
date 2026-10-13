import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { basicMove } from './auto.ts';
import { DEFAULT_RULES } from './config.ts';
import { createGame } from './game.ts';
import { applyMove } from './moves.ts';
import { predictView } from './predict.ts';
import { publicView } from './view.ts';

const rules = DEFAULT_RULES;

describe('predictView', () => {
  it('does not predict draws, since the drawn card is secret', () => {
    const s = createGame(['a', 'b'], rules, 3);
    const me = s.players[s.currentIndex]?.id ?? '';
    expect(predictView(publicView(s, me), { type: 'draw', source: 'deck' }, rules)).toBeNull();
    expect(predictView(publicView(s, me), { type: 'draw', source: 'discard' }, rules)).toBeNull();
  });

  it('returns null for an illegal move', () => {
    const s = createGame(['a', 'b'], rules, 3);
    const me = s.players[s.currentIndex]?.id ?? '';
    expect(predictView(publicView(s, me), { type: 'discard', cardId: 'nope' }, rules)).toBeNull();
  });

  it('property: matches what the server would publish for every non-draw move', () => {
    let predicted = 0;
    fc.assert(
      fc.property(fc.integer(), fc.integer({ min: 2, max: 6 }), (seed, n) => {
        let s = createGame(['a', 'b', 'c', 'd', 'e', 'f'].slice(0, n), rules, seed);
        for (let i = 0; i < 400 && s.status === 'playing'; i++) {
          const me = s.players[s.currentIndex]?.id ?? '';
          const view = publicView(s, me);
          const move = basicMove(view, rules);
          const result = applyMove(s, me, move, rules);
          if (!result.ok) throw new Error(JSON.stringify(result.error));
          const guess = predictView(view, move, rules);
          if (guess) {
            predicted++;
            expect(guess).toEqual(publicView(result.state, me));
          } else {
            // Only draws and moves that end the hand are left to the server.
            const endsHand = result.state.status !== 'playing';
            expect(move.type === 'draw' || endsHand).toBe(true);
          }
          s = result.state;
        }
      }),
      { numRuns: 40 },
    );
    expect(predicted).toBeGreaterThan(1000);
  });
});

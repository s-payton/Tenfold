import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { DEFAULT_RULES } from './config.ts';
import { createGame } from './game.ts';
import { publicView, tableView } from './view.ts';

const players = ['a', 'b', 'c'];

describe('publicView', () => {
  const state = createGame(players, DEFAULT_RULES, 42);

  it("shows the viewer's own hand", () => {
    expect(publicView(state, 'b').hand).toEqual(state.players[1]?.hand);
  });

  it('shows only hand sizes for everyone', () => {
    expect(publicView(state, 'b').players).toEqual(
      state.players.map((p) => ({
        id: p.id,
        level: p.level,
        score: p.score,
        handCount: 10,
        laidDown: false,
        skipPending: false,
      })),
    );
  });

  it('shows pile sizes and the top discard, and hides the seed', () => {
    const view = publicView(state, 'a');
    expect(view.drawCount).toBe(state.drawPile.length);
    expect(view.discardTop).toEqual(state.discardPile.at(-1));
    expect(view.discardCount).toBe(1);
    expect(view).not.toHaveProperty('seed');
    expect(view).not.toHaveProperty('drawPile');
  });

  it('shares the turn number and who was just skipped', () => {
    expect(publicView(state, 'a')).toMatchObject({ turn: state.turn, lastSkipped: state.lastSkipped });
  });

  it('gives a spectator no hand', () => {
    expect(publicView(state, 'nobody').hand).toEqual([]);
  });

  it('property: never contains a card from another hand or the draw pile', () => {
    fc.assert(
      fc.property(fc.integer(), fc.constantFrom(...players), (seed, viewer) => {
        const s = createGame(players, DEFAULT_RULES, seed);
        const json = JSON.stringify(publicView(s, viewer));
        const hidden = [
          ...s.players.filter((p) => p.id !== viewer).flatMap((p) => p.hand),
          ...s.drawPile,
        ];
        for (const card of hidden) expect(json).not.toContain(`"${card.id}"`);
      }),
    );
  });

  it('tableView is the public view without any hand', () => {
    const view = tableView(state);
    expect(view).not.toHaveProperty('hand');
    expect(view).not.toHaveProperty('viewerId');
    expect(publicView(state, 'a')).toEqual({ ...view, viewerId: 'a', hand: state.players[0]?.hand });
    const json = JSON.stringify(view);
    for (const card of state.players.flatMap((p) => p.hand)) expect(json).not.toContain(`"${card.id}"`);
  });
});

import { useEffect, useRef } from 'react';
import type { PublicView } from '@tenfold/engine';
import { playSound } from '../audio.ts';
import { buzz } from '../haptics.ts';

const isMyDrawTurn = (view: PublicView, myId: string) =>
  view.status === 'playing' && view.step === 'draw' && view.players[view.currentIndex]?.id === myId;

/** Plays a sound for whatever changed between two views. */
export const useGameSounds = (view: PublicView, myId: string): void => {
  const previous = useRef<PublicView | null>(null);
  useEffect(() => {
    const before = previous.current;
    previous.current = view;
    if (!before || view.handNumber !== before.handNumber) {
      playSound('deal');
      return;
    }
    if (view.status === 'game-over' && before.status !== 'game-over') {
      playSound('win');
      return;
    }
    if (view.table.length > before.table.length) playSound('laydown');
    else if (view.discardCount > before.discardCount) playSound('discard');
    else if (view.drawCount !== before.drawCount || view.discardCount < before.discardCount) {
      playSound('draw');
    }
    if (isMyDrawTurn(view, myId) && !isMyDrawTurn(before, myId)) {
      playSound('turn');
      buzz(40);
    }
  }, [view, myId]);
};

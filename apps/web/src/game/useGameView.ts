import { useSyncExternalStore } from 'react';
import type { PublicView } from '@tenfold/engine';
import type { GameClient } from './client.ts';

export const useGameView = (client: GameClient): PublicView =>
  useSyncExternalStore(client.subscribe, client.getView);

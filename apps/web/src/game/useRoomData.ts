import { useSyncExternalStore } from 'react';
import type { RoomData } from '@tenfold/server';
import type { GameClient } from './client.ts';

const none = () => null;

/** Seats and the turn clock for online games; null for games against the computer. */
export const useRoomData = (client: GameClient): RoomData | null =>
  useSyncExternalStore(client.subscribe, client.getRoomData ?? none);

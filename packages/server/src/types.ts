import type { BotLevel, Card, GameState, Move, MoveError, TableView } from '@tenfold/engine';

export type RoomStatus = 'lobby' | 'playing' | 'finished';

export interface RoomPlayer {
  readonly id: string;
  readonly name: string;
  readonly seat: number;
  /**
   * Set when a computer plays this seat: a computer player the host added, or a bot
   * standing in for a person who missed 2 turns in a row (they can take it back).
   */
  readonly bot: BotLevel | null;
  /** Turns in a row this person let time out. */
  readonly missed: number;
}

/** Everything members of a room may see. Published to the `room_states` table. */
export interface RoomData {
  readonly code: string;
  readonly status: RoomStatus;
  readonly hostPlayerId: string;
  readonly players: readonly RoomPlayer[];
  readonly table: TableView | null;
  /** When the current turn times out, in epoch milliseconds. Null when nobody is on the clock. */
  readonly turnDeadline: number | null;
}

/** Links a seat to the anonymous auth user who owns it. */
export interface Member {
  readonly playerId: string;
  readonly userId: string;
}

/** A room as the server stores it, including the secret full game state. */
export interface StoredRoom {
  readonly id: string;
  readonly code: string;
  readonly version: number;
  readonly data: RoomData;
  readonly game: GameState | null;
  readonly members: readonly Member[];
}

/** Persistence the handlers need. The Supabase adapter and an in-memory test store implement it. */
export interface Store {
  readonly loadRoom: (key: { readonly id: string } | { readonly code: string }) => Promise<StoredRoom | null>;
  /** Returns false if the room code is taken. */
  readonly createRoom: (room: StoredRoom) => Promise<boolean>;
  /** Saves atomically if the stored version still equals `expectedVersion`. Returns false on a conflict. */
  readonly saveRoom: (room: StoredRoom, expectedVersion: number) => Promise<boolean>;
}

export interface Deps {
  /** Uniform random number in [0, 1). */
  readonly random: () => number;
  readonly newId: () => string;
  /** Current time in epoch milliseconds. */
  readonly now: () => number;
}

export type Action =
  | { readonly type: 'create'; readonly name: string }
  | { readonly type: 'join'; readonly code: string; readonly name: string }
  | { readonly type: 'start'; readonly roomId: string }
  | { readonly type: 'move'; readonly roomId: string; readonly move: Move }
  | { readonly type: 'next-hand'; readonly roomId: string }
  /** Anyone in the room may ask; it only acts once the deadline has passed. */
  | { readonly type: 'timeout'; readonly roomId: string }
  | { readonly type: 'reclaim'; readonly roomId: string }
  | { readonly type: 'leave'; readonly roomId: string }
  | { readonly type: 'add-bot'; readonly roomId: string; readonly level: BotLevel }
  | { readonly type: 'remove'; readonly roomId: string; readonly playerId: string };

export type ServerError =
  | {
      readonly code:
        | 'bad-request'
        | 'room-not-found'
        | 'room-full'
        | 'game-started'
        | 'not-a-member'
        | 'not-host'
        | 'not-enough-players'
        | 'not-started'
        | 'not-in-lobby'
        | 'too-early'
        | 'busy';
    }
  | { readonly code: 'move-rejected'; readonly error: MoveError };

/** What one player may see of a room right after a save: shared data plus their own hand. */
export interface RoomSnapshot {
  readonly version: number;
  readonly data: RoomData;
  /** The caller's hand. Null before the game starts. */
  readonly cards: readonly Card[] | null;
}

export type ActionResult =
  | {
      readonly ok: true;
      readonly roomId: string;
      readonly code: string;
      readonly playerId: string;
      /** Lets the caller show the result without reading it back. */
      readonly snapshot: RoomSnapshot;
    }
  | { readonly ok: false; readonly error: ServerError };

import type { BotLevel, Card, GameState, HouseRules, Move, MoveError, TableView } from '@tenfold/engine';

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

/** Table backgrounds a host can pick. */
export const TABLE_THEMES = ['green', 'blue', 'red', 'wood', 'midnight'] as const;
export type TableTheme = (typeof TABLE_THEMES)[number];

/** Seconds a person gets per move, or null for no clock. */
export const TURN_SECONDS = [15, 30, 60, 90, null] as const;
export type TurnSeconds = (typeof TURN_SECONDS)[number];

/** What the host chooses before the game starts. */
export interface RoomSettings {
  readonly rules: HouseRules;
  readonly table: TableTheme;
  readonly turnSeconds: TurnSeconds;
}

/** Who paused a timed game, and how much of the turn was left. */
export interface Pause {
  readonly by: string;
  readonly remainingMs: number;
}

/** Everything members of a room may see. Published to the `room_states` table. */
export interface RoomData {
  readonly code: string;
  readonly status: RoomStatus;
  readonly hostPlayerId: string;
  readonly settings: RoomSettings;
  readonly players: readonly RoomPlayer[];
  readonly table: TableView | null;
  /** When the current turn times out, in epoch milliseconds. Null when nobody is on the clock. */
  readonly turnDeadline: number | null;
  /** Set while someone has paused the game. Missing in rooms saved before pausing existed. */
  readonly paused?: Pause | null;
}

/** Quick reactions anyone can send from the chat panel. */
export const CHAT_EMOJIS = ['👍', '😂', '😮', '😬', '😡', '🎉', '❤️', '👏'] as const;
export type ChatEmoji = (typeof CHAT_EMOJIS)[number];

/** Things a player can throw at another player, just for fun. */
export const THROWABLES = ['egg', 'pie'] as const;
export type Throwable = (typeof THROWABLES)[number];

export type ChatBody =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'emoji'; readonly emoji: ChatEmoji }
  | { readonly kind: 'throw'; readonly item: Throwable; readonly targetId: string };

/** A chat message as clients read it from the `room_messages` table. */
export interface ChatMessage {
  readonly id: number;
  readonly playerId: string;
  /** Epoch milliseconds. */
  readonly at: number;
  readonly body: ChatBody;
}

/** A message the referee has checked and is about to store. */
export interface NewMessage {
  readonly roomId: string;
  readonly playerId: string;
  readonly body: ChatBody;
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
  /** Stores a chat message. Returns false if this player is sending too fast. */
  readonly addMessage: (message: NewMessage) => Promise<boolean>;
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
  | { readonly type: 'remove'; readonly roomId: string; readonly playerId: string }
  | { readonly type: 'settings'; readonly roomId: string; readonly settings: RoomSettings }
  /** Anyone may pause a game that has a clock running, and anyone may resume it. */
  | { readonly type: 'pause'; readonly roomId: string }
  | { readonly type: 'resume'; readonly roomId: string }
  | { readonly type: 'chat'; readonly roomId: string; readonly body: ChatBody };

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
        | 'paused'
        | 'slow-down'
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

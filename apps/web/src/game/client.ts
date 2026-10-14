import type { Move, MoveError, PublicView, RulesConfig } from '@tenfold/engine';
import type { ChatBody, ChatMessage, RoomData } from '@tenfold/server';
import type { ApiError } from '../net/api.ts';

/** A rules refusal from the engine, or a network problem. */
export type SendError = MoveError | { readonly code: 'offline' };

export interface ChatEntry extends ChatMessage {
  /**
   * True if it arrived while this screen was open. Only live messages play their
   * animation, so history loaded after a rejoin or a phone wake stays quiet.
   */
  readonly live: boolean;
}

/** Chat, emoji reactions and throws. Shared online; against the computer, only throws. */
export interface ChatClient {
  /** False when there is nobody to talk to, so the chat panel stays hidden. */
  readonly canTalk: boolean;
  /** Oldest first. A new array whenever something arrives. */
  readonly getMessages: () => readonly ChatEntry[];
  /** Resolves to null once sent. Same subscribe as the view. */
  readonly send: (body: ChatBody) => Promise<ApiError | null>;
}

/**
 * What the UI talks to. The local fake game implements it now. The Supabase client will
 * implement the same thing later, so screens never see full game state.
 */
export interface GameClient {
  readonly config: RulesConfig;
  readonly myId: string;
  /** Display names by player id. */
  readonly names: Readonly<Record<string, string>>;
  readonly getView: () => PublicView;
  readonly subscribe: (listener: () => void) => () => void;
  /** Resolves to null on success, or why the move was refused. */
  readonly send: (move: Move) => Promise<SendError | null>;
  readonly nextHand: () => void;
  readonly dispose: () => void;
  readonly chat: ChatClient;
  /** Online only: seats (bots, missed turns) and the turn clock. Same subscribe as the view. */
  readonly getRoomData?: () => RoomData;
  /** Online only: take this seat back from the stand-in bot. */
  readonly reclaim?: () => void;
  /** Online only: leave mid-game; a bot takes the seat until this player comes back. */
  readonly leave?: () => Promise<void>;
  /** Online only: stop or restart the turn clock for everyone. */
  readonly pause?: () => void;
  readonly resume?: () => void;
}

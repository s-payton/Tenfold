import type { Move, MoveError, PublicView, RulesConfig } from '@tenfold/engine';

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
  readonly send: (move: Move) => MoveError | null;
  readonly nextHand: () => void;
  readonly dispose: () => void;
}

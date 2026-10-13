import { STANDARD_LEVELS, type LevelDefinition } from './levels.ts';

/** Every rule that can vary. Defaults match the standard rules. */
export interface RulesConfig {
  readonly levels: readonly LevelDefinition[];
  readonly handSize: number;
  /** Every laid-down group must contain at least one number card. */
  readonly requireNaturalCard: boolean;
  /** Players may hit on groups laid down by other players. */
  readonly allowHitOnOthers: boolean;
  /** Discarding a Skip makes the chosen player lose their next turn. */
  readonly skipLosesTurn: boolean;
  /** Wilds may be discarded. */
  readonly allowWildDiscard: boolean;
  /**
   * Who plays first in the next hand. 'hand-winner': whoever went out leads (house rule,
   * the owner's choice). 'left-of-dealer': the deal passes left, as on the rule sheet.
   */
  readonly nextHandLeader: 'hand-winner' | 'left-of-dealer';
}

export const DEFAULT_RULES: RulesConfig = {
  levels: STANDARD_LEVELS,
  handSize: 10,
  requireNaturalCard: true,
  allowHitOnOthers: true,
  skipLosesTurn: true,
  allowWildDiscard: true,
  nextHandLeader: 'hand-winner',
};

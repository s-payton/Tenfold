import { DEFAULT_RULES, type RulesConfig } from './config.ts';
import { STANDARD_LEVELS, type LevelDefinition } from './levels.ts';

/** Which levels a game uses. The shorter ones are variations from the rule sheet. */
export type LevelSet = 'all' | 'first-5' | 'first-7' | 'even';
export const LEVEL_SETS: readonly LevelSet[] = ['all', 'first-5', 'first-7', 'even'];

/** The choices a host can make. Everything maps onto RulesConfig. */
export interface HouseRules {
  readonly hitOnOthers: boolean;
  readonly skipLosesTurn: boolean;
  readonly wildDiscard: boolean;
  readonly nextHandLeader: RulesConfig['nextHandLeader'];
  readonly levelSet: LevelSet;
  readonly everyoneAdvances: boolean;
}

export const DEFAULT_HOUSE_RULES: HouseRules = {
  hitOnOthers: DEFAULT_RULES.allowHitOnOthers,
  skipLosesTurn: DEFAULT_RULES.skipLosesTurn,
  wildDiscard: DEFAULT_RULES.allowWildDiscard,
  nextHandLeader: DEFAULT_RULES.nextHandLeader,
  levelSet: 'all',
  everyoneAdvances: DEFAULT_RULES.everyoneAdvances,
};

const renumber = (levels: readonly LevelDefinition[]): LevelDefinition[] =>
  levels.map((level, i) => ({ ...level, number: i + 1 }));

export const levelsFor = (set: LevelSet): readonly LevelDefinition[] => {
  switch (set) {
    case 'all':
      return STANDARD_LEVELS;
    case 'first-5':
      return renumber(STANDARD_LEVELS.slice(0, 5));
    case 'first-7':
      return renumber(STANDARD_LEVELS.slice(0, 7));
    case 'even':
      return renumber(STANDARD_LEVELS.filter((l) => l.number % 2 === 0));
  }
};

export const rulesFromHouse = (house: HouseRules): RulesConfig => ({
  ...DEFAULT_RULES,
  levels: levelsFor(house.levelSet),
  allowHitOnOthers: house.hitOnOthers,
  skipLosesTurn: house.skipLosesTurn,
  allowWildDiscard: house.wildDiscard,
  nextHandLeader: house.nextHandLeader,
  everyoneAdvances: house.everyoneAdvances,
});

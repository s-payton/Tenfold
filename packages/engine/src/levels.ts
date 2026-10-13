import type { RulesConfig } from './config.ts';

export type GroupType = 'set' | 'run' | 'color';

/** One group a level needs. `size` is a minimum: extra cards that fit are allowed. */
export interface GroupRequirement {
  readonly type: GroupType;
  readonly size: number;
}

export interface LevelDefinition {
  readonly number: number;
  readonly requirements: readonly GroupRequirement[];
}

const set = (size: number): GroupRequirement => ({ type: 'set', size });
const run = (size: number): GroupRequirement => ({ type: 'run', size });
const color = (size: number): GroupRequirement => ({ type: 'color', size });

export const STANDARD_LEVELS: readonly LevelDefinition[] = [
  { number: 1, requirements: [set(3), set(3)] },
  { number: 2, requirements: [set(3), run(4)] },
  { number: 3, requirements: [set(4), run(4)] },
  { number: 4, requirements: [run(7)] },
  { number: 5, requirements: [run(8)] },
  { number: 6, requirements: [run(9)] },
  { number: 7, requirements: [set(4), set(4)] },
  { number: 8, requirements: [color(7)] },
  { number: 9, requirements: [set(5), set(2)] },
  { number: 10, requirements: [set(5), set(3)] },
];

export const getLevel = (config: RulesConfig, number: number): LevelDefinition | undefined =>
  config.levels.find((level) => level.number === number);

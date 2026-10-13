import type { GroupRequirement, HitError, LevelError, MoveError } from '@tenfold/engine';

/**
 * Every word the player reads lives here, so the game's terms are easy to change.
 * Use "level" for what the rules call a phase.
 */
export const COPY = {
  appName: 'Tenfold',
  tagline: 'Ten levels. One winner.',
  level: 'Level',
  you: 'You',
  start: 'Deal me in',
  opponentsLabel: 'Opponents',
  drawHint: 'Your turn. Draw from the deck or take the top discard.',
  playHint: 'Lay down, hit, or pick a card to discard.',
  playHintLaidDown: 'Hit on any group, or pick a card to discard.',
  waiting: (name: string) => `${name} is playing...`,
  deck: 'Deck',
  discardPile: 'Discard',
  layDown: 'Lay down level',
  layDownConfirm: 'Lay it down',
  cancel: 'Cancel',
  discard: 'Discard',
  addToGroup: 'Add selected',
  shiftWilds: 'Move wilds',
  sortByNumber: 'Sort: number',
  sortByColor: 'Sort: color',
  hitLow: 'Low end',
  hitHigh: 'High end',
  whereWild: 'Which end should the wild go on?',
  skipWho: 'Who loses their next turn?',
  skipped: 'Skipped',
  dealer: 'Dealer',
  cards: (n: number) => (n === 1 ? '1 card' : `${String(n)} cards`),
  points: (n: number) => `${String(n)} pts`,
  levelOf: (n: number) => `Level ${String(n)}`,
  wentOut: (name: string) => `${name} went out!`,
  advances: (level: number) => `On to level ${String(level)}`,
  repeats: (level: number) => `Repeats level ${String(level)}`,
  nextHand: 'Deal next hand',
  wins: (name: string) => `${name} wins!`,
  playAgain: 'Play again',
  home: 'Home',
  emptyTable: 'Laid-down groups show up here.',
} as const;

export const describeRequirement = (r: GroupRequirement): string => {
  switch (r.type) {
    case 'set':
      return `Set of ${String(r.size)}`;
    case 'run':
      return `Run of ${String(r.size)}`;
    case 'color':
      return `${String(r.size)} of one color`;
  }
};

export const describeLevel = (requirements: readonly GroupRequirement[]): string =>
  requirements.map(describeRequirement).join(' + ');

const GROUP_ERRORS: Record<HitError, string> = {
  'too-small': 'Not enough cards in that group yet.',
  'contains-skip': 'Skips cannot go in a group.',
  'no-natural': 'Each group needs at least one number card.',
  'mixed-numbers': 'A set needs cards with the same number.',
  'mixed-colors': 'Those cards are not all one color.',
  'not-in-sequence': 'Those numbers are not in a row.',
  'out-of-range': 'Runs only go from 1 to 12.',
  'needs-position': 'Pick an end for the wild.',
};

export const groupErrorMessage = (error: HitError): string => GROUP_ERRORS[error];

const levelErrorMessage = (error: LevelError): string => {
  switch (error.code) {
    case 'wrong-group-count':
      return `This level needs ${String(error.expected)} groups.`;
    case 'duplicate-card':
      return 'A card is in two groups.';
    case 'group-invalid':
      return `Group ${String(error.index + 1)}: ${groupErrorMessage(error.error)}`;
  }
};

const MOVE_ERRORS = {
  'game-not-active': 'The hand is over.',
  'hand-not-over': 'The hand is still going.',
  'unknown-player': 'You are not in this game.',
  'not-your-turn': 'Wait for your turn.',
  'must-draw-first': 'Draw a card first.',
  'already-drew': 'You already drew this turn.',
  'card-not-in-hand': 'That card is not in your hand.',
  'discard-empty': 'The discard pile is empty.',
  'cannot-take-skip': 'Skips cannot be taken from the discard pile.',
  'draw-pile-empty': 'The deck is empty.',
  'already-laid-down': 'You already laid down this hand.',
  'must-lay-down-first': 'Lay down your level before hitting.',
  'group-not-found': 'That group is gone.',
  'cannot-hit-others': "You can only hit on your own groups.",
  'cannot-discard-wild': 'Wilds cannot be discarded.',
  'skip-target-required': 'Choose who to skip.',
  'invalid-skip-target': 'That player cannot be skipped right now.',
} as const satisfies Record<Exclude<MoveError['code'], 'level-invalid' | 'hit-invalid'>, string>;

export const moveErrorMessage = (error: MoveError): string => {
  switch (error.code) {
    case 'level-invalid':
      return levelErrorMessage(error.error);
    case 'hit-invalid':
      return groupErrorMessage(error.error);
    default:
      return MOVE_ERRORS[error.code];
  }
};

import { BOT_LEVELS, LEVEL_SETS, type BotLevel, type HouseRules, type Move } from '@tenfold/engine';
import { CHAT_EMOJIS, TABLE_THEMES, THROWABLES, TURN_SECONDS, type RoomSettings } from './types.ts';
import type { Action, ChatBody } from './types.ts';

export const MAX_NAME_LENGTH = 16;
export const MAX_CHAT_LENGTH = 200;
export const ROOM_CODE_LENGTH = 4;
/** Consonants only, so codes never spell words and never mix up O/0 or I/1. */
export const ROOM_CODE_LETTERS = 'BCDFGHJKLMNPQRSTVWXZ';

const MAX_ID_LENGTH = 64;
const MAX_GROUPS = 4;
const MAX_GROUP_CARDS = 12;

type Json = Record<string, unknown>;

const isRecord = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isId = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= MAX_ID_LENGTH;

/** Trims, drops control characters, and limits length. Returns null if nothing is left. */
export const cleanName = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  // eslint-disable-next-line no-control-regex
  const name = value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, MAX_NAME_LENGTH);
  return name.length > 0 ? name : null;
};

/** Like cleanName but longer, and counted in characters so an emoji is never cut in half. */
export const cleanText = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  // eslint-disable-next-line no-control-regex
  const text = value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  const clipped = Array.from(text).slice(0, MAX_CHAT_LENGTH).join('').trim();
  return clipped.length > 0 ? clipped : null;
};

export const cleanCode = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const code = value.trim().toUpperCase();
  const pattern = new RegExp(`^[${ROOM_CODE_LETTERS}]{${String(ROOM_CODE_LENGTH)}}$`);
  return pattern.test(code) ? code : null;
};

const parseGroups = (value: unknown): string[][] | null => {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_GROUPS) return null;
  const groups: string[][] = [];
  for (const group of value) {
    if (!Array.isArray(group) || group.length > MAX_GROUP_CARDS || !group.every(isId)) return null;
    groups.push(group);
  }
  return groups;
};

/** Turns untrusted JSON into a well-formed Move, or null. Legality is the engine's job. */
export const parseMove = (input: unknown): Move | null => {
  if (!isRecord(input)) return null;
  switch (input.type) {
    case 'draw':
      return input.source === 'deck' || input.source === 'discard'
        ? { type: 'draw', source: input.source }
        : null;
    case 'lay-down': {
      const groups = parseGroups(input.groups);
      return groups ? { type: 'lay-down', groups } : null;
    }
    case 'hit': {
      if (!isId(input.groupId) || !isId(input.cardId)) return null;
      const base = { type: 'hit', groupId: input.groupId, cardId: input.cardId } as const;
      if (input.position === undefined) return base;
      return input.position === 'start' || input.position === 'end'
        ? { ...base, position: input.position }
        : null;
    }
    case 'discard': {
      if (!isId(input.cardId)) return null;
      const base = { type: 'discard', cardId: input.cardId } as const;
      if (input.skipTarget === undefined) return base;
      return isId(input.skipTarget) ? { ...base, skipTarget: input.skipTarget } : null;
    }
    default:
      return null;
  }
};

const oneOf = <T>(options: readonly T[], value: unknown): T | undefined =>
  options.find((o) => o === value);

/** Turns an untrusted chat message into a well-formed one, or null. */
export const parseChatBody = (input: unknown): ChatBody | null => {
  if (!isRecord(input)) return null;
  switch (input.kind) {
    case 'text': {
      const text = cleanText(input.text);
      return text ? { kind: 'text', text } : null;
    }
    case 'emoji': {
      const emoji = oneOf(CHAT_EMOJIS, input.emoji);
      return emoji ? { kind: 'emoji', emoji } : null;
    }
    case 'throw': {
      const item = oneOf(THROWABLES, input.item);
      return item && isId(input.targetId) ? { kind: 'throw', item, targetId: input.targetId } : null;
    }
    default:
      return null;
  }
};

const parseHouseRules = (input: unknown): HouseRules | null => {
  if (!isRecord(input)) return null;
  const { hitOnOthers, skipLosesTurn, wildDiscard, everyoneAdvances } = input;
  const nextHandLeader = oneOf(['hand-winner', 'left-of-dealer'] as const, input.nextHandLeader);
  const levelSet = oneOf(LEVEL_SETS, input.levelSet);
  if (
    typeof hitOnOthers !== 'boolean' ||
    typeof skipLosesTurn !== 'boolean' ||
    typeof wildDiscard !== 'boolean' ||
    typeof everyoneAdvances !== 'boolean' ||
    !nextHandLeader ||
    !levelSet
  ) {
    return null;
  }
  return { hitOnOthers, skipLosesTurn, wildDiscard, everyoneAdvances, nextHandLeader, levelSet };
};

/** Turns untrusted room settings into well-formed ones, or null. */
export const parseSettings = (input: unknown): RoomSettings | null => {
  if (!isRecord(input)) return null;
  const rules = parseHouseRules(input.rules);
  const table = oneOf(TABLE_THEMES, input.table);
  const turnSeconds = TURN_SECONDS.find((t) => t === input.turnSeconds);
  if (!rules || !table || turnSeconds === undefined) return null;
  return { rules, table, turnSeconds };
};

/** Turns an untrusted request body into an Action, or null. */
export const parseAction = (input: unknown): Action | null => {
  if (!isRecord(input)) return null;
  switch (input.type) {
    case 'create': {
      const name = cleanName(input.name);
      return name ? { type: 'create', name } : null;
    }
    case 'join': {
      const name = cleanName(input.name);
      const code = cleanCode(input.code);
      return name && code ? { type: 'join', code, name } : null;
    }
    case 'start':
    case 'next-hand':
    case 'timeout':
    case 'reclaim':
    case 'leave':
    case 'pause':
    case 'resume':
      return isId(input.roomId) ? { type: input.type, roomId: input.roomId } : null;
    case 'add-bot': {
      const level = BOT_LEVELS.find((l): l is BotLevel => l === input.level);
      return isId(input.roomId) && level ? { type: 'add-bot', roomId: input.roomId, level } : null;
    }
    case 'settings': {
      const settings = parseSettings(input.settings);
      return isId(input.roomId) && settings ? { type: 'settings', roomId: input.roomId, settings } : null;
    }
    case 'remove':
      return isId(input.roomId) && isId(input.playerId)
        ? { type: 'remove', roomId: input.roomId, playerId: input.playerId }
        : null;
    case 'chat': {
      const body = parseChatBody(input.body);
      return isId(input.roomId) && body ? { type: 'chat', roomId: input.roomId, body } : null;
    }
    case 'move': {
      const move = parseMove(input.move);
      return isId(input.roomId) && move ? { type: 'move', roomId: input.roomId, move } : null;
    }
    default:
      return null;
  }
};

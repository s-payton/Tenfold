import type { Move } from '@tenfold/engine';
import type { Action } from './types.ts';

export const MAX_NAME_LENGTH = 16;
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
      return isId(input.roomId) ? { type: input.type, roomId: input.roomId } : null;
    case 'move': {
      const move = parseMove(input.move);
      return isId(input.roomId) && move ? { type: 'move', roomId: input.roomId, move } : null;
    }
    default:
      return null;
  }
};

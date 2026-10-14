import { describe, expect, it } from 'vitest';
import { MAX_CHAT_LENGTH, cleanCode, cleanName, cleanText, parseAction, parseChatBody, parseMove, parseSettings } from './parse.ts';
import { DEFAULT_SETTINGS } from './rooms.ts';

describe('cleanName', () => {
  it('trims, strips control characters and caps the length', () => {
    expect(cleanName('  Sam  ')).toBe('Sam');
    expect(cleanName('A\u0000B\nC')).toBe('ABC');
    expect(cleanName('x'.repeat(40))).toHaveLength(16);
  });

  it('rejects empty or non-string names', () => {
    expect(cleanName('   ')).toBeNull();
    expect(cleanName(42)).toBeNull();
  });
});

describe('cleanText', () => {
  it('turns control characters into spaces, trims, and caps the length', () => {
    expect(cleanText('  hi\nthere  ')).toBe('hi there');
    expect(cleanText('x'.repeat(500))).toHaveLength(MAX_CHAT_LENGTH);
    expect(cleanText(' \n ')).toBeNull();
    expect(cleanText(7)).toBeNull();
  });

  it('never cuts an emoji in half', () => {
    const text = cleanText('😂'.repeat(MAX_CHAT_LENGTH + 5)) ?? '';
    expect(Array.from(text)).toHaveLength(MAX_CHAT_LENGTH);
    expect(text.endsWith('😂')).toBe(true);
  });
});

describe('parseChatBody', () => {
  it('accepts text, listed emojis and throws', () => {
    expect(parseChatBody({ kind: 'text', text: ' gg ' })).toEqual({ kind: 'text', text: 'gg' });
    expect(parseChatBody({ kind: 'emoji', emoji: '🎉' })).toEqual({ kind: 'emoji', emoji: '🎉' });
    expect(parseChatBody({ kind: 'throw', item: 'pie', targetId: 'p2' })).toEqual({
      kind: 'throw',
      item: 'pie',
      targetId: 'p2',
    });
  });

  it('rejects anything else', () => {
    expect(parseChatBody({ kind: 'text', text: '   ' })).toBeNull();
    expect(parseChatBody({ kind: 'emoji', emoji: '💩' })).toBeNull();
    expect(parseChatBody({ kind: 'throw', item: 'brick', targetId: 'p2' })).toBeNull();
    expect(parseChatBody({ kind: 'throw', item: 'egg' })).toBeNull();
    expect(parseChatBody({ kind: 'shout' })).toBeNull();
    expect(parseChatBody('hi')).toBeNull();
  });
});

describe('cleanCode', () => {
  it('accepts 4 consonants in any case', () => {
    expect(cleanCode(' bcdf ')).toBe('BCDF');
  });

  it('rejects vowels, digits and wrong lengths', () => {
    expect(cleanCode('ABCD')).toBeNull();
    expect(cleanCode('BCD1')).toBeNull();
    expect(cleanCode('BCDFG')).toBeNull();
  });
});

describe('parseMove', () => {
  it('accepts every well-formed move', () => {
    expect(parseMove({ type: 'draw', source: 'deck' })).toEqual({ type: 'draw', source: 'deck' });
    expect(parseMove({ type: 'lay-down', groups: [['a', 'b'], ['c']] })).toEqual({
      type: 'lay-down',
      groups: [['a', 'b'], ['c']],
    });
    expect(parseMove({ type: 'hit', groupId: 'g', cardId: 'c', position: 'end' })).toEqual({
      type: 'hit',
      groupId: 'g',
      cardId: 'c',
      position: 'end',
    });
    expect(parseMove({ type: 'discard', cardId: 'c', skipTarget: 'p' })).toEqual({
      type: 'discard',
      cardId: 'c',
      skipTarget: 'p',
    });
  });

  it('drops unknown fields', () => {
    expect(parseMove({ type: 'discard', cardId: 'c', extra: 'x' })).toEqual({
      type: 'discard',
      cardId: 'c',
    });
  });

  it('rejects malformed moves', () => {
    expect(parseMove(null)).toBeNull();
    expect(parseMove({ type: 'draw', source: 'sky' })).toBeNull();
    expect(parseMove({ type: 'lay-down', groups: 'abc' })).toBeNull();
    expect(parseMove({ type: 'lay-down', groups: [[1, 2]] })).toBeNull();
    expect(parseMove({ type: 'lay-down', groups: [] })).toBeNull();
    expect(parseMove({ type: 'hit', groupId: 'g', cardId: 'c', position: 'middle' })).toBeNull();
    expect(parseMove({ type: 'discard', cardId: '' })).toBeNull();
    expect(parseMove({ type: 'discard', cardId: 'x'.repeat(100) })).toBeNull();
    expect(parseMove({ type: 'cheat' })).toBeNull();
  });
});

describe('parseAction', () => {
  it('parses each action', () => {
    expect(parseAction({ type: 'create', name: ' Sam ' })).toEqual({ type: 'create', name: 'Sam' });
    expect(parseAction({ type: 'join', code: 'bcdf', name: 'Al' })).toEqual({
      type: 'join',
      code: 'BCDF',
      name: 'Al',
    });
    expect(parseAction({ type: 'start', roomId: 'r1' })).toEqual({ type: 'start', roomId: 'r1' });
    expect(parseAction({ type: 'next-hand', roomId: 'r1' })).toEqual({
      type: 'next-hand',
      roomId: 'r1',
    });
    expect(
      parseAction({ type: 'move', roomId: 'r1', move: { type: 'draw', source: 'deck' } }),
    ).toEqual({ type: 'move', roomId: 'r1', move: { type: 'draw', source: 'deck' } });
  });

  it('parses the seat and timer actions', () => {
    for (const type of ['timeout', 'reclaim', 'leave', 'pause', 'resume'] as const) {
      expect(parseAction({ type, roomId: 'r1' })).toEqual({ type, roomId: 'r1' });
    }
    expect(parseAction({ type: 'add-bot', roomId: 'r1', level: 'hard' })).toEqual({
      type: 'add-bot',
      roomId: 'r1',
      level: 'hard',
    });
    expect(parseAction({ type: 'add-bot', roomId: 'r1', level: 'genius' })).toBeNull();
    expect(parseAction({ type: 'remove', roomId: 'r1', playerId: 'p2' })).toEqual({
      type: 'remove',
      roomId: 'r1',
      playerId: 'p2',
    });
    expect(parseAction({ type: 'remove', roomId: 'r1' })).toBeNull();
  });

  it('parses chat', () => {
    expect(parseAction({ type: 'chat', roomId: 'r1', body: { kind: 'text', text: 'hi' } })).toEqual({
      type: 'chat',
      roomId: 'r1',
      body: { kind: 'text', text: 'hi' },
    });
    expect(parseAction({ type: 'chat', roomId: 'r1', body: { kind: 'text', text: '' } })).toBeNull();
    expect(parseAction({ type: 'chat', body: { kind: 'text', text: 'hi' } })).toBeNull();
  });

  it('rejects bad actions', () => {
    expect(parseAction('create')).toBeNull();
    expect(parseAction({ type: 'create', name: '' })).toBeNull();
    expect(parseAction({ type: 'join', code: 'AAAA', name: 'Al' })).toBeNull();
    expect(parseAction({ type: 'move', roomId: 'r1', move: { type: 'nope' } })).toBeNull();
    expect(parseAction({ type: 'delete-everything' })).toBeNull();
  });
});

describe('parseSettings', () => {
  it('accepts valid settings', () => {
    expect(parseSettings(DEFAULT_SETTINGS)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings({ ...DEFAULT_SETTINGS, turnSeconds: null, table: 'midnight' })).toMatchObject({
      turnSeconds: null,
      table: 'midnight',
    });
  });

  it('rejects anything off the menu', () => {
    expect(parseSettings({ ...DEFAULT_SETTINGS, turnSeconds: 15 })).toMatchObject({ turnSeconds: 15 });
    expect(parseSettings({ ...DEFAULT_SETTINGS, turnSeconds: 5 })).toBeNull();
    expect(parseSettings({ ...DEFAULT_SETTINGS, table: 'neon' })).toBeNull();
    expect(parseSettings({ ...DEFAULT_SETTINGS, rules: { ...DEFAULT_SETTINGS.rules, levelSet: 'odd' } })).toBeNull();
    expect(parseSettings({ ...DEFAULT_SETTINGS, rules: { ...DEFAULT_SETTINGS.rules, wildDiscard: 'yes' } })).toBeNull();
  });
});

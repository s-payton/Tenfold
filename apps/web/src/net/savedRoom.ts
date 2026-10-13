/** The last room joined on this device, so a refresh or a new tab can rejoin the same seat. */
export interface SavedRoom {
  readonly roomId: string;
  readonly code: string;
  readonly playerId: string;
}

const ROOM_KEY = 'tenfold.room';
const NAME_KEY = 'tenfold.name';

const read = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const write = (key: string, value: string | null): void => {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Private mode or blocked storage: rejoin just will not be offered.
  }
};

export const loadSavedRoom = (): SavedRoom | null => {
  const raw = read(ROOM_KEY);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<SavedRoom>;
    return value.roomId && value.code && value.playerId
      ? { roomId: value.roomId, code: value.code, playerId: value.playerId }
      : null;
  } catch {
    return null;
  }
};

export const saveRoom = (room: SavedRoom | null): void =>
  write(ROOM_KEY, room ? JSON.stringify(room) : null);

export const loadName = (): string => read(NAME_KEY) ?? '';
export const saveName = (name: string): void => write(NAME_KEY, name);

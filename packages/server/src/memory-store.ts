import type { Store, StoredRoom } from './types.ts';

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** An in-memory Store with the same version check as the database, for tests. */
export const createMemoryStore = () => {
  const rooms = new Map<string, StoredRoom>();
  let failNextSaves = 0;
  const store: Store = {
    loadRoom: (key) => {
      const room =
        'id' in key ? rooms.get(key.id) : [...rooms.values()].find((r) => r.code === key.code);
      return Promise.resolve(room ? clone(room) : null);
    },
    createRoom: (room) => {
      if ([...rooms.values()].some((r) => r.code === room.code)) return Promise.resolve(false);
      rooms.set(room.id, clone({ ...room, version: 1 }));
      return Promise.resolve(true);
    },
    saveRoom: (room, expectedVersion) => {
      const current = rooms.get(room.id);
      if (!current || current.version !== expectedVersion || failNextSaves > 0) {
        failNextSaves = Math.max(0, failNextSaves - 1);
        return Promise.resolve(false);
      }
      rooms.set(room.id, clone({ ...room, version: expectedVersion + 1 }));
      return Promise.resolve(true);
    },
  };
  return {
    store,
    rooms,
    /** Makes the next `n` saves report a conflict, like another request winning the race. */
    failSaves: (n: number) => {
      failNextSaves = n;
    },
  };
};

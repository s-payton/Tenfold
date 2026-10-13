import { DEFAULT_SETTINGS, parseSettings, type RoomSettings } from '@tenfold/server';

const KEY = 'tenfold.settings';

/** This device's last-used settings, for games against the computer and new rooms. */
export const loadSettings = (): RoomSettings => {
  try {
    const raw = localStorage.getItem(KEY);
    return (raw ? parseSettings(JSON.parse(raw)) : null) ?? DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
};

export const saveSettings = (settings: RoomSettings): void => {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Storage blocked: settings just will not be remembered.
  }
};

/** Shows a table theme by setting `data-table` on the page root. */
export const applyTable = (table: RoomSettings['table']): void => {
  document.documentElement.dataset.table = table;
};

/** Vibration is a bonus: Android supports it, iOS ignores it. */
export const buzz = (pattern: number | number[]): void => {
  if ('vibrate' in navigator) navigator.vibrate(pattern);
};

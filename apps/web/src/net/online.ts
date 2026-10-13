// Everything that needs Supabase, loaded only when someone plays with friends, so games
// against the computer start fast and work offline.
export { callGame } from './api.ts';
export { createRemoteGame } from './remoteGame.ts';

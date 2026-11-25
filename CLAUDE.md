# Tenfold

A multiplayer card game for family and friends. Each player uses their own phone. Installable web app (PWA), free to host and share. Gameplay follows the classic 10-phase rummy-style rules exactly, with an original name and original art.

## Hard rules for Claude Code

1. Engine first. No UI code until `packages/engine` has passing tests for deck, phase validation, hitting, going out, and scoring.
2. The engine is pure TypeScript with zero runtime dependencies. No DOM, no Node-only APIs, no Supabase imports. It must run in the browser, in Deno (Supabase Edge Functions), and in Node (tests).
3. The server is the referee. Clients send move intents. The Edge Function validates with the shared engine and writes state. Clients never write game state directly.
4. Never send a player another player's hand. Hands live in a table protected by row-level security.
5. Do not use the Mattel name or art anywhere (repo, UI, icons, copy). Use "levels" or "rungs" in UI copy instead of "phases". This is a single constants file so it is easy to change.
6. Never use em dashes in any copy, docs, or comments.
7. Run typecheck, lint, and tests before saying a task is done. Fix failures yourself.
8. Never commit secrets. The Supabase service role key, JWT secret and DB password live only on the self-hosted server. Only the project URL and anon key may appear in the web build, and RLS is what protects the data. The repo is public, so assume everything in it is readable.

## Stack

- Hosting: GitHub Pages (web, public repo), self-hosted Supabase at `https://sam-server.tail17ca0b.ts.net:10000` (backend)
- CI deploys only the web app. After a push to main that touches migrations, the `game` function, `packages/engine` or `packages/server`, the owner runs `bash /home/sam/dockers/supabase/deploy-tenfold.sh` on the server. Remind them when a change needs it.
- The server's gateway only allows: anonymous sign-up, token refresh, user, logout, JWKS; read-only REST on `room_states`, `hands` and `room_messages`; the `game` function; the realtime websocket. Anything new the app calls must be added there first.
- Vite `base` must match the repo name exactly, including case (`/Tenfold/`) or assets and the PWA manifest break. The manifest `start_url` and `scope` must use the same base.
- Pages needs Settings, Pages, Source set to "GitHub Actions" (a one-time manual step for the owner).
- Portrait only. Android uses the manifest orientation. iOS shows a "rotate your phone" overlay in landscape.
- iOS audio needs a user gesture, so unlock audio on the Join/Create button tap.
- Haptics via `navigator.vibrate` as a bonus (not supported on iOS).

## Game rules

The full rules, the rules config and the bot levels live in `packages/engine/CLAUDE.md`. Implement them exactly.

## Multiplayer design

- Players: 2 to 6 per room.
- Join via a short room code plus a player-chosen display name. No accounts.
- Player token stored in localStorage so a refresh or phone lock rejoins the same seat.
- Everyone sees each player's current level next to their name (the simple leaderboard).
- Turn timer: 30 seconds by default (the host can pick 15, 30, 60, 90 or none). Any player can pause a timed game and anyone can resume it; the screen shows who paused. On timeout the server auto-plays (draw from deck, discard the highest-point card that is not a Wild; a Wild only if nothing else is left). After 2 missed turns in a row a bot takes the seat. The human can reclaim the seat when they return.
- Realtime via Supabase Realtime subscriptions on the room and public game state. Private hand state fetched under RLS.
- Chat, quick emoji reactions and thrown eggs and pies go through the same Edge Function into `room_messages` (members read under RLS, rate limited in the database). They never touch the room version, so they cannot race with moves.
- Each player's score shows quietly on their chip. Confetti falls when someone wins the game.

## Conventions

- TypeScript strict mode. No `any`.
- Small functions, named exports, tests next to the code they cover.
- Engine tests include property-style checks (for example, any legal run with wilds validates, and a deck always has exactly 108 cards).
- Commit after each passing milestone with a clear message.
- Keep a short `docs/decisions.md` log of architecture choices.

## Out of scope for now

Accounts, custom card art, native apps. The engine is portable so a native wrapper is possible later.
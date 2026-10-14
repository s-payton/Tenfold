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
8. Never commit secrets. The Supabase service role key, access token, and DB password live only in GitHub Actions secrets or the Supabase dashboard. Only the project URL and anon key may appear in the web build, and RLS is what protects the data. The repo is public, so assume everything in it is readable.

## Stack

- Monorepo with npm workspaces
  - `packages/engine`: rules, deck, validation, scoring, bots (pure TS, Vitest)
  - `apps/web`: Vite + React + TypeScript, `vite-plugin-pwa`, Framer Motion (card animation), Howler (sound)
  - `supabase/`: migrations, RLS policies, Edge Functions (Deno) importing the engine package
- Hosting: GitHub Pages (web, public repo), Supabase free tier (backend)
- CI/CD: GitHub Actions in `.github/workflows/ci-deploy.yml`
  - On every push and pull request: `npm ci`, typecheck, lint, test. A failure blocks deploy.
  - On push to main: build `apps/web` and deploy to GitHub Pages (`upload-pages-artifact` and `deploy-pages`).
  - Also on main, once Supabase exists: use the Supabase CLI to push migrations and deploy Edge Functions so server and client run the same engine version.
- Vite `base` must match the repo name exactly, including case (`/Tenfold/`) or assets and the PWA manifest break. The manifest `start_url` and `scope` must use the same base.
- Pages needs Settings, Pages, Source set to "GitHub Actions" (a one-time manual step for the owner).
- Portrait only. Android uses the manifest orientation. iOS shows a "rotate your phone" overlay in landscape.
- iOS audio needs a user gesture, so unlock audio on the Join/Create button tap.
- Haptics via `navigator.vibrate` as a bonus (not supported on iOS).

## Game rules (standard, implement exactly)

Deck: 108 cards. 4 colors x numbers 1 to 12 x 2 copies = 96, plus 8 Wilds and 4 Skips.

Levels (in order):
1. 2 sets of 3
2. 1 set of 3 + 1 run of 4
3. 1 set of 4 + 1 run of 4
4. 1 run of 7
5. 1 run of 8
6. 1 run of 9
7. 2 sets of 4
8. 7 cards of one color
9. 1 set of 5 + 1 set of 2
10. 1 set of 5 + 1 set of 3

Play:
- Deal 10 cards each. Flip one to start the discard pile (if a Skip, handle per official rules).
- Turn: draw from the deck or take the top discard (not a Skip), optionally lay down your level if you have it, optionally hit, then discard one card.
- Wilds substitute for any number or color. Sets and runs must contain at least one natural card. Runs do not wrap (12 to 1).
- Skips cannot be used in a level. Discarding a Skip makes a chosen player lose their next turn. No stacking: a player with a skip already pending cannot be chosen again until they lose that turn. With 2 players, the discarder plays again right away.
- If the draw pile runs out, shuffle the discard pile (except its top card) into a new draw pile.
- You may only lay down your level once per hand, all at once. After laying down, you may hit on any laid-down group (yours or others') with legal cards.
- A hand ends when a player goes out (no cards left). Others score the cards in their hand.
- Scoring: 1 to 9 = 5 points, 10 to 12 = 10 points, Skip = 15, Wild = 25.
- Players who did not complete their level repeat it next hand. Players who did advance.
- House rule: whoever went out plays first in the next hand (`nextHandLeader: 'hand-winner'`).
- Game ends when a player on level 10 goes out (lays level 10 and empties their hand). That player wins. Laying level 10 without going out does not win; that player repeats level 10 next hand. Points never decide the winner (house rule, see `docs/rules-notes.md`).

Verify edge cases against the official rule sheet when writing tests, and list any ambiguity found in `docs/rules-notes.md`.

## Rules config (house rules later)

All variable behavior lives in a `RulesConfig` object with defaults set to standard rules. Planned toggles: hitting on other players' groups, whether a skipped player loses a turn, Wild discard allowed, custom level lists. Build the config in from day one even if only defaults are used.

## Multiplayer design

- Players: 2 to 6 per room.
- Join via a short room code plus a player-chosen display name. No accounts.
- Player token stored in localStorage so a refresh or phone lock rejoins the same seat.
- Everyone sees each player's current level next to their name (the simple leaderboard).
- Turn timer: 30 seconds by default (the host can pick 15, 30, 60, 90 or none). Any player can pause a timed game and anyone can resume it; the screen shows who paused. On timeout the server auto-plays (draw from deck, discard the highest-point card that is not a Wild; a Wild only if nothing else is left). After 2 missed turns in a row a bot takes the seat. The human can reclaim the seat when they return.
- Realtime via Supabase Realtime subscriptions on the room and public game state. Private hand state fetched under RLS.
- Chat, quick emoji reactions and thrown eggs and pies go through the same Edge Function into `room_messages` (members read under RLS, rate limited in the database). They never touch the room version, so they cannot race with moves.
- Each player's score shows quietly on their chip. Confetti falls when someone wins the game.

## Bots

Pure functions `(publicState, hand, config) => Move` in the engine package. Three skill levels:
- Easy: draws randomly, discards randomly, lays down as soon as legal.
- Medium: prefers discards that help, keeps near-complete groups, avoids discarding wilds.
- Hard: tracks the discard pile and opponents' picks, aims for the level efficiently, hits aggressively, minimizes held points.

Bots come after the engine, UI, and multiplayer are working.

## Build order

1. Engine and unit tests (deck, validation with wilds, hitting, going out, scoring, config)
2. UI against a local fake game (table, hand, deal and draw animations, sound)
3. Supabase schema, RLS, room codes, move Edge Function, realtime
4. Lobby, level indicators, rejoin, timeouts
5. Bots (3 levels)
6. PWA polish: icon, install prompt, offline shell, rotate overlay

## Conventions

- TypeScript strict mode. No `any`.
- Small functions, named exports, tests next to the code they cover.
- Engine tests include property-style checks (for example, any legal run with wilds validates, and a deck always has exactly 108 cards).
- Commit after each passing milestone with a clear message.
- Keep a short `docs/decisions.md` log of architecture choices.

## Out of scope for now

Accounts, custom card art, native apps. The engine is portable so a native wrapper is possible later.
# Decisions

Short log of architecture choices. Newest at the bottom.

## 2026-10-13: Engine scaffold

- **npm workspaces**, one package so far: `packages/engine` (`@tenfold/engine`).
- **Engine ships as TypeScript source.** `exports` points at `src/index.ts` and imports use explicit `.ts` extensions (`allowImportingTsExtensions`). Vite, Vitest and Deno all load this directly, so the Edge Function can import the exact same files with no build step.
- **No DOM or Node types in the engine.** Its tsconfig sets `lib: ["ES2022"]` and `types: []`, so using a browser or Node API is a type error.
- **Strict TypeScript** plus `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`. ESLint uses `typescript-eslint` strict type-checked rules and bans string literals containing an em dash.
- **Seeded RNG.** `createRng(seed)` (mulberry32) so a server-side shuffle can be reproduced and tests are deterministic. `shuffle` never mutates its input.
- **Card ids are stable** (`red-7-0`, `wild-3`, `skip-1`) so moves can reference cards by id.
- **Runs are ordered.** A run is validated in the order given, which fixes each Wild's value (see rules notes 3 and 4). `arrangeRun` turns loose cards into legal orderings.
- **Level groups match requirements by position**: `groups[i]` must satisfy `requirements[i]`. The UI will show one slot per requirement.
- **Validation returns typed results** (`{ ok: true, group }` or `{ ok: false, error }`) with string error codes, not exceptions, so the server can send a reason back to the client.
- **RulesConfig from day one** with standard defaults, including the level list, so house rules are a data change.
- **fast-check** (dev only) for property tests. The engine has zero runtime dependencies.

## 2026-10-13: Hitting, scoring, CI

- **`hit(group, card, config, position?)`** adds one card and returns a new group. It checks only whether the card fits. Who may hit (own level down, own turn, `allowHitOnOthers`) belongs to the turn logic.
- **Wilds on runs need a chosen end** when both ends are open (`needs-position`). A natural card's end is implied by its value.
- **Scoring constants** live in `scoring.ts`. They are not in `RulesConfig` because no planned house rule changes them.
- **CI** runs typecheck, lint and tests on every push and pull request (Node 24). Deploy jobs come later.

## 2026-10-13: Game state machine

- **`GameState` is plain, serializable data** (arrays and strings, top of each pile is the last element), so the server can store it as JSON.
- **`applyMove(state, playerId, move, config)` is the referee.** It returns `{ ok: true, state }` or `{ ok: false, error }` and never mutates its input. The Edge Function will call exactly this.
- **Moves reference cards and groups by id.** A lay-down sends one id list per level requirement, with run ids in position order. Group ids are `<playerId>-<index>`, which is unique because a player lays down once per hand.
- **The shuffle seed lives in the state** and is advanced after every shuffle (deal and reshuffle), so a game is fully reproducible from its starting seed. The seed predicts the draw pile, so it must stay server-side.
- **`publicView(state, viewerId)`** is the only shape that leaves the server. It holds the viewer's hand, hand sizes for everyone else, pile sizes, the top discard and the table. A property test checks that no hidden card id ever appears in it.
- **Setup mistakes throw** (`createGame` with a bad player list), because they are programmer errors. Illegal moves return error codes, because they are player input.
- **Hand flow:** `createGame` deals hand 1. When a hand ends, the status becomes `hand-over` (or `game-over`), and the server calls `startNextHand` to rotate the dealer and deal again.
- **Not in the engine yet:** the turn timer and auto-play on timeout. They depend on server time, so they come with the multiplayer work, as a pure `autoPlay(state)` helper.

## 2026-10-13: Web app against a local game

- **`GameClient` interface** (`apps/web/src/game/client.ts`) is all the UI talks to: `getView`, `subscribe`, `send(move)`, `nextHand`. The local fake game implements it now, and the Supabase client will implement it next. Screens only ever see a `PublicView`, never `GameState`.
- **Local opponents use `autoMove`** (the turn-timeout play: draw from the deck, discard the highest card). They never lay down. Real bots come in build step 5.
- **Shared engine on the client** gives instant feedback (lay-down builder checks, which groups light up for a hit). The engine still makes the final call, the same way the server will.
- **Card animation** uses Framer Motion `layoutId` keyed by card id, so a card glides from hand to table or discard pile on its own.
- **Sounds are synthesized** at runtime into WAV data URIs played through Howler, so there are no audio files to license. Audio unlocks on the "Deal me in" tap for iOS.
- **All UI wording lives in `apps/web/src/copy.ts`**, which says "level" everywhere.
- **`?seed=<n>`** in the URL replays the same local deal, for testing and bug reports.
- **Deploy:** pushes to `main` build `apps/web` and publish it to GitHub Pages under `/Tenfold/` (case-sensitive, matches the repo name). The PWA manifest and icons come in build step 6.

## 2026-10-13: Level finder and simple opponents

- **`findLevel(hand, level, config)`** searches for a lay-down using the minimum cards per group, trying more natural cards first so Wilds stay free for later groups. **`findHits`** lists every legal single-card hit. Both are the base for the tiered bots.
- **Bot and timeout moves take a `PublicView`**, never `GameState`, matching the `(publicState, hand, config) => Move` rule. A bot cannot see other hands or the deck order even by accident.
- **`basicMove`** drives the local opponents for now: take a Wild from the discard pile, lay down as soon as possible, hit whenever possible, discard the highest card that is not a Wild. This pulls part of build step 5 forward because the owner is playtesting.
- **A Skip on top of the discard pile stays tappable** so the player gets told why it cannot be taken, instead of a silent no-op.

## 2026-10-13: Multiplayer backend

- **Anonymous Supabase auth is the player token.** Each device gets an anonymous user, with the session kept in localStorage by supabase-js, so a refresh or locked phone rejoins the same seat. No accounts or emails. Requires "Allow anonymous sign-ins" in the dashboard.
- **`packages/server`** holds the referee logic (create, join, start, move, next hand) as pure TypeScript behind a small `Store` interface. It is unit tested in Node against an in-memory store. The Edge Function (`supabase/functions/game`) is only a thin adapter: verify the caller, parse the body, call `handle`, map the Store to SQL.
- **The Edge Function runs the same source as the web app.** `scripts/sync-functions.mjs` copies `packages/engine/src` and `packages/server/src` into `supabase/functions/_shared` (gitignored), and a per-function `deno.json` import map resolves `@tenfold/engine` and `@tenfold/server` to those copies. `npm run functions:check` syncs and runs `deno check`.
- **Tables:** `rooms` (with the secret full `GameState`) and `room_players` have RLS on and no policies, so only the server can touch them. `room_states` holds the public `RoomData` (lobby info plus `tableView`) and is readable by members of that room through a `security definer` membership check. `hands` is readable only by the row's own user. Clients have no write policies anywhere.
- **Writes are atomic and versioned.** `commit_room` updates the room only if its version still matches, then rewrites hands, then the public row, in one transaction. The handler retries from a fresh copy on a conflict, so two quick taps cannot both apply.
- **Clients read, Realtime nudges.** Clients subscribe to `room_states` changes and then re-read the public row and their own hand, retrying until both carry the same version, so the table and hand never disagree.
- **Untrusted input:** request bodies are parsed into well-formed actions (`parseAction`) before the engine judges legality. Names are trimmed and capped at 16 characters. Room codes are 4 consonants.
- **Deploy:** on push to main, CI syncs the shared code, runs `supabase db push`, and deploys the function. It skips itself until `SUPABASE_ACCESS_TOKEN` and `SUPABASE_DB_PASSWORD` are set as GitHub Actions secrets.

## 2026-10-13: Faster online moves

Measured before: about 500 to 600 ms per move at the function, plus a follow-up re-read and the Realtime delay.

- **Replies carry a snapshot** (version, room data, the caller's own hand), so the mover's screen updates from the reply with no re-read.
- **Realtime messages are applied directly.** A player's hand only changes on their own moves or a new deal, so within a hand the new public row from the message plus the known hand is a complete, consistent snapshot. A new hand or anything unexpected falls back to a full re-read.
- **`getClaims` instead of `getUser`** in the function: the session token is verified locally against cached signing keys, with no auth server call per move.
- **One query to load a room** (seats embedded through the foreign key) instead of two.
- **Function pinned to us-east-1**, the database's region, via the client's `region` option.
- **Moves show instantly when they can.** `predictView` (engine) rebuilds a stand-in game state from the mover's own view, with hidden placeholder cards for everything they cannot see, and runs the real `applyMove` on it. Lay-down, hit and discard are predicted; draws (secret card) and hand-ending moves (scoring needs other hands) wait for the server. A property test checks the prediction equals the server's published view over thousands of random moves. The server reply replaces the prediction, and a refusal rolls it back.
- **Moves are sent one at a time, in order**, so a quick lay-down then hit cannot arrive reversed.
- **A reply wins over a Realtime echo at the same version.** While a move is in flight, Realtime messages are ignored, because the echo of our own move would pair the new public data with the old hand.
- **Measured after:** discard and other predicted moves show in about 30 ms. A draw shows in about 0.5 s (the server round trip: function start, token check, one load and one save). Moving the function's database access to a direct Postgres connection could save roughly another 0.1 s if needed.

## 2026-10-13: Easier play on phones

- **Felt table theme** from CSS variables (`--table-bg` and friends). Host-chosen backgrounds later only need another set of these values behind a `data-table` attribute.
- **One card selected at a time** outside of laying down, so Discard and hits always know which card. Laying down uses its own boxes instead of a multi-select.
- **Lay down is offered only when it will work.** `findLevel` checks the hand on every play step; the glowing Lay down button opens side-by-side boxes already filled with the best fit (fewest wilds, then most points). Players can tap a box and then hand cards to change it, or tap a card in a box to take it out.
- **Plain words everywhere:** "2 sets of 3", "Set of 3, run of 4", with each box explaining what it needs ("3 cards with the same number"), and a short glossary on the home screen.
- **Skips are announced** with an animated no-entry sign. The engine records `lastSkipped` and a game-wide `turn` counter on every turn change, so every screen can tell exactly when someone lost a turn, including the 2-player case where the skip is set and used up in the same move.

## 2026-10-14: Bots, turn timer, seat control

- **Three bot levels** in the engine (`botMove`), all working from the bot's own `PublicView`. Shared measure: `handProgress`, the share of the level a hand could fill now. Over 200 two-player hands: Medium beat Easy 166 to 34, Hard beat Easy 170 to 30, Hard beat Medium 123 to 77. Hard does not remember past discards, because bots are pure functions of the current view; it reads the table instead (who has laid down, what fits their groups).
- **Turn clock without a server process.** Each save sets `turnDeadline` in the public room data: 30 s for a person (reset on any of their moves, so building a lay-down never gets cut off), 1.2 s for a computer seat. Every phone in the room schedules a `timeout` request for just after the deadline, with a random spread. The server checks the deadline against its own clock and refuses early requests, so duplicates and clock skew are harmless. If nobody is looking at the room, nothing needs to happen.
- **Missed turns:** the server auto-plays (draw, discard the highest non-Wild) and counts the miss. After 2 in a row, a Medium bot plays the seat. Any move by the person, or the "I'm back" button (`reclaim`), clears it. Leaving mid-game hands the seat to a bot at once.
- **Computer players in rooms:** the host can add Easy, Medium or Hard seats in the lobby. They have no member row, so no `hands` row is ever written for them. The host can remove seats, and anyone can leave the lobby; the host role passes to the next person, and a room with no people left closes.
- **Old rooms are deleted nightly** after 3 days without changes (pg_cron).

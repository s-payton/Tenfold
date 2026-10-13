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

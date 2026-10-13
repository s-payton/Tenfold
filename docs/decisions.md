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

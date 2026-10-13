# Tenfold

A multiplayer rummy-style card game for family and friends, played on your own phone.

## Development

```sh
npm install
npm run check            # typecheck, lint, test
npm run dev              # web app at http://localhost:5173/Tenfold/
npm run functions:check  # sync shared code into the Edge Function and run deno check
```

- `packages/engine`: rules, deck, validation, scoring and bots (pure TypeScript, no dependencies)
- `packages/server`: the referee (rooms, seats, turn clock) behind a small storage interface
- `apps/web`: the phone app (Vite, React, PWA)
- `supabase/`: database migrations and the `game` Edge Function
- `docs/rules-notes.md`: rule edge cases and open questions
- `docs/decisions.md`: architecture log

Pushes to `main` deploy the web app to GitHub Pages and the backend to Supabase.

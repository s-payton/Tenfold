# Tenfold

A rummy-style card game for family and friends. Everyone plays on their own phone, around the same table or from different houses.

**Play it:** [s-payton.github.io/Tenfold](https://s-payton.github.io/Tenfold/)

There's nothing to download. Open the link, and if you like it, add it to your home screen and it works like an app (even offline, against the computer).

## How it plays

You work your way up ten levels, one hand at a time. Each level asks for a different combination of cards: two sets of three, a run of seven, seven cards of one color, and so on. Lay down your level, get rid of the rest of your hand, and you move up. The first player to finish level 10 wins.

Wilds stand in for any card. Skips make someone miss a turn. You can add cards to groups already on the table once you've laid down your own.

## Playing with friends

1. One person taps **Play with friends**, then **Create a room**, and shares the four-letter code (or the invite link).
2. Everyone else enters the code and a name. No accounts.
3. The host picks the house rules, the table, and the turn clock (15, 30, 60 or 90 seconds, or none), then starts the game.

If your phone locks or you refresh, you'll land back in your seat. If you step away for two turns, a computer player keeps your seat warm until you tap "I'm back."

During a game you can chat, send a quick emoji, or tap someone's name to throw an egg or a pie at them. Anyone can pause a timed game, and everyone sees who did it.

Playing alone? **Play vs computer** has three difficulty levels.

## For developers

The rules engine is plain TypeScript with no dependencies. The phone app and the server both run the same engine, and the server is the only one allowed to change a game. Your phone sends "I'd like to discard this card," the server checks it and saves the result, and nobody's hand is ever sent to anyone else.

```sh
npm install
npm run check            # typecheck, lint and test
npm run dev              # http://localhost:5173/Tenfold/
npm run functions:check  # copy shared code into the Edge Function and run deno check
```

| Folder | What's in it |
| --- | --- |
| `packages/engine` | Rules, deck, level checks, scoring and the computer players |
| `packages/server` | The referee: rooms, seats, the turn clock, chat |
| `apps/web` | The phone app (Vite, React, installable PWA) |
| `supabase/` | Database migrations and the `game` Edge Function |
| `docs/` | Rule edge cases (`rules-notes.md`) and the design log (`decisions.md`) |

Every push to `main` runs the checks, then deploys the web app to GitHub Pages and the database and function to Supabase, so the two always match.

## A note on the name

Tenfold is an original game name with original art. It isn't affiliated with any commercial card game.

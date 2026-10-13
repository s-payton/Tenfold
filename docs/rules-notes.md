# Rules notes

Checked against the English rule sheet that ships with the standard 10-level rummy card game (2009 printing, text retrieved from a third-party PDF mirror because no first-party copy was found online), plus a second rules summary for points the sheet leaves open. Quotes below are short excerpts, with the trademarked game name replaced by [level]. Source links are left out of the repo on purpose because they contain that name (CLAUDE.md rule 5).

Status key: **Done** = implemented and tested. **Later** = decided, not built yet. **Open** = needs an owner decision.

## Confirmed by the sheet

- Deck is 108 cards: 4 colors x 1 to 12 x 2, 8 Wilds, 4 Skips. **Done**
- The 10 levels match CLAUDE.md exactly. **Done**
- Two sets in one level may be the same number ("three 10s and three more 10s"). **Done**
- Color group cards "do not need to be in numerical order", and duplicates are fine. **Done**
- Skips can never be part of any level, including the color level. **Done**
- A run longer than required counts ("lays down a run of 9 cards. This qualifies as 1 run of 7"). **Done**
- Skips can never be taken from the discard pile. **Later**
- A drawn Skip may be held or discarded later. **Later**
- Hitting needs your own level laid down first, only on your turn, on your own groups or others'. Hitting is allowed in the same turn you lay down (sheet example). **Later**
- Going out means getting rid of every card "by discarding or hitting", so hitting your last card goes out with no discard. **Later**
- A player who completes their level advances even if someone else goes out first. **Later**

## Ambiguities and how the engine handles them

1. **One natural card per group or per level?** The sheet says players can use any number of Wilds "as long as they use one (1) natural card", in the paragraph about completing a level. It does not say per group. CLAUDE.md says per group, and the second source says "Wild, Wild, Wild cannot form a valid [level] by itself". Engine: per group, behind `RulesConfig.requireNaturalCard` (default `true`). **Done**
2. **Extra cards when laying down.** "You may lay down more than the minimum requirements ... but only if the additional cards can be directly added", and extra groups are not allowed ("requires exactly 2 sets"). Engine: group sizes are minimums, group count is exact. This matches laying down the minimum and hitting right away. **Done**
3. **Wild value in a run is fixed.** "It cannot be replaced by the intended card ... but must remain as that card until the hand is over." Engine: runs are validated in position order and store `start` and `end`, so each Wild has a fixed value for hitting later. **Done**
4. **Wild placement is ambiguous** for groups like 3, 4, 5, Wild (2 to 5 or 3 to 6). The sheet does not say who picks. Engine: the player chooses by ordering the cards. `arrangeRun` lists every legal ordering so the UI can offer a choice or auto-pick. **Done**
5. **Run bounds.** The sheet never says runs cannot wrap, but numbers only go 1 to 12. Engine: no wrap, and a Wild cannot stand for 0 or 13. **Done**
6. **Color of a Wild in the color level.** A Wild takes the group's color. Physical Wilds are colored on the printed deck but the sheet says a Wild "may be used as any color", so our Wilds have no color. **Done**
7. **First discard is a Skip.** The sheet: "the first player's first turn is automatically skipped." **Later**
8. **First discard is a Wild.** The sheet: it "may be picked up by the first player". It never forbids taking a Wild from the discard pile at other times either, so Wilds are always takeable. **Later**
9. **Who a Skip targets.** The sheet says the discarder chooses. It also says "Only one Skip card against each player per round may be used", where "a round is once around the table". The second source words it as "A skipped player must receive a normal turn before that player can be skipped again". Proposal: a player who already has a pending skip cannot be chosen again until that skip is used up. **Open**
10. **Skips with 2 players.** Not covered. Skipping the only opponent means the discarder takes the next turn. Proposal: allow it, as above. **Open**
11. **Draw pile runs out.** Not covered. Proposal: shuffle the discard pile except its top card into a new draw pile. **Open**
12. **Who wins the game.** CLAUDE.md says "Lowest total score wins", but the sheet says "The first player to complete [level] 10 at the end of a hand is the winner", and score only breaks ties among players who completed level 10 in that hand. A player still on level 6 with a lower score does not win. Engine plan: follow the sheet. **Open** (please confirm, since it differs from a plain reading of CLAUDE.md)
13. **Full tie.** If players who finished level 10 in the same hand also tie on points, "the players that tied replay [level] number 10. The first one to go out is the winner." Needs a tiebreak hand mode. **Later**
14. **Discarding Wilds.** The sheet allows discarding "any one of your cards". Default `allowWildDiscard: true`. **Done** (config only)
15. **Dealer and first player.** First player is left of the dealer, and the deal rotates left each hand. **Later**

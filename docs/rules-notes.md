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
- Skips can never be taken from the discard pile. **Done**
- A drawn Skip may be held or discarded later. **Done**
- Hitting needs your own level laid down first, only on your turn, on your own groups or others'. Hitting is allowed in the same turn you lay down (sheet example). **Done**
- Going out means getting rid of every card "by discarding or hitting", so hitting your last card goes out with no discard. Laying down every card also goes out. **Done**
- A player who completes their level advances even if someone else goes out first. **Done**

## Ambiguities and how the engine handles them

1. **One natural card per group or per level?** The sheet says players can use any number of Wilds "as long as they use one (1) natural card", in the paragraph about completing a level. It does not say per group. CLAUDE.md says per group, and the second source says "Wild, Wild, Wild cannot form a valid [level] by itself". Engine: per group, behind `RulesConfig.requireNaturalCard` (default `true`). **Done**
2. **Extra cards when laying down.** "You may lay down more than the minimum requirements ... but only if the additional cards can be directly added", and extra groups are not allowed ("requires exactly 2 sets"). Engine: group sizes are minimums, group count is exact. This matches laying down the minimum and hitting right away. **Done**
3. **Wild value in a run is fixed.** "It cannot be replaced by the intended card ... but must remain as that card until the hand is over." Engine: runs are validated in position order and store `start` and `end`, so each Wild has a fixed value. A natural cannot be hit onto a run in place of a Wild. **Done**
4. **Wild placement is ambiguous** for groups like 3, 4, 5, Wild (2 to 5 or 3 to 6). The sheet does not say who picks. Engine: the player chooses by ordering the cards. `arrangeRun` lists every legal ordering so the UI can offer a choice or auto-pick. **Done**
5. **Run bounds.** The sheet never says runs cannot wrap, but numbers only go 1 to 12. Engine: no wrap, and a Wild cannot stand for 0 or 13. **Done**
6. **Color of a Wild in the color level.** A Wild takes the group's color. Physical Wilds are colored on the printed deck but the sheet says a Wild "may be used as any color", so our Wilds have no color. **Done**
7. **First discard is a Skip.** The sheet: "the first player's first turn is automatically skipped." **Done**
8. **First discard is a Wild.** The sheet: it "may be picked up by the first player". It never forbids taking a Wild from the discard pile at other times either, so Wilds are always takeable. **Done**
9. **Who a Skip targets.** The sheet says the discarder chooses. It also says "Only one Skip card against each player per round may be used", where "a round is once around the table". Decision: no stacking. A player who already has a skip waiting cannot be chosen again until they have lost that turn. **Done**
10. **Skips with 2 players.** Not covered. Decision: allowed. Skipping the only opponent means the discarder plays again right away. **Done**
11. **Draw pile runs out.** Not covered. Decision: shuffle the discard pile, except its top card, into a new draw pile. **Done**
12. **Who wins the game.** House rule, chosen by the owner, which differs from the sheet. The sheet says the first player to complete level 10 wins, with lowest total score breaking ties between players who complete it in the same hand. Decision: the winner is the first player who goes out while on level 10. Since you cannot go out without laying down your level, this means laying level 10 and emptying your hand in the same hand. If you lay level 10 but someone else goes out first, you have not won and you repeat level 10 next hand, like any other level. Only one player can go out per hand, so ties cannot happen and points never decide the winner. They only show as a running score. **Done**
13. **Full tie.** Not possible under the house rule in note 12, so no tiebreak hand is needed. **Done** (by decision)
14. **Discarding Wilds.** The sheet allows discarding "any one of your cards". Default `allowWildDiscard: true`. **Done** (config only)
15. **Dealer and first player.** First player is left of the dealer, and the deal rotates left each hand. **Done**
16. **Level 10 definition.** A second rule sheet (a fan-made printable, kept locally and not in the repo) lists level 10 as 1 set of 4 + 1 set of 3. The 2009 printed sheet and CLAUDE.md say 1 set of 5 + 1 set of 3. Decision: set of 5 + set of 3. **Done**
17. **Going out on a Skip.** The sheet allows going out by discarding, and a Skip is a legal discard. Engine: allowed, and no target is needed because the hand is over. **Done**
18. **Pending skips at the end of a hand.** Not covered. Engine: they are cleared when the next hand is dealt. **Done**
19. **No one can be skipped.** If every other player already has a skip pending, a Skip can still be discarded, with no effect. **Done**
20. **Draw pile runs dry with one discard left.** Not covered, and very rare (it needs most of the deck laid down on the table). Decision: reshuffle whenever needed. If the discard pile holds only one card, even a Skip, that card becomes the draw pile. A player is never stuck, because at the start of any turn the discard pile has at least one card. **Done**

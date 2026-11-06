# Know the role

```json
{ "slug": "know-the-role", "title": "Know the role", "tagline": "Pick the asks, see the real shares", "cover": "img/games/know-the-role.png", "status": "live" }
```

Route: `#/play/know-the-role` (`?role=<id>` opens on a role; `&skills=<id,id>` puts those asks on the first board, the
fit page's "Practise your gaps"). Code: `web/games/know-the-role.js`. Built in v12 (2026-10-20) from the owner's
decisions in PLAN.md, "The games, second pass": it merges Higher or lower (over-or-under calls), What does it ask for
(the board of real asks and decoys) and Build the hire (the pick-five board), the three games that taught the same
fact through three mechanics. Their design packages stay in `games/` as history.

## The idea

One fact: the share of a role's postings that ask for a skill. One picture: the role's own ranked list, the same list
the role screen shows. Every round ends on that list with the player's calls painted on it, so what the player builds
in the game is what they will see again on the atlas.

## A game, step by step

A game is three rounds on one role (the default role: the role the player came from, else the profile's first field's
largest role, else Product Manager; "Change role" is the shared picker).

1. **A board.** Twelve skills, "Pick the five that most Product Manager postings ask for". Five are real asks; the
   seven others are decoys. Click to pick (arrows move, Space picks), Enter hands in. The reveal: the twelve placed
   on the role's ranked list, ✓ on the right picks, amber on a real ask left, the decoys picked struck through, one
   line on the miss that matters most ("Learning programmes: 6% of Management Consultant postings ask for it; 73% of
   Org Development Manager postings do"). The measure: "3 of 5 real asks".
2. **Eight calls.** The anchor is the role's top ask ("Roadmapping: 74% of PM postings ask for it. Half of them:
   50%."). For eight skills in turn: "Do more or fewer than half of Product Manager postings ask for it?" 1 says
   more, 2 says fewer. The reveal: the eight and the anchor on the ranked list, ✓ right, amber "you said more than
   half". The measure: "6 of 8 right". After the first board, "Try the same skill across fields" swaps this round for
   the **field hop**: the role's top ask, and eight roles of other fields, "Do more or fewer than half of Treasury
   Manager postings ask for it?"; the reveal ranks the roles by their share.
3. **A second board** with asks not yet dealt and decoys from nearer roles.

The end screen leads with the record ("You know 9 of the 15 things Product Manager postings ask for · up from 6"),
then the three rounds' measures, one takeaway (what is still to meet or get right), the role's full list of asks with
✓ on the ones got right, one link (open the role), "Practise the rest" (a game whose first board holds the missing
asks) and "Change role".

## The ramp (G5)

Round one is winnable: the first board's decoys are the clearly-other-world kind, and the first calls are at least 20
points from half. The second round's calls are at least 12 points from half ("Closer calls from here"); the second
board draws decoys from nearby roles ("Decoys from nearby roles from here"). No round ends on a mistake.

## Untimed; the Speed round

Untimed by default. A Speed round unlocks after a game with at least half the calls and picks right: a 45-second clock
on each board (it hands in as it is at zero) and 6 seconds a call (a call left unanswered is a miss). The clock alone:
no lives, no multiplier.

## Scoring and the record

No points, no rank titles. The measure is the count in plain words per round and over the game ("13 of 21 right"),
and the Know-your-role record is the line that matters: every real ask dealt is *met*; a real ask picked and a skill
called right is *known*. The role screen's card, About you and every end screen read the same record
(`GameShell.record`, `web/gameshell.js`). The game keeps its best per role (`games["know-the-role"].best[roleId] =
{ total, of }`), `clean` (the Speed round unlocked) and `speed` (the round chosen last).

## Data

`logic.pools(ix, P, generic)` builds every role's pools from the index the way What does it ask for did
(`games/what-it-asks/pools.js`):

- a **real ask**: at least 40% of the role's postings name it (`RULE.ask`; the same cut as the record's "asks");
- a **decoy**: at most 10% of the role's postings name it (15% when fewer than 14 decoys qualify), and some other
  openable role prizes it: at least 40% of its postings, twice the average role. A decoy's `diff` is 0 (another world),
  1 (asked fairly widely: lift under 5) or 2 (a role in the same field prizes it); the board's stage picks the tier;
- the **tech roles** (with `CONFIG.TECH_ENABLED` on, 2026-11-06): the same rules over the tech index's skills
  (`ix.T.skills`); a decoy's other role is another tech role, or an MBA role that prizes a skill the two sets share,
  with the tech set's own baseline for the lift (`ix.baselineTech`). The shell offers a tech role only to a game that
  says it deals the set (`defaultRole(..., { tech: true })`, `picker({ tech: true })`); the other games keep to the
  product and MBA roles;
- a **call**: any skill at least 10% of the role's postings name (`CALL_MIN`), the anchor excluded; the calls of a
  round are at least `gap` from half (0.20, 0.12, 0.08 by stage), as many over as under as the pool allows, skills
  not yet dealt first.

A role is playable with three real asks and one decoy or more (`logic.playable`); a role with fewer than five asks
plays a board of all its asks. Small roles play, with a note on the start screen. Product roles read the product set.

## Edge cases

- Fewer than five real asks: the board asks for all of them ("Pick the three…").
- Fewer than seven decoys: the board is shorter than twelve.
- Fewer than eight calls far from half: nearer ones fill in (at least 4 points from half, then anything).
- No role of another field asks for the anchor: the field hop falls back to the eight calls.
- Storage blocked: the game plays the same and remembers nothing.

## Evals and tests

`node evals/game_know_the_role.mjs`: every playable role deals a board of twelve with five real asks and seven decoys
(or all it has), eight calls on both sides of half, and a field hop; the pools' counts; the seeded deals are stable.
`tests/web/know-the-role.test.mjs`: the dealer, the scorers and the takeaway on small inline pools.

# Decisions

Choices worth writing down, mostly where the spec left room or where the
obvious approach turned out to be wrong. The product spec is
[SPEC.md](SPEC.md).

## Stack: Vite + TypeScript, no framework

The spec allows plain JS or React. Neither is needed: the app has six screens
and one shared store, so a ~100-line DOM helper (`src/ui/dom.ts`) covers what a
framework would. TypeScript earns its place because the save file is a
long-lived data structure that gets migrated — `strict` plus
`noUncheckedIndexedAccess` catches the class of bug that would otherwise
silently corrupt someone's streak.

Vite is there for the dev server, the bundle, and bundled webfonts. The build
output is static and opens from the filesystem (`base: './'`, hash routing).

## The streak is stored; the full-clear streak is derived

`streak.current` is the number Brennan sees every day, and the spec puts it in
the save file, so it is stored. The full-clear streak is computed from history
on read instead. Two stored counters that must agree are two counters that can
disagree; deriving the secondary one makes drift impossible.

History also stores `lastActiveDate` alongside `lastCompletedDate`. A day off
has to hold continuity without advancing the streak, which needs two dates, not
one. Saves written before that field existed back-fill it from
`lastCompletedDate`.

## The week is five days long

The reviews are a working-week routine, so the streak counts weekdays. Under
the old calendar-day rule a perfect Monday-to-Friday week still broke on
Saturday, which meant the number could only ever be kept by working weekends —
it was measuring availability, not the habit.

One helper carries the whole rule: `missedWeekdays(from, to)` in
`domain/dates.ts` counts the weekdays *strictly between* two days, so Friday to
Monday is 0 and Friday to Tuesday is 1. Continuity, heat, and the historical
achievement runs all ask that one question, which is why a weekend can't mean
one thing to the streak and another to heat.

Weekend work is deliberately upside-only: it pays Lumen and it goes on the
record, but it moves neither the streak nor heat. Letting it count would make
the weekend optional-but-rewarded, which is exactly the pressure this change
exists to remove. Taking a day off is refused on a weekend for the same reason
— there is no run to hold open, and the day off would be spent on nothing.

Two achievements had a seven-day week baked into them and now name the real
one: `streak-7` ("A Full Week") is five, and `perfect-week` is five. Their ids
are what saves store, so the ids stayed put.

## A third tier below the floor

The spec names two tiers. Scoring has three: skipping a core item is graded
`none`. It still pays out for the work done, and the summary says plainly that
it doesn't count toward the streak. The alternative — silently promoting a
partial run to a floor pass — would make the floor meaningless, and refusing to
log it at all would punish the exact bad day the floor exists for.

## Optional items are set aside, not skipped

Some steps only apply some days — taking lunch to the fridge is nothing to do
on a day worked from home. Before this, skipping one cost its points *and* the
full clear, which turned working from home into a worse review.

An item can now be marked `optional`. Skipping one takes it out of both sides
of the fraction: its points leave `basePoints` (it wasn't done) and they leave
`availablePoints` and `fullClearPoints` too, so the run is graded on the
shorter checklist it actually was. A clear with a step set aside is a full
clear — same tier, same bonus, same streak, same Cinder — and because the city
share is pro-rated against `fullClearPoints`, it pays the same Lumen as a day
when every item applied.

Three consequences worth knowing:

- **Optional and core are opposites, and core wins.** The Floor is the set of
  things that always apply, so an item can't be part of it *and* be excusable.
  `sanitizeItems` drops `optional` from anything core; the editor turns one off
  when the other goes on, rather than letting the sanitiser silently decide.
- **A run with nothing done never grades above `none`.** Without that guard, a
  routine made entirely of optional items would read as a full clear when every
  item was skipped: nothing missed, no core item outstanding, bonus paid for
  doing nothing.
- **The summary shows the day's ceiling, not the checklist's.** `basePoints` is
  displayed against `availablePoints`, so a clear reads as N of N instead of
  leaving a gap that couldn't be closed. Skipped and set-aside items are listed
  in separate blocks, because one is a miss and the other isn't.

The default morning routine ships with the lunch item marked optional — it is
the case that prompted this — but nothing else, since the flag should be the
exception a routine reaches for rather than its normal state.

## Checklist items are save data; the wrapper copy stays in config

The spec keeps the review content in a config file. Editing it from Settings
means the items have to be part of the save (`state.checklists`), because
`localStorage` is the only thing the app can write to. Config keeps the
starting set, which is what a fresh save is seeded from and what
"Reset to defaults" restores.

Only the _items_ moved. The routine names, expedition flavour, and blurbs stay
in `CHECKLIST_META`, so copy improvements ship with the code instead of being
frozen into every existing save. `checklistFor(state, id)` joins the two back
into the `Checklist` the review flow and scoring already took.

Two consequences worth knowing:

- **Ids never change once assigned.** History records which item ids were done,
  so renaming an item keeps its id and its past entries stay meaningful. New
  items get an id slugged from their first label, uniquified against the list.
- **The review flow snapshots the checklist on entry.** Editing mid-review
  would renumber the items under the person working through them.

`saveChecklist` sanitises whatever the editor hands it — trims, drops
unlabelled rows, clamps points, re-ids duplicates — rather than trusting the
UI, and refuses to leave a routine with nothing in it. The same sanitiser runs
in `migrations.ts`, so a hand-edited save file gets the same treatment as the
editor's output.

## Lighting is interpolated in linear-light space

The streak ramp blends a cold pre-dawn into a warm golden hour. Blending those
directly in sRGB desaturates through the middle and the city goes grey around
day 10 — the worst possible place, since that's mid-run. `mixColor` converts to
linear light, blends, and converts back, and there's a hand-picked mauve stop at
the halfway point rather than a straight two-point ramp.

## Everything in the scene is lit by CSS custom properties

Nothing in the SVG holds a literal colour. `city-scene.ts` writes ~20 variables
on a state change and the browser transitions the whole picture at once. It also
means a new building drawn months from now takes part in the lighting for free,
provided it references the variables.

Two SVG traps this ran into, both documented at the call site:

- A CSS animation on an SVG node **overrides its `transform` attribute**. Any
  animated element sits inside a plain positioning `<g>`; otherwise buildings
  land at the scene origin when their arrival animation ends.
- `transform-origin` on SVG resolves against the viewport unless
  `transform-box: fill-box` is set, which is why the windmill blades and the
  lighthouse beam declare it.

## Screens get a `mounted` hook

Screens are constructed, then inserted into the document. Calling `.focus()`
during construction is silently dropped — which is exactly what happened: the
review flow focused its Done button before the screen existed on the page, so
keyboard users could not advance with Enter at all. `Screen.mounted()` runs
after insertion, and `review.test.ts` covers it.

## Passive income is paid once per day, on the first review — *superseded*

Buildings paid on days a review was completed, not on a timer. An idle game
that pays while you avoid the reviews inverts the whole point (spec §13), and
paying per-review would have rewarded doing both routines twice as much as the
streak itself. Replaced by the vault, below, which keeps the same guarantee by
a different route.

## The vault, and why an idle game gets a locked door

Output now accrues continuously into a vault (`domain/vault.ts`) and can only
be taken out inside one of two windows — 08:00–09:00 and 16:00–17:00 local.
Three rules do the load-bearing work, and each is there to answer an objection
to idle games rather than to add a mechanic:

**It fills fastest while you are at work.** 3× between 08:00 and 16:30. The
obvious design — reward checking in often — is exactly the one that turns a
review app into a distraction. Paying most for the hours you are *not* looking
at it means the optimal play and the intended behaviour are the same play.

**It can only be emptied twice a day.** Outside a window the number is visible
and inert. That is the point: opening Aerie at 11am has to be *possible* and
*pointless*, because a door you can rattle is worse than one that is plainly
locked. One timestamp tracks it — a collection landing inside the window now
open is, by definition, that window's collection — so there is no per-window
ledger to keep in sync.

**It stops paying properly if you stop reviewing.** A day with nothing logged
accrues at `VAULT_IDLE_SHARE` (10%). Not zero — a bad day shouldn't cost the
city — but low enough that the idle layer can never substitute for the routine.
This is the old once-per-review guarantee, restated as a rate.

The cap (`VAULT_CAP_DAYS`, one nominal day) is set so that ordinary twice-daily
play never touches it while a whole missed day spills about a third. Missing one
window is free; missing a day is not.

Two traps, both covered by tests in `vault.test.ts`, because both silently
create or destroy currency:

- `accrueVault` returns the *same reference* when a tick isn't worth a whole
  Lumen, so the store short-circuits instead of writing a save every ten
  seconds forever. It therefore leaves `accruedThrough` behind rather than
  advancing it — otherwise a slow city would round to zero on every tick and
  accrue nothing at all.
- Which means a **collection must reset `accruedThrough` itself**. A full vault
  holds time it declined to bank; without the reset, emptying it would pour
  that straight back in.

## localStorage has exactly one caller

`state/storage.ts`. It also falls back to an in-memory backend when
`localStorage` throws (private windows, some `file://` contexts) so the app
still runs for the session instead of failing to boot, and tests swap the
backend rather than touching a global.

## The economy went exponential, and spec §13 was amended

The spec's non-goals said "don't let the tycoon/shop layer become deep enough
to be worth playing on its own." Brennan later asked for the opposite: a
Cookie-Clicker-shaped curve, trillions, and a prestige reset. That is a
deliberate amendment, not an oversight, and it is worth writing down what makes
it safe.

Cookie Clicker gets its pull from **click frequency** — thousands of payouts an
hour. Aerie gets two a day, so escalation cannot come from repetition; it has
to come from **magnitude per day**. Every day's chest must visibly beat the
last one. Hence a payout that is a product rather than a sum:

```
points × streak × heat × city output × perks × achievements  (+ contract, milestone)
```

The rail that keeps this from inverting the product is the rule that was
already there: **the city only pays on days a review is completed.** Every
multiplier stacked on top is therefore another reason not to break the chain.
The steeper the curve gets, the harder it pulls in the right direction — which
is why the curve was allowed to get steep at all.

Two things are explicitly walled off from it. The **streak multiplier** was
left at ×1.4 — the routine's own number should not be competing with the
economy for attention. And **ascension never resets the streak, the history, or
the real-world milestone count**: those record what actually happened, and a
game mechanic has no business editing them.

## The review payout is a share of the city, not a flat rate per point

The product written above — `points × streak × heat × city output × …` — was
only ever half true in the code. The review's own line was
`points × LUMEN_PER_POINT × streak × heat`, with the city entering the chest
solely through the milestone and contract shares. Flat times a bounded
multiplier is a constant, and a constant loses to an exponential fast: at a city
producing 64k a day the review paid **238**, next to a contract bonus of 25.6k
struck against that same city. The one screen in the app that is actual work was
paying the least of anything on it.

So the review now takes `REVIEW_SHARE_OF_OUTPUT` of the city's daily output at a
full clear, pro-rated by points, and the flat rate survives as the *floor* under
it — `max(flat, share)`, not a sum, so exactly one rule is doing the work at any
scale. The flat rate covers the first days; the share covers the rest of the
game. That makes the code match the decision above, and puts the routine back at
the top of the income table: reviews now out-earn the vault, the motes and the
contract, which is the order the whole design assumes.

Two knock-ons, both wanted. The share is pro-rated against
`score.fullClearPoints` — what a full clear of *that* checklist scores — so
editing a routine to be longer re-normalises instead of quietly raising the
rate. And because milestone and contract bonuses are shares of
`heatedReview + heatedPassive`, they now ride the review's quality too: a chest
opened on a full clear is bigger in every row, not just the first.

## Aether is calculated from all-time earnings, not the run

`pendingAether` is `totalAetherFor(lifetimeLumen) − aetherEarned`. The obvious
alternative — pay out on the run and reset the counter — rewards ascending
early and often, because two short runs beat one long one. Deriving the grant
from a monotonic all-time total makes splitting a run in half worth exactly
nothing, so the decision of _when_ to ascend stays a real one.

That needs `currency` to carry three numbers rather than one. `lumen` is the
balance, `runLumen` drives shop reveals so the ladder re-reveals each run, and
`lifetimeLumen` never resets and is what Aether is priced from.

## Heat and the full-clear streak are derived; achievements are stored

Heat reads straight off history, for the same reason the full-clear streak
does. Achievements are the exception and are **stored once earned**, because
their conditions stop being true — a streak breaks, a building comes down at
ascension — and a badge that un-earns itself is worse than no badge. The
`earnedBy` predicates are only how new ids get onto the list.

Each predicate runs inside a `try`. A hand-edited save should not be able to
take the app down on boot via a badge check, so a throwing predicate simply
means "not yet".

## Perk effects are folded into one `Mods` object

Every payout path — review Lumen, city output, building prices, drop chance,
milestone bonuses — needs to know about perks. Threading each effect separately
would guarantee that a new one eventually gets left out of half of them, so
`modsFor(state)` collapses the whole tree (and the achievement bonus) into one
object that every caller already takes.

`state/actions.ts` builds its own `Mods` from state rather than trusting a
caller. A screen that forgets to pass them shows a stale preview; it can never
charge the wrong price.

The Cinder research tree folds into the *same* object, under `mods.research`,
for exactly this reason — the vault, Cinder payout, mote value and heat cap all
read it through the one seam every payout already threads.

## Cinder is a third currency, and it buys flexibility rather than numbers

Lumen measures how big the city got; Aether measures how many times you reset
it. Neither measures how *well* the routine was actually run — a floor pass and
a full clear both keep the streak and both earn Lumen. Cinder is that missing
axis: it is earned only by full clears and the heat riding on them (see
`domain/research.ts`), and it is the only currency the vault's rules will bend
for.

Two rules keep it honest:

- **It cannot be earned by waiting.** No idle source, no building, no
  ascension pays Cinder. The vault, deliberately, does not — that would let the
  quality currency be farmed by the presence mechanic, which is the exact
  inversion the whole app is built to avoid.
- **The Workshop mostly sells doors, not multipliers.** A wider collection
  window, a higher cap, a third window over lunch, a gentler idle penalty. The
  thing worth wanting after a month is not a bigger number, it is a schedule
  that bends around a bad week — and that is precisely what a review app should
  reward reaching for. The Furnace branch is the one straight rate-buy, priced
  dearest so it is the long haul rather than the obvious first pick.

Research is permanent and survives an ascension, exactly as perks do, because
it is a reward for behaviour that already happened. The tiered upgrades
(capacity, window length, work and idle rates) *supersede* rather than stack —
buying Cistern after Deeper Vault gives you its value, not their sum — so the
copy on each card can state one honest number.

## Buildings are composed from a kit, not drawn one by one

Twelve tiers × two hundred levels is not a drawing job. `scene/kit.ts` holds
the primitives and each building is a small spec — a mass, a roof, one
distinctive feature. Growth is logarithmic, because linear growth puts a
level-50 Greenhouse through the top of the frame, and side wings accrete at
exactly the levels that double the building's output, so the milestone you earn
is the one you can see.

The failure mode of a parametric system is not "this looks wrong" but a `NaN`
in a path or a tower that leaves the viewport. `buildings.test.ts` renders
every building at every interesting level and asserts neither happens — it
caught both when the kit was first written.

## Motes are DOM, and only appear after a review

The scene's own note warns that a CSS animation on an SVG node overrides its
`transform` attribute. Motes drift and are clickable, so putting them in
ordinary DOM over the stage sidesteps that entirely and makes them focusable
and keyboard-activatable for free.

Charges come only from completing a review and are stamped with the day, so
there is never anything to come back and farm. The app stays pulled rather than
pushed (spec §13) — motes are a bright window on the far side of the work, not
a reason to open the app instead of doing it.

## The islands are paged, and the ladder climbs past the home cluster

The scene used to hold all three islands at once. When Brennan asked (July
2026) to keep growing the economy, the ladder ran out of ground: twelve tiers
fill three islands of four slots exactly, and cramming more onto the same view
would have turned the opening picture into a shelf of towers.

So the scene became a strip you pan across. The home cluster is page 0 and is
unchanged, pixel for pixel — the view that greets a first-week city is the one
it always was. Every page after it is a single high island that only appears
once an ascension has carried the city into the matching altitude band
(`config/islands.ts`): page N unlocks at ascension N, mapping one-to-one onto
the bands already named in `config/ascension.ts`. The left/right arrows pan
across exactly the sky you have climbed to, and the pager hides itself entirely
until there is more than one page, so nothing advertises sky you cannot reach.

The geometry moved out of the scene and into `config/islands.ts` because two
places now need it: the scene draws the islands, and the economy has to know
which ascension a building's island unlocks at. That second reader is the point
of the second gate. `revealedBuildings` already hid a tier until earnings came
within reach of it; the high tiers add an altitude gate on top, so no amount of
Lumen shows a building standing on an island the city has not ascended to —
there would be nowhere to put it. The shop's Lumen carrot skips altitude-locked
tiers on purpose: that carrot belongs to the Ascension screen and the pager.

The eight new tiers continue the ladder's own arithmetic — 13× spacing, ~2.5-day
payback — straight past what float64 holds exactly. That is fine and always was:
`bignum.ts` shows nothing to more than three significant figures, and now falls
back to scientific notation past its named scale, so the number stays readable
however far the city climbs. The one rail that makes the steepening safe is
unchanged: the city only pays on days a review is completed, so every tier added
on top is one more reason not to break the chain.

Paging is view-only — the page you are looking at is not saved. There is no new
persisted state and so no migration; a building is still `{ id, level }`, and
which island it stands on is a fact about the catalogue, not the save.

## Juice answers to heat, and a bonus reads as a bonus

Phase 5 was the "make it feel good" pass, and the constraint on it was the same
one the whole app carries: it must not become a thing you watch during the day.
Three pieces, each tied to something that already happened rather than invented
motion for its own sake.

**The scene has a heat layer, and heat is the one thing that lights it.** The
streak lights the *sky* (palette); the full-clear combo lights the *city* — a
warm glow low on the islands and embers rising off them, the whole layer's
opacity driven by a single `--heat` variable the scene sets from
`heatDays(...)`. They are deliberately separate signals: showing up warms the
dawn, finishing the job sets the place alight. Heat is derived from history, so
the visual needs no new state — it is a read, not a store. `--heat` jumps to a
visible floor on the first full-clear day rather than easing in from nothing, so
the combo reads at a glance. The embers are motion and the glow is information:
under reduced motion the embers are dropped and the static wash stays.

**Milestone and contract payouts are crits.** Those two are bonuses stacked on
the ordinary review payout — the rare part of a chest — so they get the emphasis
to match: the number pops and the row wears a "Critical" tag. The review payout
never crits, because it is the baseline, not the surprise. The distinction is
data (`{ crit: true }` on the row), not a hand-marked class per call site, so a
new bonus row opts in the same way.

**A rarer chest opens bigger, not just differently coloured.** The tier already
set the chest's colours; it now also sets `--burst-scale`, which the spark throw
and the aura ring multiply through, and the beacon chest carries its own warm
halo. One variable, so the burst scales with rarity without a second copy of the
open animation.

## Payback depends on a building's level, not on its tier

Reported as a balance bug: at Greenhouse 66 an upgrade cost 19.6K for +196 a
day, while a Lighthouse at level 2 cost 50K for +22K a day. The obvious reading
is that the Greenhouse is a trap and the ladder is mis-tuned.

It was not the tier. Every building holds `baseCost / incomePerLevel` near 2.5,
so at *equal levels* all twenty tiers pay back within about 4% of each other.
What differed was that one building was at level 66 and the other at level 1.

The actual defect was upstream of that. Cost grows `1.11 ^ level`; income grew
linearly with six doublings scattered at 10/25/50/100/150/200. Across the full
range that is ×64 of income against ×1.5 billion of cost, so **every** building
died at the same level and the only real progress was unlocking the next tier.
The Greenhouse was not dominated by the Lighthouse — it was dominated by its own
height, and so was everything else.

`BUILDING_MILESTONE_INTERVAL` replaces the list: a doubling every ten levels,
forever. Break-even is `ln 2 / ln 1.11 ≈ 6.6`, at which payback is flat and
*what* you buy stops mattering entirely; ten keeps a gentle decay, so a
level-66 building is a 3–4 day buy rather than a 306-day one while a freshly
unlocked tier is still the best thing on the board.

## Each building improves one thing no other building does

The consequence of the above is that Lumen can no longer distinguish the tiers —
if payback is near enough equal everywhere, "which should I level" has no answer
and the ladder is one curve drawn twenty times.

So every building carries a **specialty**: the Greenhouse pays flat Cinder per
full clear, the Windmill fills the vault faster, the Lighthouse makes motes
worth more, the Foundry holds heat longer, the Starforge discounts building
prices. One step per `SPECIALTY_INTERVAL` (40) levels, five in all, and no two
tiers on the home cluster share a kind — enforced by a test, because a duplicate
would quietly put the problem back.

Every effect was deliberately chosen from a field that already existed on `Mods`
or `ResearchMods`. `applySpecialties` folds them in at the end of `modsFor`, so
a specialty reaches the vault, the chest or the streak through the same seam a
perk or a research node does, and none of those systems needed a second code
path. Folding them in *last* means they multiply whatever the trees settled on
rather than competing with it — the point of the Starforge is that it does
something your perks cannot.

## The Hearth Hall holds the charter, and the charter is a ceiling

Denser doublings create a new failure mode: with payback roughly equal
everywhere, the optimal play is to pick whichever building is cheapest per level
and pour everything into that one forever. Nothing in the arithmetic says stop.

The Hearth Hall says stop. It has stood at the centre of the home island since
the first day and never done anything; it now holds the city's **charter**,
which is the highest level any building may be raised to. Crucially it does not
lift for money — charter `L` wants one more *kind* of building than the last
one did, standing at the height the last charter allowed (charter 4 wants five
kinds at level 75). The Lumen price is three days of the city's own output, a
speed bump rather than the gate.

The loop is level everything to the ceiling, widen the city, raise the charter,
repeat — which is the same loop the ladder always implied, now with something
actually enforcing it.

Two rules keep it from ever being punitive. It never revokes a level: a building
standing above its ceiling keeps every level it has and is simply held. And
`migrate` grants a pre-charter save the charter its city had already earned, so
nobody opens the app to a city frozen behind a rule that did not exist the day
before. The charter resets with the city on ascension — keeping it would hand
every later run a free ceiling and a free output multiplier, which is what perks
are for.

## The shop quotes payback, not just the Lumen gain

`+196` beside `+22.0K` is not a comparison; it is two numbers with no shared
scale, and reading it as "the Greenhouse is broken" was the correct inference
from what the card showed. Every building card now leads with review-days to
break even, one card carries a `Best buy` badge (the shortest payback that is
actually affordable at the selected amount), and a line under the grid states
the rule outright: what a level costs depends on how high the building already
is, not on which building it is.

## The rebalance: priced against a simulated year, not against arithmetic

Three things were broken, and they were the same mistake three times — a price
or a payout struck against a number that itself grew without bound.

- **The Hearth Hall's price was three days of current output.** Every Lumen
  earned toward it raised it, and every building bought to meet its
  requirement raised it again. It is now fixed per charter: five levels of the
  newest tier the requirement names, at the height it names.
- **Aether was a cube root of lifetime Lumen.** Lumen is exponential in time,
  so any power of it is too — two months paid ~500 Aether against a tree that
  cost ~200. It is now `2 × (log10(lifetime) − 7) ^ 1.5`: about ten for a first
  ascension around week seven, about seventy for a city a million times richer.
- **A good day paid ~8–10 days of city output** — vault at 1.7× (the work-hour
  speed-up was added on top of a per-wall-clock-second rate), reviews at 0.4×
  each, motes at 0.15× each, contracts struck against review *plus* output,
  heat up to ×3 on all of it. The ladder was priced for about one. Every source
  is now scaled so a good day is ~2–3× output.

Fixing income was not enough on its own: every city-wide multiplier (charter,
district, achievements, synergies, specialties, perks) shortens *every* tier's
payback at once, so the ladder still accelerated. Each tier now pays back
~1.3× slower than the one below it (raw payback 6 days at the Greenhouse, ~900
at the Void Anchor), so rising multipliers are absorbed by the ladder instead of
compounding into a runaway. This replaces "payback depends on level, not tier".

Perks are ranked with rising costs (one, High Current, is uncapped), and the
charter runs to 16 with levels to 400 — charters past 11 need more kinds than
the home cluster has, so the upper half is climbed on the high islands.
Specialties stop at five steps; the scene draws levels past 200 at 200.

All of it was tuned with `npm run sim` (`scripts/sim/`), which plays a diligent
player forward through the real actions. That player now takes its first
ascension around week 7, reaches charter 8 around week 25, and is still climbing
charter 15 at the end of a year. Old saves that had ascended get every perk
refunded and their Aether recomputed on the new curve (keeping the share of the
lifetime they had already been paid).

## Wards and mending make a missed day recoverable, for a price

A missed weekday used to cost the whole run, with no recourse. A **ward**
(25 Cinder, one held to start) is spent automatically on the next gap it can
fully cover; a **mend** restores a broken run within three weekdays, for Cinder
or Aether, scaled by days missed and the run's length. Both work by writing the
covered days into history as warded days off — so the streak, heat and
achievements needed no new code path to honour them. The free "Take a day off"
button is unchanged: wards are for the day you *forget*.

Found on the way: a broken streak never reset the milestone thresholds, so a
run that broke at 23 saw no chest until 25 and no lunch until 40. It now starts
over at 5 and 20, and a mend restores the thresholds the run had. The day check
also runs on the vault timer now, not only on load, so a tab left open overnight
notices a missed day.

## Weekly expeditions and the kiln are there so a good week always counts

An expedition is the contract at week scale — one rotating goal, derived from
history, paying Cinder plus a day of city output on the review that lands it.
The kiln burns 100 Cinder into one Aether, so Cinder earned after the Workshop
is bought out is never wasted; kiln Aether does not count toward what an
ascension has paid, so it never shrinks a grant.


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

## A third tier below the floor

The spec names two tiers. Scoring has three: skipping a core item is graded
`none`. It still pays out for the work done, and the summary says plainly that
it doesn't count toward the streak. The alternative — silently promoting a
partial run to a floor pass — would make the floor meaningless, and refusing to
log it at all would punish the exact bad day the floor exists for.

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

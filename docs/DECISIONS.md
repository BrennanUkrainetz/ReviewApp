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

## Passive income is paid once per day, on the first review

Buildings pay on days a review is completed, not on a timer. An idle game that
pays while you avoid the reviews inverts the whole point (spec §13), and paying
per-review would reward doing both routines twice as much as the streak itself.

## localStorage has exactly one caller

`state/storage.ts`. It also falls back to an in-memory backend when
`localStorage` throws (private windows, some `file://` contexts) so the app
still runs for the session instead of failing to boot, and tests swap the
backend rather than touching a global.

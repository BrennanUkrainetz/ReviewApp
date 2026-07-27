# Aerie

A local morning & daily review app, built as a floating sky-city tycoon game.
The reviews are the expeditions: finishing one earns Lumen, opens a reward
chest, and grows the city. A 20-day streak earns a real-world reward.

Single user, single machine. No accounts, no backend, no network calls — the
webfonts are bundled and every byte of state lives in `localStorage`.

The full product spec lives in [docs/SPEC.md](docs/SPEC.md), and the design
choices behind the build are in [docs/DECISIONS.md](docs/DECISIONS.md).

## How it works

Two review routines — Morning and Daily — run as a guided, one-item-at-a-time
flow. Finishing either at **floor** tier (all core items) keeps the streak
alive; a **full clear** pays more. Points become Lumen, multiplied by a streak
bonus, and a chest pays out at the end.

The streak drives the city's light: at 0 it sits in a cold pre-dawn, and at 20
it's in full golden hour. Every 5 days pays a bonus chest, every 20 earns a real
lunch out. A **day off** is an explicit button that holds the streak without a
review; missing a day entirely resets the run to 0.

### The long game

The Lumen curve is exponential and meant to be played for months.

- **Twelve building tiers**, each costing and paying roughly 13× the one below,
  from a 20-Lumen Greenhouse to a 38-trillion Anchor Spire. Levels are
  effectively uncapped, a building's output **doubles** at levels 10/25/50/100,
  and several feed **synergy** bonuses into their neighbours. The shop buys in
  ×1 / ×10 / Max.
- **Heat** — consecutive full-clear days multiply everything, up to ×3. A floor
  pass keeps the streak but not the combo.
- **A daily contract** — one rotating objective, fixed for the calendar day,
  paying a share of the day's payout when it lands.
- **Motes** — a few catchable Lumen bursts that appear over the city _after_ a
  review, and expire with the day.
- **Achievements** — 32 badges, each adding 1% to every Lumen source, forever.
- **Ascension** — once a run has earned enough, the city can climb into a new
  altitude band: buildings and Lumen reset, and the run pays out **Aether** for
  a permanent 20-node perk tree. **Your streak, history, and cosmetics are never
  reset** — those record what actually happened, and no game mechanic touches
  them.

The whole thing stays gated behind the routine: the city only pays on days a
review is completed, which is what makes it safe for the curve to be this
steep.

## Getting started

```bash
npm install
npm run dev      # http://localhost:5273
```

## Scripts

| Script               | What it does                                      |
| -------------------- | ------------------------------------------------- |
| `npm run dev`        | Vite dev server with HMR                          |
| `npm run build`      | Typecheck, then build to `dist/`                  |
| `npm run preview`    | Serve the production build                        |
| `npm test`           | Run the unit tests once                           |
| `npm run test:watch` | Unit tests in watch mode                          |
| `npm run typecheck`  | `tsc --noEmit`                                    |
| `npm run lint`       | ESLint over the project                           |
| `npm run format`     | Prettier write                                    |
| `npm run check`      | Typecheck + lint + tests — run this before commit |

## Architecture

```
src/
  config/     Plain data: checklists, shop ladder, perks, contracts,
              achievements, altitude bands, tuning constants
  domain/     Pure logic: dates, scoring, streaks, economy, ascension,
              heat, contracts, achievements, big-number formatting
              (all unit-tested)
  state/      Persisted state: types, storage, migrations, store, actions
  ui/         Screens, components, and the small DOM helper they share
    scene/    The SVG city, its building kit, and the streak lighting
  styles/     Design tokens and per-screen stylesheets
```

Rules the code follows:

- **`state/storage.ts` is the only module that touches `localStorage`.**
  Swapping in a file-backed store is a one-file change.
- **`domain/` is pure and has no DOM imports.** Anything with a rule worth
  arguing about lives there, and is covered by tests.
- **Screens never build state themselves.** They call an action in
  `state/actions.ts`, which is the complete list of legal transitions.
- **Content is data, not code.** A building's cost or a payout constant means
  editing `src/config/*`, never a UI file.

### Editing your checklists

Both routines are editable in the app: **Settings → Review checklists**. Add,
rename, reorder, or remove items, set what each one is worth, and mark which
are **Core** — the core items are the Floor, the minimum that still keeps a
streak alive on a bad day. Changes save as you make them and apply to your next
review; a review already in progress finishes on the list it started with.

The items live in the save file, so they travel with your export. `Reset to
defaults` on either routine puts back the list in `src/config/checklists.ts`,
which is what a fresh save starts from — edit that file to change the starting
set.

### Tuning the economy

`src/config/tuning.ts` holds every payout, chance, multiplier, and interval in
the game — the cost curve, the milestone doublings, heat, motes, and the
achievement bonus.

The _ladder_ itself lives in `src/config/shop.ts`, and the note at the top of
that file is the one worth reading before retuning: the whole balance rests on
two numbers — **13× spacing** between tiers and a **~2.5 review-day payback**
per level. `economy.test.ts` asserts the payback ratio holds across every tier,
so a retune that quietly turns one tier into a trap fails the suite.

The prestige curve is in `src/config/ascension.ts` (a cube root of lifetime
Lumen), and the perk tree it feeds is in `src/config/perks.ts`.

## Dependencies

Every dependency is pinned to an **exact version** — no carets, no ranges.
`.npmrc` sets `save-exact=true`, so `npm install <pkg>` keeps it that way. An
identical package.json therefore resolves to an identical tree on any machine,
and a dependency only moves when someone deliberately moves it.

```bash
npm outdated            # what has moved on
npm update              # respects the exact pins; use npm install <pkg>@latest to bump
npm audit               # currently clean
```

Updating is a deliberate, reviewable act: bump the pin, run `npm run check`,
commit the lockfile change with it.

## Data & privacy

Everything is stored under the `aerie-state` key in `localStorage`, scoped to
the browser profile that runs it. Settings has an export button if you want a
copy, and a reset that wipes the save.

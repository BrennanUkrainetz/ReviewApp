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

The week is Monday to Friday. Weekends can't be missed — a Friday review carries
the run into Monday, and heat holds across the weekend the same way. Logging a
review on a Saturday still pays, but it counts as a bonus rather than a day of
the streak.

### The long game

The Lumen curve is exponential and meant to be played for months.

- **Twenty building tiers**, twelve on the home cluster and eight on the high
  islands. Each costs ~13× the one below and pays back ~1.3× slower, a
  building's output doubles every 10 levels, and several feed **synergy**
  bonuses into their neighbours. The shop buys in ×1 / ×10 / Max.
- **The Hearth Hall charter** caps how high any building may go. Raising it
  asks for breadth (one more kind of building at the last ceiling) and a fixed
  Lumen price. Sixteen charters run the cap to level 400; the upper ones need
  buildings from the high islands.
- **Heat** — consecutive full-clear weekdays multiply the day's review, contract
  and chest bonuses, up to ×2. A floor pass keeps the streak but not the combo.
- **A daily contract** and a **weekly expedition** — rotating objectives that
  pay a share of the city's output (and, for the expedition, Cinder).
- **Motes** — a few catchable Lumen bursts that appear over the city _after_ a
  review, and expire with the day.
- **Streak wards and mending** — a ward (bought with Cinder) covers a missed
  weekday automatically; a broken run can be mended for a few days afterwards
  with Cinder or Aether.
- **Achievements** — each adds 1% to every Lumen source, forever.
- **Ascension** — buildings and Lumen reset, the city climbs an altitude band,
  and the run pays **Aether** for a ranked perk tree (one perk is uncapped).
  **Your streak, history, and cosmetics are never reset.**
- **The Workshop** spends **Cinder** (earned only by full clears) on research,
  and its kiln turns spare Cinder into Aether.

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
| `npm run sim`        | Balance simulator: a year of diligent play, logged per week to `sim-output.txt` (`SIM_DAYS`, `SIM_ASCEND=0`) |

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
three numbers — **13× cost spacing** between tiers, a **~6 review-day raw
payback** at the bottom, and payback growing **~1.3× per tier**.
`economy.test.ts` asserts that step holds across every tier, so a retune that
quietly turns one tier into a trap fails the suite.

The prestige curve is in `src/config/ascension.ts` (logarithmic in lifetime
Lumen), and the ranked perk tree it feeds is in `src/config/perks.ts`. Before
committing a retune, run `npm run sim` and read the week-by-week log — it plays
a diligent player through a year using the real actions, which is how the
current numbers were set.

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

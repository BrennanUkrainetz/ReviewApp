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

## Getting started

```bash
npm install
npm run dev      # http://localhost:5273
```

## Scripts

| Script              | What it does                                     |
| ------------------- | ------------------------------------------------ |
| `npm run dev`       | Vite dev server with HMR                         |
| `npm run build`     | Typecheck, then build to `dist/`                  |
| `npm run preview`   | Serve the production build                       |
| `npm test`          | Run the unit tests once                          |
| `npm run test:watch`| Unit tests in watch mode                          |
| `npm run typecheck` | `tsc --noEmit`                                   |
| `npm run lint`      | ESLint over the project                          |
| `npm run format`    | Prettier write                                   |
| `npm run check`     | Typecheck + lint + tests — run this before commit |

## Architecture

```
src/
  config/     Plain data: checklists, shop catalogue, tuning constants
  domain/     Pure logic: dates, scoring, streaks, rewards  (unit-tested)
  state/      Persisted state: types, storage, migrations, store, actions
  ui/         Screens, components, and the small DOM helper they share
    scene/    The SVG city and its streak lighting
  styles/     Design tokens and per-screen stylesheets
```

Rules the code follows:

- **`state/storage.ts` is the only module that touches `localStorage`.**
  Swapping in a file-backed store is a one-file change.
- **`domain/` is pure and has no DOM imports.** Anything with a rule worth
  arguing about lives there, and is covered by tests.
- **Screens never build state themselves.** They call an action in
  `state/actions.ts`, which is the complete list of legal transitions.
- **Content is data, not code.** Editing a checklist item, a building's cost,
  or a payout constant means editing `src/config/*`, never a UI file.

### Editing your checklists

`src/config/checklists.ts` holds both routines as plain data. Change a label,
reorder items, adjust `points`, or move which items are `core` — `core: true`
items are the Floor, the minimum that still keeps a streak alive on a bad day.

### Tuning the economy

`src/config/tuning.ts` holds every payout, chance, and interval in the game.

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

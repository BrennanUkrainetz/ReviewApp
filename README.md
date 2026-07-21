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

## Dependency policy: a 30-day cooling-off window

`.npmrc` sets `before=<a date 30 days ago>`, so npm refuses any package version
published in the last 30 days — direct and transitive alike. Hijacked releases
are usually caught and pulled within hours or days, and nothing here needs a
day-old dependency.

```bash
npm run deps:window     # move the window forward to today minus 30 days
npm update              # then update within the new window
```

Things worth knowing:

- **Letting the window go stale is safe.** It only ever widens, so packages get
  older, never fresher. The refresh script refuses to move it backwards.
- **The guard is airtight.** `overrides` can't pull a newer version through it;
  the install just fails. To take an urgent patch before it ages in, pass a
  one-off window explicitly: `npm install --before=$(date -u +%Y-%m-%d)`.
- **The cost is delayed security patches.** A fix published today is refused for
  30 days, the same as any other release. Today that means one known dev-only
  advisory sitting unpatched (see below).
- **`save-exact` is on**, so package.json pins exact versions and a caret range
  can't drift into a fresh release on another machine.
- On **npm >= 12** this policy has a rolling form that needs no refreshing —
  `min-release-age=30`. It isn't used here because npm 12 requires Node >= 24.15
  and this project runs on 24.14; npm 11 ignores the setting with a warning,
  which would be silent false security. Once Node is new enough, swap the
  `before` line for `min-release-age=30` and delete the refresh script.

### Known accepted advisory

`brace-expansion@5.0.6` (eslint → minimatch → brace-expansion) has a
high-severity ReDoS advisory. The fix, 5.0.7, was published inside the window
and ages in on 2026-07-29. It is a dev-only dependency and the glob patterns it
expands come from this repo's own ESLint config, never from untrusted input, so
it's accepted rather than force-installed.

## Data & privacy

Everything is stored under the `aerie-state` key in `localStorage`, scoped to
the browser profile that runs it. Settings has an export button if you want a
copy, and a reset that wipes the save.

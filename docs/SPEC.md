# Aerie — Morning & Daily Review App

A local, single-user desktop web app that gamifies Brennan's work morning
and daily review routines through a persistent floating-sky-city tycoon
game. The reviews are the "expeditions"; completing them earns currency,
opens a reward chest, and grows the city. Consistency (a 20-day streak)
unlocks a real-world reward (a lunch out), with smaller in-game rewards
along the way to sustain momentum.

This document is the full spec. Build in the phases listed at the bottom,
in order, committing after each phase.

---

## 1. Problem this solves

The task lists themselves aren't the problem — motivation in the moment
is. Brennan remembers to do the reviews but doesn't _feel_ like doing them
at the time. The fix isn't a better reminder, it's making starting the
review low-friction and rewarding, with visible progress (streak, city
growth) that makes skipping feel like a loss rather than a neutral
non-event.

Design principles this app must honor:

- The floor must always be achievable, even on bad days (two-tier scoring).
- Rewards should escalate: small chest payout every time → occasional
  milestone drop → big real-world reward at a 20-streak.
- A missed day should be recoverable without destroying total investment
  — hence "Day Off" as an explicit non-penalized skip, distinct from a
  miss.
- The city/game must visibly reflect the streak, not just display a number.

---

## 2. Tech stack

- **Single local web app**, no backend, no login. Runs via a local dev
  server or as a static file.
- Plain **HTML/CSS/vanilla JS** (no framework) unless Claude Code judges
  React genuinely simplifies the build — either is fine, but keep it a
  single person's local tool, not a deployed product. Avoid over-engineering.
- **Persistence**: `localStorage`, wrapped in a small storage module so it
  could later be swapped for a file-based store if desired. All game
  state is client-side and local to the browser profile it runs in.
- **No external APIs, no accounts.** This never needs to leave Brennan's
  machine.
- Structure as a normal small project: `index.html`, `/src` (or `/js`),
  `/css`, `/assets`. Use a bundler only if it meaningfully helps (e.g.
  Vite) — otherwise plain script tags are fine and preferable for
  simplicity.

---

## 3. Visual design direction (do not default to generic AI-app look)

**Theme**: a floating sky city called **Aerie**, built on a cluster of
islands drifting above the clouds, viewed at a fixed isometric-ish angle.
This is the single persistent "world" — not a separate screen per feature.

**Palette** (use these as CSS custom properties, named semantically):

- `--dusk` `#0B1E3D` — deep sky/background base
- `--amber` `#F5A94E` — sunrise glow, primary accent/CTA
- `--mist` `#8FD8D2` — pale teal, secondary accent (clouds, secondary UI)
- `--slate` `#2E4A6B` — panel/card backgrounds
- `--cream` `#FFEFD6` — primary text on dark backgrounds
- `--dim` `#5B7A9D` — secondary/muted text

**Typography**:

- Display face: something geometric/architectural with character (e.g.
  Space Grotesk, Sora, or similar via Google Fonts or a bundled webfont).
  Used for headings, the city name, streak counter.
- Body face: a warm, readable humanist sans (e.g. Inter or similar).
- Numeric/utility face: tabular-nums monospace (e.g. JetBrains Mono or
  system monospace) for the streak counter and currency counts so digits
  don't jitter when they change.

**Signature element (the one thing to make genuinely great):**
The city itself visibly reflects the streak state — the lighting shifts
from a dim, cool pre-dawn (streak reset / day 1) toward a full warm
golden-hour glow as the streak climbs toward 20. This should read as an
actual lighting/color transition across the scene (sky gradient, building
window-glow color, cloud tint), not a text label. Buildings purchased in
the shop visibly appear on the islands. This lighting-as-streak metaphor
is the "wow" moment of the app — spend real effort here; keep everything
else quiet and disciplined around it.

**Layout** (single main screen, "The City"):

```
┌─────────────────────────────────────────────────────┐
│  🔥 Streak: 12   (Day 12 of current run)   ✦ 1,240   │
├─────────────────────────────────────────────────────┤
│                                                       │
│           [ SVG/canvas floating sky city ]           │
│         islands, buildings, drifting clouds,         │
│           lighting driven by streak state             │
│                                                       │
├─────────────────────────────────────────────────────┤
│ [ Start Morning Review ]  [ Start Daily Review ]      │
│ [ Take a Day Off ]                       [ Shop ]     │
│ [ View progress / history ]                           │
└─────────────────────────────────────────────────────┘
```

During a review: a full-screen guided flow, one checklist item at a
time (not a wall of checkboxes) — big tap target, satisfying check
animation, then auto-advance. This is deliberately more immersive/slower
than a plain to-do list, since the immersive walk-through _is_ the
mechanism that makes starting easy.

Motion should be used deliberately, not scattered: the page-load city
scene, the chest-opening moment, and the streak-lighting transition are
the three places animation should live. Respect `prefers-reduced-motion`.

---

## 4. Core loop

1. Brennan opens the app → sees the City screen with current streak,
   currency, and city state.
2. He taps **Start Morning Review** (or Daily Review — both function the
   same way, different checklists, can both be done same day).
3. Guided one-item-at-a-time flow through the checklist (see §6 for
   items). Each item can be marked **Done** or **Skipped**.
4. On completion, points are tallied (see §7 scoring), converted to
   Lumen (currency), and a **reward chest** animation plays — tap to open,
   satisfying reveal of Lumen + occasional cosmetic/bonus item (see §8).
5. Back on the City screen: currency updates, streak updates, city
   lighting/state updates.
6. Lumen can be spent in the **Shop** on buildings (passive Lumen/day
   generation — modest, this is flavor/momentum, not the main point) and
   cosmetics (pure visual, no gameplay effect, for city customization).
7. Every 20-day streak → triggers a special "Milestone: Real Reward"
   screen telling Brennan he's earned a real lunch out, distinct visually
   from normal chests. Streak continues past 20 (doesn't reset) — this
   is a repeating milestone, not a one-time cap. Smaller milestones (e.g.
   every 5 days) trigger a bonus in-game-only reward to sustain momentum
   between the big ones.
8. **Day Off**: an explicit button, usable once marked, that preserves
   the streak without requiring a review that day. Must be a deliberate
   action (confirm dialog: "Mark today as a day off? Your streak stays
   safe.") — not something that happens automatically, so it can't be
   used to silently paper over avoidance. Track total days-off used,
   visible in history, purely as data — no judgment/shaming copy.

---

## 5. Data model

Store as a single JSON object in `localStorage` under key `aerie-state`.

```json
{
  "version": 1,
  "streak": {
    "current": 12,
    "longest": 17,
    "lastCompletedDate": "2026-07-20",
    "daysOffUsed": 3
  },
  "currency": {
    "lumen": 1240
  },
  "history": [
    {
      "date": "2026-07-20",
      "morning": { "completed": true, "tier": "full", "pointsEarned": 8 },
      "daily": { "completed": true, "tier": "floor", "pointsEarned": 4 },
      "dayOff": false
    }
  ],
  "milestones": {
    "nextBigAt": 20,
    "nextSmallAt": 15,
    "smallInterval": 5,
    "totalBigMilestonesHit": 1
  },
  "city": {
    "buildings": [{ "id": "greenhouse", "level": 2 }],
    "cosmetics": {
      "unlocked": ["teal-lanterns"],
      "equipped": ["teal-lanterns"]
    }
  },
  "settings": {
    "reduceMotion": false
  }
}
```

A single storage module (`storage.js`) should expose `loadState()`,
`saveState(state)`, and `resetState()` — everything else reads/writes
through it. Never touch `localStorage` directly elsewhere.

Date handling: use the local calendar day (YYYY-MM-DD) to determine
streak continuity — a review completed any time on a calendar day counts
for that day; missing a full calendar day (no completion, no day-off)
breaks the streak back to 0 the next time the app is opened.

---

## 6. Checklist content

**Morning Review** ("Ascend" — morning expedition):

1. Take lunch to fridge
2. Make a drink
3. Review calendar
4. Look at emails
5. Look at Todoist for any tasks
6. Review priorities for the day
7. Look at 2026 goals and mentally rehearse them

**Daily Review** ("Descend" — evening/end-of-day expedition):

1. Look at HubSpot and update deal stages if needed
2. Clear email and Todoist inboxes
3. Clear bullet journal (Kindle Scribe) from today, plan for tomorrow
4. Clean dishes, put mugs etc. in the dishwasher from desk

Keep this content in a single config file (e.g. `checklists.js`) as plain
data, not hardcoded into UI components, so Brennan can edit the lists
himself later without touching app logic.

---

## 7. Scoring — two-tier system

Every checklist item has a point value. Suggested default (Claude Code
may refine, but keep it simple — most items worth 1, a couple of
higher-value "core" items worth more):

Morning Review (7 items, target ~10 pts):

- Take lunch to fridge — 1
- Make a drink — 1
- Review calendar — 1
- Look at emails — 1
- Look at Todoist — 1
- Review priorities for the day — 2 (core)
- Review 2026 goals — 3 (core)

Daily Review (4 items, target ~8 pts):

- HubSpot deal stages — 2
- Clear email/Todoist inboxes — 2
- Clear bullet journal / plan tomorrow — 3 (core)
- Clean dishes — 1

**Two tiers per review, per day:**

- **Floor** — completing just the "core" item(s) marked above (or any
  minimum subset Brennan defines) counts as a Floor pass: keeps the
  streak alive, awards reduced Lumen, but does not count as a "full
  clear" for milestone-bonus purposes.
- **Full clear** — every item done: full points, full Lumen, counts
  toward full-clear-specific stats (e.g. a separate "full clear streak"
  stat displayed alongside the main streak, if that's not overcomplicating
  things — main streak = did-something-count-toward-a-day; full-clear
  streak = a secondary bragging-rights stat, non-blocking).

Points convert directly to Lumen (1:1 by default, tune-able constant),
**multiplied by a streak bonus**: e.g. `multiplier = 1 + min(streak, 20) * 0.02`
(so streak 20 = 1.4x). Keep this in one named constant/function so it's
easy to tune later.

---

## 8. Reward chest (end-of-review minigame)

After each review (morning or daily) is completed (floor or full),
show a **chest-opening sequence**:

- Chest appears/drops onto the city scene.
- Tap/click to open — a satisfying animation (shake → crack of light →
  burst open), sound optional (respect a mute toggle, don't require
  audio).
- Contents spill out: Lumen amount earned (based on §7 scoring), and,
  on a randomized but tunable chance, a bonus cosmetic-unlock item.
- No skill/failure state — the "game" is the anticipation and payoff,
  not a challenge, per Brennan's stated preference. Keep it short
  (a few seconds), since this runs twice a day and must never become a
  chore itself.

Milestone chests (every `smallInterval` days, and the big 20-streak one)
should visually read as distinct/rarer — different chest color/glow,
bigger burst — without requiring new mechanics.

---

## 9. Shop — buildings & cosmetics

- **Buildings**: bought with Lumen, placed on the city islands, each
  provides a small passive Lumen trickle per completed day (flavor and
  momentum, kept modest so the reviews themselves stay the primary
  Lumen source — this is not meant to become an idle game played instead
  of doing reviews). Suggested starter set: Greenhouse, Windmill,
  Lighthouse, Market Stall, Observatory — Claude Code can flesh out
  names/flavor text consistent with the sky-city theme.
- **Cosmetics**: pure visual — lantern strings, cloud colors, banner
  styles, a pet/companion creature drifting around the city. No gameplay
  effect. These are what chest-drops mostly unlock, so the reward loop
  has variety beyond raw currency.
- Shop screen: simple grid, shows cost, owned/equipped state, disabled
  state if unaffordable. Keep transactions instant (click to buy/equip),
  no confirmation dialogs except for anything irreversible (there
  shouldn't be anything irreversible here).

---

## 10. Screens summary

1. **City** (home/root screen) — described in §3 layout.
2. **Review flow** (shared component, parameterized by checklist) — one
   item at a time, progress indicator, Done/Skip per item, tier result
   shown at the end before the chest.
3. **Chest reveal** — see §8.
4. **Shop** — buildings tab + cosmetics tab.
5. **History / Progress** — simple log of past days (date, tier hit per
   review, day-off flags), current streak, longest streak, total big
   milestones hit. This is where Brennan can see his own patterns over
   time — keep it factual, no guilt-tripping copy for missed days.
6. **Settings** (minimal) — reduce motion toggle, mute toggle, a reset
   option (with a real confirmation, since it wipes `localStorage`).

---

## 11. Copy/voice guidelines

- Second person, plain, low-key encouraging — never saccharine, never
  guilt-inducing. Brennan is the one running this, not being managed by
  it.
- Empty/missed-day states describe what happened plainly ("No review
  logged for July 19") without judgment language.
- Buttons name the action exactly: "Start Morning Review," not "Begin
  Journey." (Some flavor is fine for the city/game side — "Ascend,"
  "Descend," chest names — but the actual task-list UI should stay
  clear and literal so it never gets in the way of just doing the
  review.)

---

## 12. Build phases (execute in order, verify each before moving on)

**Phase 1 — Skeleton & state**

- Project scaffold, `storage.js` module, data model from §5, a barebones
  City screen showing streak/currency numbers (no art yet), and the two
  review flows as plain checklists with tier scoring. Get the full loop
  working end-to-end with placeholder visuals before investing in art.

**Phase 2 — City scene & streak lighting**

- Build the SVG/canvas city scene, islands, a handful of placeholder
  buildings, and the streak-driven lighting transition (the signature
  element from §3). This is the highest-effort visual piece — get it
  right before layering on shop/chest polish.

**Phase 3 — Chest reveal & milestones**

- Chest animation, Lumen payout, cosmetic-drop chance, milestone
  detection (small + big/20-streak), the distinct milestone chest
  treatment, and the "you've earned a real lunch" screen at 20-streak.

**Phase 4 — Shop**

- Buildings (with passive trickle) and cosmetics, wired to actually
  affect the city scene (bought buildings appear; equipped cosmetics
  show).

**Phase 5 — History, settings, polish pass**

- History/progress screen, settings (reduce motion, mute, reset),
  responsive check, keyboard focus states, final self-critique pass per
  the frontend-design skill (screenshot, remove one accessory, check
  against the "generic AI app" defaults called out in §3).

---

## 13. Explicit non-goals

- No multi-user/accounts/sync — this is one local install for Brennan.
- No mobile app / native build — a local web app is sufficient.
- No real notifications/reminders — this app is intentionally pulled,
  not pushed; the point is making starting easy, not adding another
  nag.
- No difficulty/failure state in the minigame — anticipation and payoff
  only, per explicit preference.
- Don't let the tycoon/shop layer become deep enough to be worth playing
  on its own disconnected from doing reviews — passive income should
  stay minor relative to review-driven Lumen.

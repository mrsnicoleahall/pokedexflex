# PokeFlexDex — Ribbons & Rivalry Expansion Design Spec

**Date:** 2026-07-14
**Status:** Approved ("keep going — don't ask anymore"); build all sub-features.
**Relationship to Flex Layer spec:** This expands and reprioritizes the Flex
Layer (`2026-07-14-flex-layer-design.md`). Part 1 (rarity engine) is done. This
spec makes **ribbons the core collecting incentive**, adds a full **type-icon
language**, and **expands Versus**. It folds in a lean version of the Flex
Layer's Part 3 (routing + handles + public profiles) as a prerequisite for
Versus and public showcases. The Flex Layer's stats dashboard (Part 2) and
homepage redesign (Part 5) remain future work; the per-user stats aggregation
helpers built here (`stats.ts`) will serve that dashboard later.

## Summary

Three intertwined workstreams, sequenced so each phase ships independently:

1. **Type iconography** — adopt a documented 18-type color palette app-wide and
   an icon-only type-chip language everywhere types appear. Foundation for the
   rest.
2. **Ribbons as the core loop** — a generated per-achievement **icon system**, a
   **much larger catalog** (~75–90 new ribbons), and the full **incentive
   layer**: showcase, points + rank, earn moments + nudges, and rarity %.
3. **Versus, expanded** — more scored rounds, per-type/per-gen breakdowns, a
   shareable result card, and saved rivalries.

## Assets (provided by user, in repo)

- `assets/types/*.svg` — 18 monochrome single-path type silhouettes (512×512),
  the duiker101 set, free for any use. Named exactly by type (`fire.svg` …).
- `assets/ribbons/*.svg` — 8 rosette frames (`darkblueribbon`, `darkpinkribbon`,
  `goldribbon`, `greenribbon`, `lightblueribbon`, `pinkribbon`, `purpleribbon`,
  `yellowribbon`; identical geometry, viewBox `0 0 1616.28 1680.23`, empty
  circular center + tails) and 6 kawaii pieces (`coin`, `diamond`, `gift`,
  `heart`, `starribbon`, `trophy`). Ignore the `.ai` files.

**Documented type palette (adopt verbatim):**
`bug #92BC2C · dark #595761 · dragon #0C69C8 · electric #F2D94E · fairy #EE90E6 ·
fighting #D3425F · fire #FBA54C · flying #A1BBEC · ghost #5F6DBC · grass #5FBD58 ·
ground #DA7C4D · ice #75D0C1 · normal #A0A29F · poison #B763CF · psychic #FA8581 ·
rock #C9BB8A · steel #5695A3 · water #539DDF`

---

## 1. Type iconography

- **Palette:** replace `TYPE_COLORS` in `src/react-app/theme.ts` with the 18
  documented hexes above. Because `typeColor()` feeds chips, card auras, and
  ribbon accents, the change ripples app-wide automatically. Known shifts:
  Dragon purple→blue, Fire→warmer orange, Water→softer blue, etc.
- **`TypeIcon` component:** copy the 18 SVGs to `public/types/*.svg`; render each
  as a `<span>` recolored via CSS mask: `mask-image: url(/types/<type>.svg)` +
  `background-color` = glyph color. No path strings in JS; recolors freely in
  light/dark.
- **Icon-only chips, everywhere types appear** (cards, type filter buttons,
  stats by-type chart, type ribbons): circular chip, background = type color,
  glyph color = `getContrastText(typeColor)` (white on dark types, dark on light
  types like electric). **No text label.** Accessibility is mandatory: every
  chip carries `role="img"`, `aria-label={type}`, and a `title` tooltip so the
  icon-only form stays legible to screen readers and on hover.

## 2. Ribbon icon system (the visual engine)

Every achievement gets a **unique, generated** icon — not hand-drawn — so it
scales to 150+ ribbons.

- **Composition:** recolorable **rosette frame** + a **center glyph**.
- **`RibbonFrame`:** inline one rosette geometry with its fills swapped for CSS
  variables: `--r-main` (base), `--r-mid` (`color-mix` darken of base),
  `--r-light` (lighten of base), plus the fixed gold inner ring and white
  center. Any base color → an on-brand recolored rosette.
- **Center glyph by family:**
  - Type ribbons → the matching **type icon**.
  - Generation / Regional → a numeral / roman glyph.
  - Shiny → **star**; Events → **gift**; Rarity-class sets → **diamond**;
    Grand / Living Dex → **trophy**.
  - Others → a fitting emoji or a lettered pip.
  - The 6 kawaii pieces are each **reserved for one marquee ribbon** so they stay
    distinctive; recolored rosette+glyph does the volume work.
- **Uniqueness via color-coding:** type ribbons use the type color; generations
  use a 9-step ramp; regions their own colors; rarity-classes metallic tones. No
  two ribbons collide even at scale.
- **Resolution lives on the client:** `src/react-app/ribbons/ribbonIcon.ts`
  resolves `ribbonId`/`category` → `{ frame, baseColor, glyph }` by rule (keeps
  the API lean; no per-ribbon art over the wire). A `RibbonIcon` component
  renders frame+glyph and is applied to the existing catalog immediately.

## 3. Ribbon catalog expansion (~75–90 new ribbons)

Extends `src/worker/ribbons/catalog.ts` (pure engine) plus `CollectionSummary`
and the aggregation query that builds it, plus curated id-set constants
(reusing/extending `src/worker/rarity/priors.ts`).

- **Regional living dexes (~13):** own every species from each generation I–IX
  (labeled by region for flavor, **defined by the `generation` field** — true
  game-specific regional dexes need curated lists we don't have; this is the
  honest derivable version, called out to the user). Plus **National Dex %
  tiers** 25 / 50 / 75 / 100.
- **Rarity-class sets (~8):** Starters, Legendaries, Mythicals,
  Pseudo-legendaries, Fossils, Babies, Ultra Beasts, Paradox — extend
  `priors.ts` with the curated id sets not already present.
- **Specimen-detail collector (~10):** all 25 Natures, every Ball type,
  level-100 milestones, 6IV / competitive-ready, Gigantamax / Mega / Alpha
  sets — from fields already stored on specimens. Requires extending
  `CollectionSummary` with: `naturesOwned`, `ballsOwned`, `level100Count`,
  `sixIvCount`, and gmax/mega/alpha counts, and the aggregation that populates
  it.
- **Type & shiny deepening (~25):** type-master tiers (own 10 / 25 / 50 distinct
  of a type), shiny-of-every-type, a shiny living-dex grand ribbon, extended
  event tiers.
- **More easter eggs (~10+):** additional secret `???` ribbons in the existing
  `Fun` category.

## 4. Ribbon incentive layer

All four features are unified by one new table, **`user_ribbons`** (userId,
ribbonId, earnedAt, seenAt). On each ribbon compute (ribbon fetch, or after a
collection change), upsert the user's currently-earned ids.

- **Earn moments:** diff computed-earned vs stored → anything with
  `earnedAt > seenAt` is newly earned → celebratory moment (toast/modal) on the
  Ribbons page and dashboard. An ack (`POST /api/ribbons/seen`) bumps `seenAt`.
- **Rarity %:** `earnedCount(ribbonId) / totalUsers`, derived by `COUNT` over
  `user_ribbons`. Shown per card; rare ribbons get a "flex" highlight.
- **Points + rank:** each ribbon has `points` by difficulty (Fun 5, Type/Gen 15,
  Form Sets 20, Rarity-class 40, Grand 100 — tune during build). Sum of earned =
  **Trainer Score** → a rank title (Novice → Collector → Ace → Elite → Champion →
  Master → Living Legend). Shown on dashboard + profile; feeds the Versus "Ribbon
  score" round.
- **Showcase:** pin up to 6 earned ribbons (`user_showcase`: userId, ribbonId,
  slot), shown as a trophy wall on the dashboard + public profile. Only earned
  ribbons selectable (validated against `user_ribbons`).
- **Nudges:** "closest to earning" — top ~5 non-secret locked ribbons by progress
  ratio (already returned by the engine) on the dashboard.

**API:** `GET /api/ribbons` extended — each ribbon gains `points`, `rarityPct`,
`newlyEarned`; response gains `trainerScore`, `rank`, `showcase`, `nearest[]`.
New: `PUT /api/ribbons/showcase` (set pinned ids), `POST /api/ribbons/seen` (ack
earn moments).

## 5. Versus, expanded

At `/versus/:a/:b` (handles). Depends on Phase F (routing + handles + public
profiles).

- **Rounds** (each scored, per-round winner): Strength (Σ rarity weight +
  shiny/level bonus), Diversity (type/gen breadth), Completion (dex %),
  **Shiny count**, **Ribbon score** (trainer points), **Rarity Crown** (whose
  single rarest owned mon wins).
- **Breakdown bars:** per-type (18) and per-generation (9) head-to-head — who
  owns more of each — as diverging bars.
- **Share card:** a polished result component (both trainers, per-round wins,
  overall verdict, witty templated line) laid out to screenshot; plus copy-link.
  (Image export is a later nicety; layout + copy-link now.)
- **Saved rivalries + rematch:** `rivalries` (userId, opponentHandle,
  lastResultJson, updatedAt); the profile lists past rivals with a rematch
  button.
- **Reuses** per-user stats aggregation (`stats.ts`): counts by type/gen, shiny,
  rarest, dex %. These helpers also serve the future stats dashboard.

## 6. Data model, API, engines, build order

**Migration (Drizzle):**
- `users.handle` (text, unique, nullable), `users.isPublic` (int, default 1).
- `user_ribbons` (userId, ribbonId, earnedAt, seenAt).
- `user_showcase` (userId, ribbonId, slot).
- `rivalries` (userId, opponentHandle, lastResultJson, updatedAt).

**Pure engines (testable, no I/O):** extend `ribbons/catalog.ts` (families,
points, icon-family tags); new `stats.ts` (per-user aggregation) and `versus.ts`
(rounds + wit); client `ribbonIcon.ts` (icon resolution).

**Build order — each shippable:**
- **A. Type iconography** (no deps): palette + `TypeIcon` + icon-only chips
  everywhere.
- **B. Ribbon icon system:** `RibbonFrame`/`RibbonIcon` + assets + apply to
  existing catalog.
- **C. Catalog expansion:** new families + easter eggs; extend
  `CollectionSummary` + aggregation + priors sets.
- **D. Incentive backend:** `user_ribbons` sync, points/rank, rarity%, showcase,
  earn-moment diff, nudges + endpoints.
- **E. Incentive UI:** dashboard featured ribbons, showcase picker, rank, earn
  moment, nudges, rarity% on cards.
- **F. Routing + handles + public profile** (lean Flex Layer Part 3; prerequisite
  for G): client router, `handle`/`isPublic` migration, `/u/:handle`.
- **G. Versus expansion:** rounds, breakdowns, share card, rivalries; stats
  aggregation helpers.

**Tests:** new ribbon families evaluate correctly (incl. natures/balls/level/IV);
points/rank thresholds; rarity% math; showcase validation (only earned);
handle uniqueness/validation; public/private access (private → 404, no email
leak); versus rounds + winner; icon resolution rules; palette adoption doesn't
break `getContrastText`.

## Non-goals

Following/friends, global leaderboards, comments. Multi-way Versus (1v1 only).
Image export of the share card (layout + copy-link only for now). True
game-specific regional Pokédex membership (using generation as the proxy).

# PokeFlexDex — Flex Layer Design Spec

**Date:** 2026-07-14
**Status:** Approved ("keep going"); build all sub-features.

## Summary

Turn PokeFlexDex into something you show off. Add: a **scarcity-based rarity
engine** (Common→Legendary), a **stats dashboard** (WoW-pet-guide style: big
numbers, donut charts, distributions, filterable table), **public profiles**
at a shareable `/u/:handle` (with a private toggle), a **Versus** compare mode
(Strength / Diversity / Completion + witty verdicts), and a **redesigned
homepage**. Requires adding real URL routing (the app currently uses in-page
tabs).

## Build order (each shippable)

1. **Rarity engine** — assign each species a tier; expose via API; badges on cards.
2. **Stats dashboard** — the profile home content (charts + numbers + table).
3. **Public profiles + routing** — handles, `/u/:handle`, public read API, private toggle.
4. **Versus** — `/versus/:a/:b` compare with metrics + wit.
5. **Homepage redesign** — livelier landing.

---

## 1. Scarcity rarity engine

Each **species** gets a tier: `common | uncommon | rare | epic | legendary`.

**Scarcity signal:** `ownershipRate = (# distinct users who own ≥1 of the species) / max(totalUsers, 1)`. Rarer = lower ownershipRate.

**Low-population blend (so tiers are meaningful at N=1):** blend the observed rate toward a **baseline rarity prior** with a weight that fades as the user base grows:
- `prior(species)` in [0,1] from light traits: legendary/mythical/ultra-beast → very rare (≈0.02); pseudo-legendaries & base-stat-total ≥ 600 → rare (≈0.08); BST ≥ 500 → ≈0.25; fully-evolved → ≈0.5; else → common (≈0.85). (We don't have BST/legendary flags in the DB yet — derive a proxy from what we have: forms/evolution isn't stored either, so use a **curated legendary/mythical id list** + generation/first-in-line heuristics; keep it in a small data module. Where unknown, default mid.)
- `blended = w * ownershipRate + (1 - w) * prior`, where `w = totalUsers / (totalUsers + K)` with `K ≈ 25` (so at 1 user w≈0.04 → mostly prior; at 100 users w≈0.8 → mostly real scarcity).
- **Tiers** by fixed thresholds on `blended` (rarer = smaller): e.g. `<0.05 legendary, <0.15 epic, <0.35 rare, <0.6 uncommon, else common`. Tuned so the distribution is sane.

**Rarity weight** (for Versus strength): legendary 100, epic 40, rare 15, uncommon 5, common 1.

**API:** `GET /api/rarity` → `{ tiers: Record<speciesId, tier>, computedAt }` (or fold the tier into the species DTO). Computed from one aggregate ownership query + the prior; cached in memory with a short TTL. Pure `computeRarity(ownershipCounts, totalUsers, priors)` unit-tested.

**UI:** a small colored rarity badge on species + collection + event cards (rarity color scale: common grey, uncommon green, rare blue, epic purple, legendary gold).

## 2. Stats dashboard (profile home)

The content shown on a user's dex home + their public profile. Uses the collection + rarity.

- **Big numbers:** Unique species owned, Total specimens, Shinies, Completion % (owned/total dex), and a couple mini bars.
- **Donut charts (inline SVG, themed):** by **Type** (18 type colors), by **Rarity** (5 tiers), **Collected of all** (owned vs remaining dex).
- **Distribution bar chart:** owned species per **generation** (1–9).
- **Filterable collection table:** name, dex#, rarity, types, shiny, level, box — client-side filter/sort (reuse existing search).
- Charts are hand-rolled inline SVG (no external chart lib; CSP-safe), accessible (title/aria), light/dark. Follow the dataviz palette approach.

**API:** `GET /api/stats?owner=<handle|me>` → aggregated stats for a user (counts by type, by rarity, by generation, totals, completion) computed server-side (efficient aggregate queries) so the dashboard doesn't ship the whole collection just for charts. The table can page via the existing collection endpoint.

## 3. Public profiles + routing

- **Handle:** users set a unique `handle` (slug: `[a-z0-9_-]{3,20}`), stored on `users`. Settings page gains a handle field + availability check. `isPublic` boolean on `users` (default true), with a **private toggle** in Settings.
- **Routing:** add a lightweight client router (URL-driven) — routes: `/` (home), `/dex` (species), `/events`, `/me` (own dashboard, auth), `/collection`, `/ribbons`, `/settings`, `/u/:handle` (public profile), `/versus/:a/:b`. The Worker already serves the SPA for all paths; the client reads `location.pathname`. Keep existing views; migrate tab state to routes. Use a minimal router (a tiny custom one or `wouter`-style) — no heavy dependency required; a small `useRoute` hook is fine.
- **Public read API (no auth):** `GET /api/u/:handle` → `{ handle, displayName, isPublic, stats, }` and `GET /api/u/:handle/collection` (paged) — only if `isPublic`; else 404. Never expose email or private data.
- **Public profile page** `/u/:handle`: the stats dashboard (section 2) for that user, read-only, with a "Compare with me" button (→ Versus) and share affordance. Respects private (shows "This trainer's dex is private").

## 4. Versus

- **Route:** `/versus/:a/:b` (handles). A compare screen fetching both users' stats.
- **Metrics (each 0–100 or a raw + normalized pair):**
  - **Strength** = Σ rarity weight over owned species (+ small bonuses: shiny ×1.5, high level). Higher = stronger collection.
  - **Diversity** = coverage breadth: (# distinct types fully-ish represented + # generations touched + spread) → a breadth score.
  - **Completion** = owned unique species / total dex %.
- **Presentation:** side-by-side stat bars per metric, a per-metric winner, an overall winner, and **witty verdicts** (a small templated generator: e.g. "{A} flexes {d}% more Strength", "{B} has touched more grass — literally, more Grass-types", "Completion: {A} {x}% vs {B} {y}% — {loser} has some catching up to do"). Wit is templated from the computed diffs; keep it light and kind.
- A "Versus" entry from a profile ("Compare with me") and a manual handle-vs-handle picker.

## 5. Homepage redesign

Replace the current hero with a livelier landing: an animated **shiny sprite showcase** or rotating featured Pokémon, headline + a few **global stat highlights** (e.g. total species tracked, events, your completion if signed in), and clear CTAs ("Build your dex" / "Flex your dex" → profile). Keep the design system; light/dark; responsive; reduced-motion respected.

## Architecture notes

- Same stack. New: `users.handle` (unique, nullable), `users.isPublic` (default 1) via migration. New routes `rarity.ts`, `stats.ts`, `public-profile.ts`, `versus.ts` (or fold versus into stats/public). Pure engines: `rarity.ts` (computeRarity), `stats.ts` aggregation helpers, `versus.ts` (computeVersus + wit). Client router module. Chart components (Donut, BarChart, StatTile) as reusable SVG.
- Tests: rarity tiering (prior blend at low/high N), stats aggregation, versus metrics + winner, handle validation/uniqueness, public/private access (private → 404, no email leak), routing.

## Constraints

- Cloudflare Workers (no Node-only APIs); TS strict; `tsc -b`. Migrations for schema. Public endpoints must never leak email/private data; respect `isPublic`. Reuse design system; charts inline-SVG (no external chart lib); light/dark; a11y; reduced-motion. Rarity computed from live data + prior blend; no fabrication.

## Out of scope (for now)

- Following/friends, leaderboards, comments. (Versus is direct compare only.)
- Real-time rarity recompute on every write (cache with TTL is fine).

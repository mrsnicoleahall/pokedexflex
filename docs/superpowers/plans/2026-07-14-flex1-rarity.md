# Flex Layer Part 1 — Rarity Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Assign every species a scarcity-based rarity tier (Common→Legendary), blended with a baseline prior so it's meaningful at low population, expose it via the API, and show a rarity badge on cards.

**Architecture:** A pure `computeRarity` engine over live ownership counts + a curated baseline prior, called by a cached `/api/rarity` route and folded into the species DTO. A rarity badge renders on cards using a 5-tier color scale.

**Tech Stack:** Cloudflare Workers, D1/Drizzle, Hono; React/TS; Vitest.

## Global Constraints

- Cloudflare Workers runtime (no Node-only APIs); TS strict; `tsc -b` of record.
- Rarity = blend of live ownership scarcity + baseline prior; no fabrication. Deterministic + pure engine (unit-tested). No N+1 (one aggregate ownership query). Reuse design system; light/dark.
- Tiers: `common | uncommon | rare | epic | legendary`. Rarity weights (for later Versus): legendary 100, epic 40, rare 15, uncommon 5, common 1.

---

### Task 1: Rarity priors + pure compute engine

**Files:** Create `src/worker/rarity/priors.ts`, `src/worker/rarity/compute.ts`; Test `tests/worker/rarity.test.ts`.

**Interfaces (Produces):**
- `type RarityTier = "common"|"uncommon"|"rare"|"epic"|"legendary"`.
- `priors.ts`: curated id sets — `LEGENDARY_IDS: Set<number>` (all legendaries/mythicals/ultra beasts/paradox, gens 1–9), `PSEUDO_IDS: Set<number>` (Dragonite 149, Tyranitar 248, Salamence 373, Metagross 376, Garchomp 445, Hydreigon 635, Goodra 706, Kommo-o 784, Dragapult 887, Baxcalibur 998), `STARTER_FINAL_IDS: Set<number>` (final-stage starters across gens). `priorRate(speciesId): number` in [0,1] where rarer = smaller: legendary → 0.02, pseudo → 0.08, starter-final → 0.30, else → 0.75. (Lower prior = rarer baseline.)
- `compute.ts`: `computeRarity(args: { speciesIds: number[]; ownershipCounts: Map<number,number>; totalUsers: number }): Map<number, RarityTier>`. For each speciesId: `rate = totalUsers>0 ? (ownershipCounts.get(id)??0)/totalUsers : 0`; `w = totalUsers/(totalUsers+25)`; `blended = w*rate + (1-w)*priorRate(id)`; tier by thresholds on `blended` (rarer=smaller): `<0.05 legendary, <0.15 epic, <0.35 rare, <0.60 uncommon, else common`. Also export `RARITY_WEIGHT: Record<RarityTier, number>` = {legendary:100, epic:40, rare:15, uncommon:5, common:1} and `RARITY_ORDER`.

- [ ] **Step 1: failing tests** (pure): with `totalUsers:0` (nobody) → a legendary-id gets "legendary"/"epic" (prior-driven, rare) and a plain id gets "common"/"uncommon"; with `totalUsers:100` and a plain species owned by only 2 users (rate 0.02) → it becomes "legendary"/"epic" (scarcity now dominates, w≈0.8); a species owned by all 100 → "common". Assert `RARITY_WEIGHT.legendary===100`.
- [ ] **Step 2:** run → FAIL. **Step 3:** implement priors + compute (include the real legendary id list — mythicals/UBs/paradox too; be reasonably complete for gens 1–9). **Step 4:** run → PASS; `tsc -b` 0; suite pass. **Step 5: commit** `feat: rarity priors + scarcity compute engine`.

---

### Task 2: Rarity API + species DTO integration

**Files:** Create `src/worker/routes/rarity.ts`; Modify `src/worker/routes/species.ts` (add `rarity` to DTO), `src/worker/index.ts`; Test `tests/worker/rarity-route.test.ts`.

**Interfaces:** A shared `getRarityMap(db): Promise<Map<number,RarityTier>>` that: counts distinct owners per species (`SELECT species_id, COUNT(DISTINCT user_id) FROM specimens GROUP BY species_id`), counts total users, loads all species ids, calls `computeRarity`, and caches the result in-module with a short TTL (e.g. 60s). `GET /api/rarity` → `{ tiers: Record<number, RarityTier> }`. The species list/detail DTO gains `rarity: RarityTier` (look up from the map). Keep existing fields.

- [ ] **Step 1: failing test**: seed species + a couple users owning specimens (via sign-in + collection POST, or direct inserts); `GET /api/rarity` → tiers map covers seeded species; `GET /api/species?q=...` → items include a `rarity` field. (A legendary-id species reads rarer than a common one.)
- [ ] **Step 2:** FAIL. **Step 3:** implement `getRarityMap` (cached) + route + species DTO; mount. **Step 4:** PASS; `tsc -b` 0; suite pass. **Step 5: commit** `feat: rarity API + species DTO rarity`.

---

### Task 3: Rarity badge UI

**Files:** Modify `src/react-app/theme.ts` (RARITY_COLORS), `src/react-app/components/PokemonCard.tsx`, `src/react-app/api.ts` (SpeciesDto gains rarity), `src/react-app/styles.css`; (collection/event cards if they show species).

**Interfaces:** `RARITY_COLORS: Record<RarityTier,string>` (common #9aa3af grey, uncommon #3fbf6f green, rare #3e9bff blue, epic #a855f7 purple, legendary #f6c64b gold). A small `.rarity-badge` on each card (corner pill, tier-colored, label like "RARE"). `SpeciesDto.rarity` typed.

- [ ] **Step 1:** add `rarity` to `SpeciesDto` in api.ts; add `RARITY_COLORS` + a `rarityLabel` helper in theme.ts.
- [ ] **Step 2:** render a rarity badge on `PokemonCard` (top-right corner pill; don't collide with the owned badge — stack or place opposite). Add `.rarity-badge` styles (tier color bg, readable text, small). Apply to event cards too if trivial.
- [ ] **Step 3: VERIFY** `tsc -b` 0; suite pass; `npm run build` clean. Do NOT start a dev server (the controller keeps one running and will screenshot). **Commit** `feat: rarity badges on cards`.

---

## Self-Review

- Scarcity + prior blend, meaningful at N=1 and scaling with population → Task 1. ✅
- Rarity via API + on species DTO, cached, no N+1 → Task 2. ✅
- Rarity badge on cards with tier colors → Task 3. ✅
- `RarityTier`/`RARITY_WEIGHT`/`computeRarity`/`getRarityMap` consistent across tasks; weights ready for Versus (Part 4). ✅

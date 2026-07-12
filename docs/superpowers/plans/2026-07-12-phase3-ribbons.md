# PokeFlexDex Phase 3 — Achievement Ribbons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Reward collection milestones with app-granted achievement ribbons, computed from the user's collection — including form-set completion ribbons (all Vivillon patterns, all Furfrou trims, etc.) — surfaced on a Ribbons page.

**Architecture:** A pure, testable ribbon engine (`computeRibbons(summary, reference)`) evaluates a static catalog against a summary of the user's collection. A `GET /api/ribbons` route builds that summary from the user's specimens + reference data (species gen/types, form sets) and returns each ribbon with earned/progress. A React Ribbons page renders earned + locked-with-progress. Reuse the design system.

**Tech Stack:** Cloudflare Workers, D1, Drizzle, Hono; Vite/React/TS; Vitest.

## Global Constraints

- Cloudflare Workers runtime (no Node-only APIs); TS strict; `tsc -b` of record.
- Ribbons are **derived** from the collection on read (no stored earned-state). Achievement ribbons are distinct from in-game specimen ribbons (Phase 2).
- Works logged-out too: no user → empty collection summary → all ribbons locked at 0 progress (no 401; the page invites sign-in).
- No N+1: at most a couple of aggregate queries per request. Reuse the design system; light/dark; responsive; a11y.

## Ribbon catalog (computed by the engine)

- **Living Dex Master** — own all species (target = total species count).
- **Gen Cleared** ×9 — own every species in generation N (one ribbon per gen 1–9; target = species count in that gen).
- **Type Master** ×18 — own every species of type T (one per type; target = species count of that type).
- **Shiny Hunter** — tiers at 10 / 50 / 100 shiny specimens.
- **Form Fanatic** — own all Mega forms; all regional forms; all Gigantamax forms (three ribbons; targets from the forms table by formType).
- **Form-Set Completion** — for each species that has ≥ 4 forms in the `forms` table, a "Complete {Species} Forms" ribbon (own every form of that species). This auto-generates ribbons for Vivillon, Furfrou, Unown, Alcremie, and other many-form species.
- **Event Collector** — tiers at 10 / 50 / 100 owned event Pokémon.
- **Complete Dex + Forms** — the grand ribbon: own all species AND all forms.

## File Structure

```
src/worker/ribbons/catalog.ts     # ribbon definitions + computeRibbons() (pure)
src/worker/routes/ribbons.ts       # GET /api/ribbons (builds summary + reference, calls engine)
src/worker/index.ts                # mount
src/react-app/api.ts               # fetchRibbons() + RibbonDto
src/react-app/pages/Ribbons.tsx    # ribbons page
src/react-app/App.tsx              # wire Ribbons view
src/react-app/styles.css           # ribbon card + progress styles
tests/worker/ribbons.test.ts
```

---

### Task 1: Ribbon catalog + compute engine (pure)

**Files:** Create `src/worker/ribbons/catalog.ts`; Test `tests/worker/ribbons.test.ts`.

**Interfaces (Produces):**
- `type CollectionSummary = { speciesIds: Set<number>; formIds: Set<number>; shinyCount: number; eventCount: number }`.
- `type ReferenceData = { species: { id: number; generation: number; types: string[] }[]; forms: { id: number; speciesId: number; formType: string }[]; speciesNames: Map<number,string> }`.
- `type RibbonResult = { id: string; name: string; description: string; category: string; earned: boolean; progress: { current: number; total: number } }`.
- `computeRibbons(summary: CollectionSummary, ref: ReferenceData): RibbonResult[]` — pure; builds the whole catalog above and evaluates each. For a "own all of set S" ribbon, `current = |ownedIds ∩ S|`, `total = |S|`, `earned = current === total && total > 0`.

- [ ] **Step 1: failing tests** in `tests/worker/ribbons.test.ts` (unit, no DB): construct a small `ReferenceData` (a few species across 2 gens/types; a species with 4 forms as a form-set; some mega forms) and summaries, assert:
  - empty summary → every ribbon `earned:false`, `progress.current:0`.
  - owning all species of gen 1 → the "Gen 1 Cleared" ribbon `earned:true` with `current===total`.
  - owning all forms of the 4-form species → its form-set ribbon earned; partial → not earned with correct current/total.
  - shinyCount 10 → Shiny Hunter (10) earned, (50) not.
  - a type fully owned → that Type Master earned.
- [ ] **Step 2:** run → FAIL. **Step 3:** implement `catalog.ts` (deterministic ribbon ids like `gen-1`, `type-fire`, `shiny-10`, `formset-{speciesId}`, `form-fanatic-mega`, `living-dex`, `event-10`, `complete-dex-forms`; stable ordering). **Step 4:** run → PASS; `tsc -b` 0; suite pass. **Step 5: commit** `feat: achievement ribbon catalog + compute engine`.

---

### Task 2: GET /api/ribbons route

**Files:** Create `src/worker/routes/ribbons.ts`; Modify `src/worker/index.ts`; Test `tests/worker/ribbons.test.ts` (add route cases).

**Interfaces:** `GET /api/ribbons` → `{ ribbons: RibbonResult[], earnedCount: number, total: number }`. Builds `CollectionSummary` from the current user's specimens (via `getCurrentUser`; null → empty summary): `speciesIds` = distinct speciesId; `formIds` = distinct non-null formId; `shinyCount` = count of specimens with isShiny=1; `eventCount` = count of distinct owned event names (isEvent=1). Builds `ReferenceData` from `species` (id, generation, types parsed) + `forms` (id, speciesId, formType) + species names. Calls `computeRibbons`. No N+1 (one query each for specimens-agg + species + forms).

- [ ] **Step 1: failing test**: signed-in user (sign-in helper from collection.test.ts), seed a couple species + forms; with no specimens → `earnedCount:0`; after POSTing specimens to own all of a small type/gen set → that ribbon shows earned in the response; logged-out → 200 with all locked (no 401).
- [ ] **Step 2:** FAIL. **Step 3:** implement route + mount `app.route("/api/ribbons", ribbonRoutes)`. **Step 4:** PASS; `tsc -b` 0; suite pass. **Step 5: commit** `feat: ribbons API endpoint`.

---

### Task 3: Ribbons page UI

**Files:** Modify `src/react-app/api.ts`, `App.tsx`, `styles.css`; Create `src/react-app/pages/Ribbons.tsx`.

**Interfaces:** `api.ts`: `RibbonDto = RibbonResult`; `fetchRibbons(): Promise<{ribbons: RibbonDto[]; earnedCount:number; total:number}>` (credentials include). `Ribbons` page renders a summary ("{earnedCount} / {total} ribbons earned"), then ribbon cards grouped by category: **earned** ribbons rendered vibrantly (color/gradient accent, a ✓ or shine), **locked** ones muted with a progress bar (`current / total`) and the description. Reuse design tokens; responsive; light/dark; a11y (progress bars have aria-valuenow/max).

- [ ] **Step 1:** add `fetchRibbons` + type to api.ts.
- [ ] **Step 2:** build `Ribbons.tsx` (summary + grouped ribbon cards + progress bars; earned vs locked styling; logged-out still shows the catalog all-locked with a gentle "Sign in and start collecting to earn these" note).
- [ ] **Step 3:** wire the "Ribbons" view in `App.tsx` (reachable from AccountMenu + Home quick links — replace the placeholder). Add ribbon-card + progress styles to `styles.css`.
- [ ] **Step 4: VERIFY** `tsc -b` 0; suite pass; `npm run build` clean. **Commit** `feat: ribbons page`.

---

## Self-Review

- All ribbon categories incl form-set completion (Vivillon/Furfrou via ≥4-forms rule) → Task 1. ✅
- Computed from collection, logged-out safe, no N+1 → Tasks 1–2. ✅
- Ribbons page (earned + locked-with-progress + summary) → Task 3. ✅
- Type consistency: `CollectionSummary`/`ReferenceData`/`RibbonResult`/`computeRibbons`, `RibbonDto`/`fetchRibbons` used consistently. ✅
- Distinct from in-game specimen ribbons (Phase 2) — different module/route/page. ✅

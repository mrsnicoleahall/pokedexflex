# PokeFlexDex Sprites & Visual Redesign Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Serve large Pokémon HOME sprites for every species and form from our own R2 (lazily cached, free-tier, no bulk upload), and redesign the catalog UI into a distinctive, beautiful, user-friendly "living dex."

**Architecture:** A Worker route proxies + lazily caches HOME sprites into an R2 bucket (fetch from PokéAPI once → store in R2 → serve from R2 thereafter), so the git repo stays lean and it works in local dev and prod. Species/forms gain a `homeId` (the PokéAPI pokemon id whose HOME render to use). The React app is restyled around a type-aura card grid with a shared design system.

**Tech Stack:** Cloudflare Workers + R2 + D1/Drizzle + Hono; Vite/React/TS; @fontsource (self-hosted fonts); Vitest.

## Global Constraints

- Cloudflare Workers runtime (no Node-only APIs in Worker code); TypeScript strict; typecheck of record `tsc -b`.
- LOCAL only for now (no Cloudflare login/deploy). Miniflare auto-creates the local R2 bucket from the binding; the lazy-cache route needs NO credentials and NO bulk upload.
- Sprites: **Pokémon HOME renders.** Source of record: PokéAPI sprite repo
  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/home/{id}.png`
  and shiny `.../home/shiny/{id}.png`. Only numeric ids are proxied (no open proxy).
- Do NOT hotlink sprites in the UI; the UI always requests our own `/sprites/...` route.
- Accessibility floor: responsive to mobile, visible keyboard focus, `prefers-reduced-motion` respected, light + dark themes.
- Do NOT commit sprite binaries to git (they live in R2 / local R2 state, which is gitignored).

## Design Tokens (authoritative — implement exactly, then iterate via screenshots)

**Palette — neutrals**
- Light: canvas `#F5F7FA`, surface `#FFFFFF`, ink `#14171F`, muted `#5B6472`, hairline `#E3E8EF`.
- Dark: canvas `#0E1116`, surface `#171B22`, ink `#EAF0F7`, muted `#8A94A6`, hairline `#232935`.

**Palette — 18 type colors** (the identity; used for auras + chips). Implement as a `TYPE_COLORS` map:
normal `#9AA3AF`, fire `#FF7A3C`, water `#3E9BFF`, grass `#3FBF6F`, electric `#F6C64B`, ice `#67D2E0`, fighting `#E0603E`, poison `#B463D6`, ground `#E0B24A`, flying `#8FB7FF`, psychic `#FF6DA6`, bug `#96C22E`, rock `#C9B472`, ghost `#7A6BC4`, dragon `#6A5BE0`, dark `#5A5566`, steel `#7F99B0`, fairy `#F49AE0`.

**Type**
- Display: `Sora` (600/700) — headings, wordmark, names.
- Body: `Inter` (400/500).
- Mono: `JetBrains Mono` (500) — dex numbers (`#0006`), trainer IDs, IVs.
- Self-host via `@fontsource/sora`, `@fontsource/inter`, `@fontsource/jetbrains-mono` (no external requests).

**Layout**
- Slim sticky top bar: wordmark (left) · Species | Events tabs (center/left) · search box + generation filter (right) · theme toggle.
- Responsive card grid: `grid-template-columns: repeat(auto-fill, minmax(200px, 1fr))`, ~16px gap.
- Card: type-aura background (radial gradient of primary type color at low alpha; dual-type = two-stop blend), large HOME sprite centered (min ~140px, `image-rendering:auto`), mono dex `#0006` top-left, display name, type chips row. Hover: `translateY(-4px)`, soft shadow, sprite scales ~1.04 (disabled under reduced-motion).

**Signature:** the type-aura card grid — a scannable, colorful mosaic where color encodes type. Keep all other chrome quiet.

## File Structure

```
src/worker/routes/sprites.ts     # GET /sprites/home/:id and /sprites/home/shiny/:id (R2 lazy-cache)
wrangler.jsonc                   # ADD r2_buckets binding SPRITES = "pokeflexdex-sprites"
src/db/schema/reference.ts       # ADD species.homeId, forms.homeId (int, nullable)
scripts/fetch-pokeapi.ts         # ALSO record homeId (pokemon id for HOME) for species + forms
data/pokeapi-snapshot.json       # regenerated with homeId
scripts/build-seed.ts            # include home_id in generated seed
src/react-app/theme.ts           # TYPE_COLORS, neutral tokens, helpers (typeAura(), etc.)
src/react-app/styles.css         # design tokens as CSS vars (light/dark), base + grid + card + chip + toolbar
src/react-app/components/        # PokemonCard.tsx, TypeChip.tsx, TopBar.tsx, ThemeToggle.tsx
src/react-app/pages/SpeciesCatalog.tsx   # restyled to the card grid
src/react-app/main.tsx           # import fonts + styles
tests/worker/sprites.test.ts
tests/db/schema.test.ts          # homeId columns
```

---

### Task 1: R2 sprite service (lazy-cache proxy)

**Files:** `wrangler.jsonc` (add R2 binding `SPRITES`), `src/worker/routes/sprites.ts`, mount in `src/worker/index.ts`; Test `tests/worker/sprites.test.ts`.

**Interfaces:** `GET /sprites/home/:id` and `GET /sprites/home/shiny/:id` (`:id` numeric, else 400). Behavior: build R2 key `home/{id}.png` (or `home/shiny/{id}.png`); if `env.SPRITES.get(key)` hits → stream with `Content-Type: image/png` + `Cache-Control: public, max-age=31536000, immutable`; else fetch the PokéAPI home URL; on 200 → `env.SPRITES.put(key, body)` and stream; on upstream 404 → 404 JSON `{error:"not_found"}`.

- [ ] **Step 1: Add R2 binding** to `wrangler.jsonc`: `"r2_buckets": [{ "binding": "SPRITES", "bucket_name": "pokeflexdex-sprites" }]`. Run `npm run cf-typegen` (or `wrangler types`) so `Env.SPRITES` is typed; `npx tsc -b` → 0.
- [ ] **Step 2: Write failing test** `tests/worker/sprites.test.ts`: stub `globalThis.fetch` to return a small fake PNG (200) for the PokéAPI URL. Request `/sprites/home/6` → 200, `content-type: image/png`. Assert the object now exists in `env.SPRITES` (`await env.SPRITES.get("home/6.png")` non-null). Second request with fetch stubbed to THROW → still 200 (served from R2, proving cache). A non-numeric id → 400. Use `cloudflare:test` `env` (R2 binding is local/in-memory in the pool).
- [ ] **Step 3: Run** `npx vitest run tests/worker/sprites.test.ts` → FAIL (route missing).
- [ ] **Step 4: Implement** `src/worker/routes/sprites.ts` and mount `app.route("/sprites", spriteRoutes)` in `index.ts`. Validate `:id` is a positive integer. Use the generated global `Env`.
- [ ] **Step 5: Run test** → PASS. `npx tsc -b` → 0. Full suite → pass.
- [ ] **Step 6: Commit** `feat: R2 lazy-cache sprite service for HOME renders`.

---

### Task 2: Enrich species & forms with HOME ids

**Files:** `src/db/schema/reference.ts` (add `homeId`), `scripts/fetch-pokeapi.ts`, `data/pokeapi-snapshot.json` (regenerate), `scripts/build-seed.ts`, `data/seed.sql` (regenerate), new migration; Tests `tests/db/schema.test.ts` + `tests/scripts/build-seed.test.ts`.

**Interfaces:** `species.homeId` (int, nullable) = pokemon id for the species' HOME render (defaults to `species.id`). `forms.homeId` (int, nullable) = the form variety's pokemon id, or null → UI falls back to the species sprite. `snapshotToSql` emits `home_id`.

- [ ] **Step 1:** Add `homeId` to the `species` and `forms` schema; `npx drizzle-kit generate` (new migration); `npx tsc -b` → 0. Update the `tests/db/schema.test.ts` reference-insert cases to include `homeId` where relevant and assert it round-trips.
- [ ] **Step 2:** Extend `scripts/fetch-pokeapi.ts`: for each species record `homeId = <default variety pokemon id>` (usually the species id); for each extra form record `homeId = <that variety's pokemon id>`. Keep the existing polite rate-limiting + entry guard. Re-generate `data/pokeapi-snapshot.json` (`npx tsx scripts/fetch-pokeapi.ts`). Spot-check: charizard species `homeId` 6; `charizard-mega-x` form has a distinct `homeId`.
- [ ] **Step 3:** Update `scripts/build-seed.ts` `snapshotToSql` to emit `home_id` for species and forms (NULL when absent). Extend `tests/scripts/build-seed.test.ts` to assert `home_id` appears and NULL is a bare `NULL`. Regenerate `data/seed.sql`.
- [ ] **Step 4:** Update the species API `shape()` and DTOs to include `homeId` (species) and `homeId` per form so the UI can build sprite URLs. Keep existing fields.
- [ ] **Step 5:** `npm run db:local` (re-seed) — verify species/forms still 1025/326 and a spot-check row has home_id. `npx tsc -b` → 0; `npx vitest run` → all pass.
- [ ] **Step 6: Commit** `feat: capture HOME sprite ids for species and forms`.

---

### Task 3: Design system + beautiful species catalog

**Files:** `src/react-app/theme.ts`, `src/react-app/styles.css`, `src/react-app/components/{TypeChip,PokemonCard,TopBar,ThemeToggle}.tsx`, `src/react-app/pages/SpeciesCatalog.tsx`, `src/react-app/main.tsx`, `package.json` (@fontsource deps).

**Interfaces:** `TYPE_COLORS: Record<string,string>`; `typeAura(types: string[]): string` (CSS background); `<TypeChip type>`; `<PokemonCard species>` (uses `/sprites/home/:homeId`); `<TopBar>` with search + gen filter + tabs + theme toggle. Sprite `src` = `/sprites/home/${homeId}` (shiny variant later).

- [ ] **Step 1:** Install fonts: `npm i @fontsource/sora @fontsource/inter @fontsource/jetbrains-mono`. Import the needed weights in `main.tsx`.
- [ ] **Step 2:** Create `styles.css` with CSS variables for the neutral tokens (light default + `@media (prefers-color-scheme: dark)` + a `[data-theme]` override), base reset, and classes for `.toolbar`, `.grid`, `.card`, `.chip`. Create `theme.ts` with `TYPE_COLORS` and `typeAura()`.
- [ ] **Step 3:** Build `TypeChip`, `PokemonCard` (type-aura bg, large sprite via our route with `loading="lazy"` + `alt`, mono dex #, name, chips, hover lift gated by reduced-motion), `TopBar` (wordmark, Species/Events tabs [Events tab can route to a placeholder for now], debounced search, generation `<select>`, `ThemeToggle`).
- [ ] **Step 4:** Rewrite `SpeciesCatalog` to render the card grid using `fetchSpecies`, wire search + gen filter to the API, show a tasteful empty state ("No Pokémon match that search.") and a loading state. Keep the debounce cleanup + avoid setState-after-unmount.
- [ ] **Step 5:** VERIFY VISUALLY: `npm run db:local` then `npm run dev`; the controller will screenshot desktop + mobile, light + dark, and iterate on spacing/color/hover until it looks polished. `npx tsc -b` → 0; `npx vitest run` → all pass.
- [ ] **Step 6: Commit** `feat: type-aura living-dex redesign of the species catalog`.

---

## Self-Review

- Large HOME sprites for every species/form, hosted by us on R2 (lazy-cached, free) → Tasks 1–2. ✅
- Beautiful, user-friendly, distinctive (type-aura signature, not a templated default) → Task 3, verified via screenshots. ✅
- Repo stays lean (no sprite binaries committed); works in local dev with zero credentials → Task 1 (miniflare local R2). ✅
- Accessibility floor (responsive, focus, reduced-motion, light/dark) baked into Task 3. ✅
- Forms-first: forms get their own HOME id with graceful fallback → Task 2. ✅
- Events catalog will reuse this design system (its own plan, Tasks 2–5) so both surfaces feel like one product.

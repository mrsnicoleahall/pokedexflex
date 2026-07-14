# PokeFlexDex — Session Handoff (2026-07-14)

Paste-able context for continuing in a new chat.

## What this is
**PokeFlexDex** — a login-required web app to track your Pokémon collection: browse
every species/form + event distribution, track your own specimens, earn ribbons,
import/export, and (in progress) show off a public profile with a rarity-based
"flex" layer.

- **Repo:** `/Users/nicole/Projects/PokeWebBank` (folder name predates the product name)
- **GitHub:** https://github.com/mrsnicoleahall/PokeFlexDex — `origin/main` is the live branch
- **Run locally:** `npm run db:local` (migrate + seed) then `npm run dev` → http://localhost:5173
  - Sign in: enter any email; in dev the magic-link appears in the sign-in panel — click it.

## Stack
Cloudflare Workers + Hono (API) · D1 (SQLite via Drizzle ORM) · R2 (sprite cache) ·
Workers AI (photo import, deploy-only) · Vite + React + TS. Tests: Vitest +
`@cloudflare/vitest-pool-workers`. Typecheck of record: `tsc -b`. ~166 tests, all green.

## Git state (at handoff)
- `main` = `origin/main` = **38271c5** (everything below through "funny ribbons" is here + pushed).
- Working branch **`flex-layer`** @ **1526f78**, 4 commits ahead of main (Flex Layer in progress — NOT merged/pushed yet).

## DONE and shipped to main
- **Foundation:** species catalog (1,025 species, 554 forms incl. cosmetic sets like Vivillon/Furfrou/Unown), events catalog (**2,046** real Bulbapedia distributions), large Pokémon **HOME sprites** served from R2 (lazy-cached), type-aura card design, search/filters, light/dark, responsive.
- **Accounts:** passwordless magic-link (dev shows the link on-screen), signed session cookie, Settings, delete-account. Security-reviewed (single-use tokens hashed at rest, per-user scoping).
- **Collection:** full specimen CRUD (nickname/level/shiny/gender/nature/ability/item/ball/IVs/EVs/moves/OT/met/ribbons/box/notes), boxes, "My Collection" view, real per-user Owned badges.
- **Ribbons:** achievement ribbons (Living Dex, Gen ×9, Type ×18, Shiny tiers, Form-Fanatic, Form-Set completion incl. Vivillon/Furfrou, Event tiers, Grand) + **18 funny/secret easter-egg ribbons** (secret ones show as `???` until earned).
- **Import/Export:** manual add; **CSV import** (auto column-mapping); **JSON export + import** (handles our shape AND third-party `{catalogue}` automator shape, and strips UTF-8 BOM); **photo/HOME-SV screenshot import** (Workers AI — pipeline built + tested, activates on deploy); **USUM save-file import** (Gen 7 only). Verified with the user's real files: **Ultra Moon save → 847 imported**, **automator catalog → 4,834 imported**.

## IN PROGRESS: the "Flex Layer" (branch `flex-layer`)
- **Spec:** `docs/superpowers/specs/2026-07-14-flex-layer-design.md` (approved).
- **Progress ledger:** `.superpowers/sdd/flex-progress.md` (per-task briefs/reports alongside; `.superpowers/` is gitignored scratch).
- **Build order (5 parts, each shippable):**
  1. **Rarity engine** — DONE: pure scarcity+prior engine `src/worker/rarity/compute.ts` + `priors.ts` (fdc4f3a); `/api/rarity` route + `rarity` on species DTO, cached (1526f78). **REMAINING: Task 3 — rarity badge UI on cards** (plan: `docs/superpowers/plans/2026-07-14-flex1-rarity.md`, Task 3: add `RARITY_COLORS` to theme.ts, `.rarity-badge` on `PokemonCard`).
  2. **Stats dashboard** — NOT STARTED. WoW-pet-guide style: big numbers, donut charts (by type, by rarity, collected-of-all), generation bar chart, filterable table. Inline SVG charts (no external lib). Add `/api/stats`.
  3. **Public profiles + routing** — NOT STARTED. Add `users.handle` (unique) + `users.isPublic` (migration); add lightweight URL routing (app currently uses in-page tab state); public `GET /api/u/:handle` (+ /collection), page at `/u/:handle`; private toggle in Settings. Never leak email.
  4. **Versus** — NOT STARTED. `/versus/:a/:b`: Strength (Σ rarity weight + shiny/level bonus), Diversity (type/gen breadth), Completion (dex %), witty templated verdicts.
  5. **Homepage redesign** — NOT STARTED. Livelier landing (the current hero is "boring").

## Key decisions
- **Rarity = scarcity-based** (fewer PokeFlexDex owners = rarer) **blended with a baseline prior** (curated legendary/pseudo/starter id sets) so tiers are meaningful at 1 user and sharpen as users join. Tiers: common/uncommon/rare/epic/legendary. Weights (Versus strength): legendary 100, epic 40, rare 15, uncommon 5, common 1.
- **Profiles:** public handle at `/u/:handle` + a private toggle.
- **Save import:** USUM (Gen 7) only.

## Gotchas / must-remember
- **`npm run dev` requires `cloudflare({ remoteBindings: false })` in `vite.config.ts`** (already set) — the AI binding has no local simulator and otherwise forces an authenticated remote-proxy that breaks local dev.
- **D1 caps bound params at 100** → bulk inserts are chunked to ≤3 rows and run via `db.batch()` in groups of ~50. Large imports upload as **multipart** (not a JSON-string body, which hit a ~5.5 MB wall).
- **Strip a leading UTF-8 BOM** before parsing import content (real exporters add it; broke JSON.parse).
- **Photo/vision import + real Workers AI only work deployed** (or `wrangler dev --remote` after `wrangler login`).
- **USUM save parser** works on the real save (847 mons) but has **2 flagged assumptions** (EV byte order, form/gender bits @0x1D). Cross-check: the automator catalog has accurate IVs — e.g. Bulbasaur reads `iv_perfect` in the catalog but the save parse showed `atk=0`; investigate IV bit-unpack before trusting save IVs.
- Superpowers workflow used throughout: **brainstorming → writing-plans → subagent-driven-development** (fresh subagent per task + review). Plans/specs in `docs/superpowers/`; ledgers in `.superpowers/sdd/`.
- `.dev.vars` (gitignored) holds `SESSION_SECRET`.

## TODO / before going live
- **Deploy needs the user's Cloudflare login** (agent can't OAuth). Deploy also: activates Workers AI (photo import), lets you wire a real email provider (e.g. Resend) for prod magic-links, set the real D1 `database_id` in `wrangler.jsonc`, and create R2 buckets (`SPRITES`).
- **Rotate the R2 access key** that was pasted into the earlier chat (it's in that transcript) — do this in the Cloudflare dashboard.
- **Merge `flex-layer` → main** once the Flex Layer is complete (currently 4 commits ahead, unpushed).

## How to resume (new chat)
1. Read this file + the Flex Layer spec + `.superpowers/sdd/flex-progress.md`.
2. `git checkout flex-layer` (you're likely already on it), `npm run db:local && npm run dev`.
3. Continue: finish **Part 1 Task 3 (rarity badge UI)**, then Parts **2→5**. Use subagent-driven-development; keep one dev server on :5173 and have build subagents verify via `tsc -b`/tests/`npm run build` (not their own dev server).

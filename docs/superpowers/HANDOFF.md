# PokeFlexDex — Session Handoff (2026-07-15)

Paste-able context for continuing in a new chat. Supersedes the 2026-07-14 handoff.

## What this is
**PokeFlexDex** — a login-required web app to track your Pokémon collection: browse
every species/form + event distribution, track your specimens, earn ribbons, import/export,
and (in progress) a public "flex" layer with rarity, stats, profiles, and Versus.

- **Repo:** `/Users/nicole/Projects/PokeWebBank` (folder name predates the product name)
- **Working branch:** `flex-layer` @ **ca6dcc1** — NOT merged to `main` yet. All work committed.
- **Run locally:** `npm run db:local` (migrate + seed) then `npm run dev` → http://localhost:5173.
  Dev sign-in: enter any email; the magic-link appears on-screen — click it.
- **Stack:** Cloudflare Workers + Hono · D1 (Drizzle) · R2 (sprite cache) · Workers AI (photo import, deploy-only) · Vite + React + TS. Tests: Vitest + `@cloudflare/vitest-pool-workers`. **Verify of record: `npx tsc -b` + `npm run build` + `npx vitest run` (currently 263 passing).**

## The big arc: "Ribbons & Rivalry" expansion
- **Spec (approved):** `docs/superpowers/specs/2026-07-14-ribbons-and-rivalry-design.md`
- **DETAILED LIVING LEDGER (read this first to resume):** `.superpowers/sdd/flex-progress.md` — per-task commits, reviews, gotchas, and every accumulated MINOR finding. `.superpowers/` is gitignored scratch (persists on disk, not in git).
- **Workflow used throughout:** subagent-driven-development — one implementer subagent per task, an independent reviewer subagent per task, all tracked in the ledger. Plans in `docs/superpowers/plans/`.

### DONE this arc (all committed on flex-layer, each task reviewed clean)
- **Phase A — Type iconography:** documented 18-type palette adopted app-wide; `TypeIcon` (CSS-mask recolor); icon-only type chips everywhere. Assets: `assets/types/*.svg` → served from `public/types/`.
- **Phase B — Ribbon icon system:** recolorable rosette frame (`RibbonFrame` via shared `<symbol>`/`<use>` sprite in `RosetteSprite`), per-achievement glyph resolver (`src/react-app/ribbons/ribbonIconResolver.ts`), kawaii marquee pieces (`public/ribbons/`), `RibbonIcon`. Glyph centered at 48% of the medallion.
- **Phase C — Catalog expansion:** **75 → 166 ribbons.** New families: Regional dexes (per-gen), National-Dex % tiers, 8 rarity-class sets (`src/worker/ribbons/species-sets.ts`, Bulbapedia-verified), 10 Collector ribbons, type-master tiers, shiny deepening, 10 new easter eggs. Pure engine `src/worker/ribbons/catalog.ts`; aggregation in `src/worker/routes/ribbons.ts`.
- **Phase D — Incentive backend:** tables `user_ribbons` + `user_showcase` (migration 0006); pure `scoring.ts` (points/Trainer Score/rank); `incentive-store.ts`; `GET /api/ribbons` extended (points, rarityPct, newlyEarned, trainerScore, rank, showcase, nearest); `PUT /api/ribbons/showcase`; `POST /api/ribbons/seen`.
- **Phase E — Incentive UI (verified light+dark, signed-in):** `incentiveDisplay.ts`, `useRibbonsData` hook, `RankBadge`, `EarnMomentToast` (shows the ribbon's *criteria*, reveals just-earned secret names), `ShowcasePicker`, `TrophyWall`, `NudgeList`; rarity % + rare-flex on cards.
- **Side deliverables:** subtle app footer Cash App tip link `cash.app/$NicoleGetsTheStrap` (committed). Interactive **Versus + stats mockups** rendered via the `visualize` tool (WoW-Pet-Guide-style: dual stat bars, rarity/dex donuts, per-type/gen breakdown, head-to-head table, share card, spice-scaled trash-talk verdict pool) — this is the **visual spec** for the real Versus (G) + stats dashboard.
- **Build/tsconfig reconcile (ca6dcc1):** react-app tests now compile under a DOM-libbed `tests/tsconfig.react.json` (root references it; `tests/tsconfig.json` excludes `react-app`). **The old build-gate gotcha is RESOLVED** — react-app tests may import `api.ts` types freely now.

## REMAINING WORK (in order)

### Phase P — Trainer Profile  ← DO THIS NEXT (it's a Phase F prerequisite)
**Why:** the app shows the raw EMAIL as the display name ("this is simply not it"). Collect name + gender + photo + top-3 favorite mon.
- **Plan:** `docs/superpowers/plans/2026-07-14-flex-P-trainer-profile.md` — **COMPLETE (commit 08c6ba6), 7 tasks P1–P7 + Self-Review. Ready to execute** via subagent-driven-development (build gate is resolved, so react-app tests may import `api.ts` freely).
  - P1 migration+schema (`users.gender`, `users.avatar_key` → migration 0007) + `GET /api/auth/me` + client `UserDto`.
  - P2 `PUT /api/profile` (displayName + gender validated to `boy|girl|ditto`).
  - P3 avatar upload/serve (`POST /api/profile/avatar`, `GET /api/profile/avatar/:userId`) via R2 (`SPRITES` bucket, `avatars/{userId}` key).
  - P4 **top-3 favorite Pokémon** (`user_favorites` table → migration 0008 + `PUT /api/profile/favorites`; reuses `SpeciesPicker`).
  - P5 **required-onboarding gate** (`ProfileSetup`: name, gender, optional photo + favorites; wired via AuthProvider/App).
  - P6 **Settings profile editor**. P7 **display wiring** — TopBar/AccountMenu/Home show avatar + name (never email); favorites on the trainer card.
  - Plan risks to watch (from its Self-Review): no "remove photo" endpoint yet; 60s avatar cache-control → brief stale image after replace; a `Gender` cast in Settings relies on server validation; favorites kept out of the hot-path `CurrentUser`.
- **DECISIONS (locked):** gender options = **Boy / Girl / Ditto**. Onboarding = **required first step**. `users.display_name` already exists. Photo optional (initials fallback). Photo → R2.

### Phase F — Public profiles + routing (includes the custom URL)
Add lightweight URL routing (app currently uses in-page tab state); `users.handle` (unique) + `users.isPublic`; public `GET /api/u/:handle` (+ collection); page at `/u/:handle`. **User-EDITABLE custom handle** (the "customize the trailing /url" request — validate lowercase alnum+dashes, length, reserved-word blocklist, uniqueness; suggest an initial handle at onboarding). Public profile shows name + avatar + **top-3 favorites** + ribbon showcase + rank/score/stats — **never email**. Private toggle. Needs a spec/plan (author like the others).

### Phase G — Versus (real)
`/versus/:a/:b`: the mockup is the spec — 6 scored rounds (Strength, Diversity, Completion, Shiny, Ribbon score, Rarity Crown), per-type/gen breakdown, share card, saved rivalries, spice-by-margin trash-talk verdicts. Depends on F (handles/routing) + a per-user stats aggregator (`stats.ts`, not yet built).

### Homepage redesign — still pending (from the original Flex spec).

## Gotchas / must-remember
- **`npm run db:local` re-seeds and WIPES the sessions table → logs you out** in dev; sign in again. It can also hit a FK error on stale local D1 — fix by wiping `.wrangler/state` and re-running.
- **Migrations = `npx drizzle-kit generate`** (edit schema first), never hand-write SQL; `_journal.json` + snapshot auto-update. Next index: **0007**.
- **Browser-pane quirk:** screenshots go blank at non-zero scroll on long pages and `computer scroll` times out. Verify long pages via `resize_window` tall + `scrollTo(0,0)`, not scrolling.
- **Worker test files accumulate D1 state across `it()` blocks** (reset only between files) — assert deltas/unique ids, not absolute counts.
- `npm run dev` needs `cloudflare({ remoteBindings: false })` in `vite.config.ts` (already set) — the AI binding has no local simulator.
- Photo/vision import + real Workers AI only work deployed (or `wrangler dev --remote`). USUM save-import IV unpack has 2 flagged assumptions (see prior handoff/ledger).

## Before going live (unchanged)
- **Deploy needs the user's Cloudflare login** (agent can't OAuth). Deploy activates Workers AI, real email provider for magic-links, real D1 `database_id`, R2 buckets. **Rotate the R2 access key** pasted in an earlier chat.
- **Before merging flex-layer → main:** run one **final whole-branch code review** (the ledger lists all accumulated MINOR findings to triage — chip/CSS dead props, aria-hidden nits, hoisting RARITY_SETS, formset hue collisions, showcase cross-user test, etc.), then finish P/F/G.

## How to resume (new chat)
1. Read this file + the spec + `.superpowers/sdd/flex-progress.md` (the ledger has everything).
2. `git checkout flex-layer` (likely already there), `npm run db:local && npm run dev`.
3. **Finish the Phase P plan** (add onboarding gate + Settings + display wiring + Self-Review), then execute it via subagent-driven-development. Then Phase F (spec→plan→execute), then G.
4. Keep the ledger updated as you go; one dev server on :5173 for controller visual review; build subagents verify via tsc/tests/build (not their own dev server).

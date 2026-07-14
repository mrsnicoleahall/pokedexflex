# Flex Phase D — Ribbon Incentive Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the ribbon catalog (`computeRibbons`, ~115+ ribbons after Phase C) into a persistent incentive system: a `user_ribbons` table that remembers what a user has earned and when, a pure points/rank engine (Trainer Score), community rarity percentages, a 6-slot ribbon showcase, an earn-moment acknowledgment flow, and "closest to earning" nudges — all surfaced through an additively-extended `GET /api/ribbons` plus two new endpoints.

**Architecture:** Two new D1 tables via Drizzle (`user_ribbons`, `user_showcase`). A new **pure** module `src/worker/ribbons/scoring.ts` (points per ribbon, Trainer Score, rank title, "nearest" nudge selection) — no I/O, unit-tested in isolation, mirroring how `catalog.ts` stays pure. A new **impure** data-access module `src/worker/ribbons/incentive-store.ts` holds every DB touch for this phase (sync, rarity counts, showcase read/write, seen-ack) so `routes/ribbons.ts` stays a thin orchestrator, matching the existing `auth/session.ts` pattern (`type Db = ReturnType<typeof getDb>`). `GET /api/ribbons` is extended additively; two new routes (`PUT /api/ribbons/showcase`, `POST /api/ribbons/seen`) are added to the existing `ribbonRoutes` Hono group. Client-side, `src/react-app/api.ts` gets matching type + fetch-helper additions — no UI is built here (that's Phase E).

**Tech Stack:** Cloudflare Workers + Hono + Drizzle (D1); Vitest (`@cloudflare/vitest-pool-workers`) for pure-engine, data-access, and route tests; drizzle-kit for the migration. Depends on Phase C (`CollectionSummary`, full catalog) being in place — confirmed already merged (`src/worker/ribbons/catalog.ts` has `RibbonResult { id, name, description, category, earned, progress, secret? }` and 11 categories: `Grand, Regional, Completion, Type, Rarity Class, Collector, Forms, Form Sets, Shiny, Events, Fun`).

## Global Constraints

- **Pure stays pure.** `src/worker/ribbons/catalog.ts` is untouched by this phase. The new `src/worker/ribbons/scoring.ts` does **no** I/O — no DB, no `fetch`, no `env` — and is unit-tested by importing its functions directly, same as `catalog.ts`. Every DB touch for Phase D lives in `src/worker/ribbons/incentive-store.ts` or inline in `src/worker/routes/ribbons.ts`; nothing else.
- **Migration via drizzle-kit, applied the repo's existing way.** Edit `src/db/schema/user.ts`, then run `npx drizzle-kit generate` (no `--name` — every existing migration in `migrations/` used drizzle-kit's own auto-generated adjective_noun name; stay consistent). This appends `migrations/000N_<name>.sql` + `migrations/meta/000N_snapshot.json` + a new entry in `migrations/meta/_journal.json`. Do **not** hand-edit the generated files. `npm run db:local` must apply the new migration cleanly against local D1. Tests need no extra wiring: `vitest.config.ts` already reads every file under `migrations/` via `readD1Migrations` into the `TEST_MIGRATIONS` binding, and `tests/setup/apply-migrations.ts` applies them before each test file runs.
- **Never leak email or other users' data.** `rarityPct` is a pure aggregate (`count / totalUsers`) — safe to compute and return for every request, signed in or not. Showcase writes (`PUT /api/ribbons/showcase`) validate that every pinned id is (a) actually earned by *this* user (checked against `user_ribbons`, not trusted from the request) and (b) that the caller is authenticated (`requireUser`, 401 otherwise) — never another user's rows.
- **Additive only — don't break existing consumers.** `GET /api/ribbons` keeps `ribbons`, `earnedCount`, `total` exactly as-is; every new field (`points`, `rarityPct`, `newlyEarned` per ribbon; `trainerScore`, `rank`, `showcase`, `nearest` at the top level) is **added**, never renames or removes an existing key. `src/react-app/pages/Ribbons.tsx` and `RibbonDto` consumers must keep compiling and rendering unchanged (verified by `npx tsc -b` and the existing Ribbons page tests/behavior — no UI work happens in this phase).
- **Scope discipline.** This phase is the **signed-in user's own data only**. Do **not** add `users.handle` / `users.isPublic` / public profiles (`/u/:handle`) here — that's Phase F. Do **not** add `rivalries` or any Versus wiring — that's Phase G. Do not build dashboard/showcase-picker/toast UI — that's Phase E; this phase ends at the API/type boundary (`api.ts`).
- **No dev server.** Verify every task with `npx vitest run <path>`, `npx tsc -b`, and `npm run build`. Visual verification is out of scope for this phase (nothing renders yet).
- **Determinism / idempotency.** Re-fetching `GET /api/ribbons` repeatedly must never change `earnedAt` for an already-earned ribbon, must never duplicate a `user_ribbons` row, and must keep `newlyEarned` **true** indefinitely for an earned-but-unacknowledged ribbon until `POST /api/ribbons/seen` is called — a missed toast is never silently lost.

---

### Task D1: Migration + Drizzle schema for `user_ribbons` + `user_showcase`

**Files:**
- Modify: `src/db/schema/user.ts` (add `userRibbons`, `userShowcase` tables; add `unique` import)
- Test: `tests/db/schema.test.ts` (round-trip + unique-constraint cases)
- New (generated): `migrations/000N_<name>.sql`, `migrations/meta/000N_snapshot.json`, updated `migrations/meta/_journal.json`

**Interfaces:**
- Produces: `userRibbons` — `id` (text PK), `userId` (text, FK→`users.id`), `ribbonId` (text), `earnedAt` (int epoch ms), `seenAt` (int epoch ms, nullable); unique on `(userId, ribbonId)`.
- Produces: `userShowcase` — `id` (text PK), `userId` (text, FK→`users.id`), `ribbonId` (text), `slot` (int); unique on `(userId, slot)` **and** unique on `(userId, ribbonId)` (a ribbon can occupy only one slot; a slot holds only one ribbon).
- Consumes: `users.id` (existing table, unchanged).

- [ ] **Step 1: Write the failing schema tests**

Append to `tests/db/schema.test.ts` (extend the existing import line, then add a new `describe` block at the end of the file):

```ts
import { species, forms, users, boxes, specimens, events, userRibbons, userShowcase } from "../../src/db/schema";
```

```ts
describe("ribbon incentive schema", () => {
  it("user_ribbons: inserts, reads, and enforces one row per (user, ribbon)", async () => {
    const db = getDb(env.DB);
    await db.insert(users).values({ id: "ur1", email: "ur1@x.com", createdAt: 1 });
    await db.insert(userRibbons).values({
      id: "row1", userId: "ur1", ribbonId: "living-dex", earnedAt: 1000, seenAt: null,
    });
    const rows = await db.select().from(userRibbons).where(eq(userRibbons.userId, "ur1"));
    expect(rows).toHaveLength(1);
    expect(rows[0].earnedAt).toBe(1000);
    expect(rows[0].seenAt).toBeNull();

    await expect(
      db.insert(userRibbons).values({
        id: "row2", userId: "ur1", ribbonId: "living-dex", earnedAt: 2000, seenAt: null,
      }),
    ).rejects.toThrow();
  });

  it("user_showcase: inserts, reads, and enforces one ribbon per slot and one slot per ribbon", async () => {
    const db = getDb(env.DB);
    await db.insert(users).values({ id: "us1", email: "us1@x.com", createdAt: 1 });
    await db.insert(userShowcase).values({ id: "s1", userId: "us1", ribbonId: "living-dex", slot: 0 });
    const rows = await db.select().from(userShowcase).where(eq(userShowcase.userId, "us1"));
    expect(rows).toHaveLength(1);
    expect(rows[0].slot).toBe(0);

    // Same user, same slot, different ribbon -> blocked.
    await expect(
      db.insert(userShowcase).values({ id: "s2", userId: "us1", ribbonId: "shiny-10", slot: 0 }),
    ).rejects.toThrow();

    // Same user, same ribbon, different slot -> blocked (a ribbon occupies exactly one slot).
    await expect(
      db.insert(userShowcase).values({ id: "s3", userId: "us1", ribbonId: "living-dex", slot: 1 }),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/db/schema.test.ts`
Expected: FAIL — `userRibbons`/`userShowcase` are not exported from `../../src/db/schema`.

- [ ] **Step 3: Add the tables to `src/db/schema/user.ts`**

Change the import line at the top of `src/db/schema/user.ts`:

```ts
import { sqliteTable, integer, text, unique } from "drizzle-orm/sqlite-core";
```

Append these two tables at the end of the file (after `sessions`):

```ts
/**
 * One row per (user, ribbonId) the user has ever earned. `earnedAt` is set
 * once, on first earn, and never overwritten. `seenAt` starts `null` — a
 * freshly-earned ribbon is "newly earned" (see `newlyEarned` in the API
 * response) until `POST /api/ribbons/seen` bumps `seenAt`.
 */
export const userRibbons = sqliteTable(
  "user_ribbons",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id),
    ribbonId: text("ribbon_id").notNull(),
    earnedAt: integer("earned_at").notNull(),
    seenAt: integer("seen_at"),
  },
  (t) => [unique("user_ribbons_user_id_ribbon_id_unique").on(t.userId, t.ribbonId)],
);

/**
 * Up to 6 ribbons a user has pinned to their showcase ("trophy wall"), keyed
 * by slot (0..5). Membership (a ribbon must be earned to be pinned) is
 * validated in the route against `userRibbons`, not enforceable at the
 * schema level since the ribbon catalog itself is computed, not stored.
 */
export const userShowcase = sqliteTable(
  "user_showcase",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id),
    ribbonId: text("ribbon_id").notNull(),
    slot: integer("slot").notNull(),
  },
  (t) => [
    unique("user_showcase_user_id_slot_unique").on(t.userId, t.slot),
    unique("user_showcase_user_id_ribbon_id_unique").on(t.userId, t.ribbonId),
  ],
);
```

- [ ] **Step 4: Generate the migration**

Run: `npx drizzle-kit generate`

This creates a new `migrations/000N_<random-name>.sql` (N = one past the current highest, `0006` as of this writing — check `migrations/meta/_journal.json` for the actual next index) and a matching `migrations/meta/000N_snapshot.json`, and appends an entry to `migrations/meta/_journal.json`. Open the generated `.sql` and confirm it contains (statement order/exact formatting may differ slightly — that's fine, drizzle-kit owns this file):

```sql
CREATE TABLE `user_ribbons` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`ribbon_id` text NOT NULL,
	`earned_at` integer NOT NULL,
	`seen_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_ribbons_user_id_ribbon_id_unique` ON `user_ribbons` (`user_id`,`ribbon_id`);
--> statement-breakpoint
CREATE TABLE `user_showcase` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`ribbon_id` text NOT NULL,
	`slot` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_showcase_user_id_slot_unique` ON `user_showcase` (`user_id`,`slot`);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_showcase_user_id_ribbon_id_unique` ON `user_showcase` (`user_id`,`ribbon_id`);
```

If drizzle-kit emits materially different DDL (e.g. it thinks this is a rename of an existing table), STOP and re-check the schema edit before proceeding — do not hand-patch the migration to paper over a schema mistake.

- [ ] **Step 5: Apply locally + verify**

Run: `npm run db:local`
Expected: applies cleanly (it will also re-run the idempotent seed scripts — fine).

Run: `npx vitest run tests/db/schema.test.ts && npx tsc -b`
Expected: both PASS / clean — the test-runner's own migration application (`tests/setup/apply-migrations.ts`) picks up the new migration automatically since it reads the whole `migrations/` directory.

- [ ] **Step 6: Commit**

```bash
git add src/db/schema/user.ts migrations/
git commit -m "feat(flex-D): add user_ribbons + user_showcase tables"
```

---

### Task D2: Pure scoring module — points, Trainer Score, rank, nudges

**Files:**
- Create: `src/worker/ribbons/scoring.ts`
- Test: `tests/worker/scoring.test.ts`

**Interfaces:**
- Produces: `pointsForRibbon(ribbon: {id, category}): number`; `trainerScoreFor(earned: {id, category}[]): number`; `RANKS: readonly {title, minScore}[]`; `rankFor(score: number): string`; `nearestRibbons(results: readonly RibbonResult[], limit?: number): RibbonResult[]`.
- Consumes: `RibbonResult` (type only, from `./catalog`).

**Points table (justified):** category → points, by difficulty tier. `Fun` (single-species easter eggs, low effort, high volume) = 5. `Type`, `Shiny`, `Events` (own-a-type / tiered milestone families — probabilistic or breadth-driven grinds of similar weight) = 15. `Regional`, `Forms`, `Form Sets` (own a whole generation's dex, or every form of a form-type/species — bigger completionist asks than a single type) = 20. `Completion` (National Dex % milestones — major, catalog-wide progress checkpoints) = 30. `Rarity Class`, `Collector` (own every Legendary/Mythical/etc., or every nature/ball — narrow but genuinely hard sets) = 40. `Grand` (the two absolute marquee ribbons) = 100. An unrecognized category defensively falls back to 10 (should never trigger against the real catalog — covered by a test).

**Grand-tier override (justified):** `shiny-living-dex` (own a shiny of *every* species) is exactly as hard as the two `Grand` ribbons, but Phase C filed it under `Shiny` so it visually groups with the rest of the shiny family on the Ribbons page. A small override set bumps its points to 100 without touching Phase C's category assignment.

**Rank thresholds (justified):** the catalog's approximate maximum achievable Trainer Score is ~2,900 points (dominated by the ~70+ tiered `Type`/`typemaster-*` ribbons at 15 pts each, since type-tier count scales with however many species each type has in the seeded reference data). Thresholds are spaced so `Novice`→`Collector` is reachable in the first session or two of casual collecting, the middle ranks track steady progress, and `Living Legend` demands genuine breadth across most families while still leaving headroom below the theoretical max (so reaching it isn't the same as maxing out):

| Rank | minScore |
| --- | --- |
| Novice | 0 |
| Collector | 100 |
| Ace | 300 |
| Elite | 600 |
| Champion | 1000 |
| Master | 1600 |
| Living Legend | 2400 |

- [ ] **Step 1: Write the failing tests**

Create `tests/worker/scoring.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { pointsForRibbon, trainerScoreFor, RANKS, rankFor, nearestRibbons } from "../../src/worker/ribbons/scoring";
import type { RibbonResult } from "../../src/worker/ribbons/catalog";

describe("pointsForRibbon", () => {
  it("grades points by category difficulty", () => {
    expect(pointsForRibbon({ id: "fun-bidoof", category: "Fun" })).toBe(5);
    expect(pointsForRibbon({ id: "type-fire", category: "Type" })).toBe(15);
    expect(pointsForRibbon({ id: "shiny-10", category: "Shiny" })).toBe(15);
    expect(pointsForRibbon({ id: "event-10", category: "Events" })).toBe(15);
    expect(pointsForRibbon({ id: "gen-1", category: "Regional" })).toBe(20);
    expect(pointsForRibbon({ id: "form-fanatic-mega", category: "Forms" })).toBe(20);
    expect(pointsForRibbon({ id: "formset-201", category: "Form Sets" })).toBe(20);
    expect(pointsForRibbon({ id: "national-dex-50", category: "Completion" })).toBe(30);
    expect(pointsForRibbon({ id: "rarity-legendaries", category: "Rarity Class" })).toBe(40);
    expect(pointsForRibbon({ id: "collector-natures", category: "Collector" })).toBe(40);
    expect(pointsForRibbon({ id: "living-dex", category: "Grand" })).toBe(100);
  });

  it("overrides shiny-living-dex to Grand-tier points despite its Shiny category", () => {
    expect(pointsForRibbon({ id: "shiny-living-dex", category: "Shiny" })).toBe(100);
    expect(pointsForRibbon({ id: "shiny-10", category: "Shiny" })).toBe(15); // sibling stays at the normal rate
  });

  it("falls back to a default for an unrecognized category (defensive — should not happen against the real catalog)", () => {
    expect(pointsForRibbon({ id: "mystery", category: "Nonexistent" })).toBe(10);
  });
});

describe("trainerScoreFor", () => {
  it("sums points across earned ribbons", () => {
    const earned = [
      { id: "fun-bidoof", category: "Fun" }, // 5
      { id: "type-fire", category: "Type" }, // 15
      { id: "living-dex", category: "Grand" }, // 100
    ];
    expect(trainerScoreFor(earned)).toBe(120);
  });

  it("is 0 for no earned ribbons", () => {
    expect(trainerScoreFor([])).toBe(0);
  });
});

describe("RANKS + rankFor", () => {
  it("is strictly ascending by minScore", () => {
    for (let i = 1; i < RANKS.length; i++) {
      expect(RANKS[i].minScore).toBeGreaterThan(RANKS[i - 1].minScore);
    }
  });

  it("returns Novice below the first paid threshold", () => {
    expect(rankFor(0)).toBe("Novice");
    expect(rankFor(99)).toBe("Novice");
  });

  it("returns the exact rank at each threshold boundary", () => {
    expect(rankFor(100)).toBe("Collector");
    expect(rankFor(300)).toBe("Ace");
    expect(rankFor(600)).toBe("Elite");
    expect(rankFor(1000)).toBe("Champion");
    expect(rankFor(1600)).toBe("Master");
    expect(rankFor(2400)).toBe("Living Legend");
  });

  it("stays at the top rank above the highest threshold", () => {
    expect(rankFor(999999)).toBe("Living Legend");
  });
});

describe("nearestRibbons", () => {
  const base = { name: "n", description: "d", earned: false, progress: { current: 0, total: 10 } };
  const results: RibbonResult[] = [
    { ...base, id: "a", category: "Type", progress: { current: 9, total: 10 } }, // ratio 0.9
    { ...base, id: "b", category: "Type", progress: { current: 1, total: 10 } }, // ratio 0.1
    { ...base, id: "c", category: "Grand", earned: true, progress: { current: 10, total: 10 } }, // earned -> excluded
    { ...base, id: "d", category: "Fun", secret: true, progress: { current: 0, total: 1 } }, // secret -> excluded
    { ...base, id: "e", category: "Type", progress: { current: 0, total: 0 } }, // total 0 -> excluded
    { ...base, id: "f", category: "Type", progress: { current: 5, total: 10 } }, // ratio 0.5
  ];

  it("returns locked, non-secret, non-degenerate ribbons sorted by progress ratio, highest first", () => {
    expect(nearestRibbons(results, 5).map((r) => r.id)).toEqual(["a", "f", "b"]);
  });

  it("respects the limit", () => {
    expect(nearestRibbons(results, 2).map((r) => r.id)).toEqual(["a", "f"]);
  });

  it("defaults to a limit of 5", () => {
    expect(nearestRibbons(results)).toHaveLength(3); // only 3 eligible in this fixture
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/worker/scoring.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/worker/ribbons/scoring.ts`**

```ts
/**
 * Pure Trainer Score engine: ribbon points, rank titles, and "closest to
 * earning" nudge selection. No I/O — takes plain data, returns plain data.
 * Consumed by `routes/ribbons.ts`; unit-tested directly here.
 */

import type { RibbonResult } from "./catalog";

const CATEGORY_POINTS: Record<string, number> = {
  Fun: 5,
  Type: 15,
  Shiny: 15,
  Events: 15,
  Regional: 20,
  Forms: 20,
  "Form Sets": 20,
  Completion: 30,
  "Rarity Class": 40,
  Collector: 40,
  Grand: 100,
};

/** Defensive fallback for any category not in `CATEGORY_POINTS` — should never trigger against the real catalog. */
const DEFAULT_POINTS = 10;

/**
 * Ribbons that are exactly as hard as a `Grand` ribbon but are filed under a
 * different category for Ribbons-page grouping (see Phase C). Overriding
 * here keeps Trainer Score honest without reshuffling that UI grouping.
 */
const GRAND_OVERRIDE_IDS = new Set<string>(["shiny-living-dex"]);

/** Points a single ribbon contributes to Trainer Score once earned. */
export function pointsForRibbon(ribbon: { id: string; category: string }): number {
  if (GRAND_OVERRIDE_IDS.has(ribbon.id)) return CATEGORY_POINTS.Grand;
  return CATEGORY_POINTS[ribbon.category] ?? DEFAULT_POINTS;
}

/** Sum of `pointsForRibbon` across every earned ribbon — a user's Trainer Score. */
export function trainerScoreFor(earned: readonly { id: string; category: string }[]): number {
  return earned.reduce((sum, r) => sum + pointsForRibbon(r), 0);
}

/**
 * Rank titles by cumulative Trainer Score, ascending. See the Task D2
 * write-up above for the threshold rationale.
 */
export const RANKS: readonly { title: string; minScore: number }[] = [
  { title: "Novice", minScore: 0 },
  { title: "Collector", minScore: 100 },
  { title: "Ace", minScore: 300 },
  { title: "Elite", minScore: 600 },
  { title: "Champion", minScore: 1000 },
  { title: "Master", minScore: 1600 },
  { title: "Living Legend", minScore: 2400 },
];

/** The highest rank title whose `minScore` is <= `score`. */
export function rankFor(score: number): string {
  let title = RANKS[0].title;
  for (const r of RANKS) {
    if (score >= r.minScore) title = r.title;
    else break;
  }
  return title;
}

/**
 * "Closest to earning" nudges: the top `limit` locked, non-secret ribbons by
 * progress ratio (current/total), highest first. Secret (`Fun` easter-egg)
 * ribbons are excluded so a nudge never spoils a hidden achievement's
 * existence; ribbons with `total === 0` (degenerate/empty sets) are excluded
 * since they have no meaningful ratio. Ties break by id for determinism.
 */
export function nearestRibbons(results: readonly RibbonResult[], limit = 5): RibbonResult[] {
  return results
    .filter((r) => !r.earned && !r.secret && r.progress.total > 0)
    .map((r) => ({ ribbon: r, ratio: r.progress.current / r.progress.total }))
    .sort((a, b) => b.ratio - a.ratio || a.ribbon.id.localeCompare(b.ribbon.id))
    .slice(0, limit)
    .map((x) => x.ribbon);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/worker/scoring.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 5: Verify + commit**

Run: `npx tsc -b`
Expected: clean.

```bash
git add src/worker/ribbons/scoring.ts tests/worker/scoring.test.ts
git commit -m "feat(flex-D): pure scoring engine (points, Trainer Score, rank, nearest-ribbon nudges)"
```

---

### Task D3: Sync — upsert earned ribbons into `user_ribbons`; compute `newlyEarned`

**Files:**
- Create: `src/worker/ribbons/incentive-store.ts` (data-access module for the whole Phase D; extended by D4–D6)
- Test: `tests/worker/incentive-store.test.ts` (direct unit tests, extended by D4–D6)
- Modify: `src/worker/routes/ribbons.ts` (call the sync on every signed-in `GET /api/ribbons`; attach `newlyEarned` per ribbon)
- Test: `tests/worker/ribbons-route.test.ts` (append route-level cases)

**Interfaces:**
- Produces: `syncEarnedRibbons(db, userId, earnedIds, now): Promise<void>`; `loadUserRibbonRows(db, userId): Promise<Map<string, {earnedAt, seenAt}>>`.
- Consumes: Drizzle table `userRibbons` (D1); `computeRibbons` output (route only, not this module).

- [ ] **Step 1: Write the failing data-access tests**

Create `tests/worker/incentive-store.test.ts`:

```ts
import { env } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import { getDb } from "../../src/worker/db";
import { users } from "../../src/db/schema";
import { syncEarnedRibbons, loadUserRibbonRows } from "../../src/worker/ribbons/incentive-store";

describe("incentive-store: syncEarnedRibbons / loadUserRibbonRows", () => {
  it("inserts a row on first earn (earnedAt = now, seenAt = null)", async () => {
    const db = getDb(env.DB);
    await db.insert(users).values({ id: "sync-u1", email: "sync-u1@x.com", createdAt: 1 });

    await syncEarnedRibbons(db, "sync-u1", ["living-dex", "shiny-10"], 5000);

    const rows = await loadUserRibbonRows(db, "sync-u1");
    expect(rows.size).toBe(2);
    expect(rows.get("living-dex")).toEqual({ earnedAt: 5000, seenAt: null });
    expect(rows.get("shiny-10")).toEqual({ earnedAt: 5000, seenAt: null });
  });

  it("leaves an existing row's earnedAt/seenAt untouched on a later sync (never overwrites)", async () => {
    const db = getDb(env.DB);
    await db.insert(users).values({ id: "sync-u2", email: "sync-u2@x.com", createdAt: 1 });

    await syncEarnedRibbons(db, "sync-u2", ["living-dex"], 1000);
    await syncEarnedRibbons(db, "sync-u2", ["living-dex", "shiny-10"], 9999); // re-sync, later "now"

    const rows = await loadUserRibbonRows(db, "sync-u2");
    expect(rows.get("living-dex")!.earnedAt).toBe(1000); // unchanged, not bumped to 9999
    expect(rows.get("shiny-10")!.earnedAt).toBe(9999); // newly inserted this pass
  });

  it("is a no-op for an empty earned-ids list", async () => {
    const db = getDb(env.DB);
    await db.insert(users).values({ id: "sync-u3", email: "sync-u3@x.com", createdAt: 1 });
    await syncEarnedRibbons(db, "sync-u3", [], 1000);
    expect((await loadUserRibbonRows(db, "sync-u3")).size).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/worker/incentive-store.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/worker/ribbons/incentive-store.ts`**

```ts
/**
 * Data-access layer for the ribbon incentive backend (Flex Phase D). Every
 * function here does real D1 I/O and is intentionally kept out of the pure
 * engines (`catalog.ts`, `scoring.ts`) per the Global Constraints — the
 * route (`routes/ribbons.ts`) is the only caller. Extended across Tasks
 * D3–D6; this task adds the sync + read-back functions.
 */
import { eq } from "drizzle-orm";
import type { getDb } from "../db";
import { userRibbons } from "../../db/schema";

type Db = ReturnType<typeof getDb>;

/**
 * Inserts a `user_ribbons` row (earnedAt = now, seenAt = null) for every
 * currently-earned ribbon id the user doesn't already have a row for.
 * Existing rows are left untouched — `onConflictDoNothing` on the
 * `(user_id, ribbon_id)` unique index is what keeps `earnedAt` fixed at
 * first-earn and preserves `seenAt` across repeated fetches.
 */
export async function syncEarnedRibbons(
  db: Db,
  userId: string,
  earnedIds: readonly string[],
  now: number,
): Promise<void> {
  if (earnedIds.length === 0) return;
  await db
    .insert(userRibbons)
    .values(earnedIds.map((ribbonId) => ({ id: crypto.randomUUID(), userId, ribbonId, earnedAt: now, seenAt: null })))
    .onConflictDoNothing({ target: [userRibbons.userId, userRibbons.ribbonId] });
}

/** Loads every `user_ribbons` row for a user, keyed by ribbonId. */
export async function loadUserRibbonRows(
  db: Db,
  userId: string,
): Promise<Map<string, { earnedAt: number; seenAt: number | null }>> {
  const rows = await db
    .select({ ribbonId: userRibbons.ribbonId, earnedAt: userRibbons.earnedAt, seenAt: userRibbons.seenAt })
    .from(userRibbons)
    .where(eq(userRibbons.userId, userId));
  return new Map(rows.map((r) => [r.ribbonId, { earnedAt: r.earnedAt, seenAt: r.seenAt }]));
}
```

- [ ] **Step 4: Run the data-access tests to verify they pass**

Run: `npx vitest run tests/worker/incentive-store.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Wire the sync into the route + write the failing route tests**

Append to `tests/worker/ribbons-route.test.ts` (inside the existing `describe("ribbons API", ...)`):

```ts
  it("marks a ribbon newlyEarned on first earn, and it stays newlyEarned until acknowledged (Task D6)", async () => {
    const cookie = await signIn("newly-earned@x.com");
    const before = await call("/api/ribbons", undefined, cookie);
    const beforeBody = (await before.json()) as any;
    expect(beforeBody.ribbons.find((r: any) => r.id === "fun-first-catch").newlyEarned).toBe(false);

    await postJson("/api/collection", { speciesId: 1001 }, cookie);

    const after = await call("/api/ribbons", undefined, cookie);
    const afterBody = (await after.json()) as any;
    const afterFun = afterBody.ribbons.find((r: any) => r.id === "fun-first-catch");
    expect(afterFun.earned).toBe(true);
    expect(afterFun.newlyEarned).toBe(true);

    // Fetching again with no ack yet — still newlyEarned (Task D6 adds the ack endpoint).
    const again = await call("/api/ribbons", undefined, cookie);
    const againBody = (await again.json()) as any;
    expect(againBody.ribbons.find((r: any) => r.id === "fun-first-catch").newlyEarned).toBe(true);
  });

  it("logged-out requests never sync and never crash on newlyEarned (always false)", async () => {
    const res = await call("/api/ribbons");
    const body = (await res.json()) as any;
    for (const r of body.ribbons) expect(r.newlyEarned).toBe(false);
  });
```

- [ ] **Step 6: Run to verify failure**

Run: `npx vitest run tests/worker/ribbons-route.test.ts`
Expected: FAIL — `newlyEarned` is `undefined` on every ribbon.

- [ ] **Step 7: Implement in `src/worker/routes/ribbons.ts`**

Add to the imports:

```ts
import { syncEarnedRibbons, loadUserRibbonRows } from "../ribbons/incentive-store";
```

Replace the final two lines of the `GET "/"` handler:

```ts
  const ribbons = computeRibbons(summary, ref);
  return c.json({ ribbons, earnedCount: ribbons.filter((r) => r.earned).length, total: ribbons.length });
});
```

with:

```ts
  const ribbons = computeRibbons(summary, ref);

  const newlyEarnedIds = new Set<string>();
  if (user) {
    const now = Date.now();
    const earnedIds = ribbons.filter((r) => r.earned).map((r) => r.id);
    await syncEarnedRibbons(db, user.id, earnedIds, now);
    const userRibbonRows = await loadUserRibbonRows(db, user.id);
    for (const r of ribbons) {
      const row = userRibbonRows.get(r.id);
      if (r.earned && row && (row.seenAt === null || row.earnedAt > row.seenAt)) {
        newlyEarnedIds.add(r.id);
      }
    }
  }

  const ribbonsOut = ribbons.map((r) => ({ ...r, newlyEarned: newlyEarnedIds.has(r.id) }));

  return c.json({ ribbons: ribbonsOut, earnedCount: ribbons.filter((r) => r.earned).length, total: ribbons.length });
});
```

- [ ] **Step 8: Verify + commit**

Run: `npx vitest run tests/worker/ribbons-route.test.ts tests/worker/incentive-store.test.ts && npx tsc -b`
Expected: all green.

```bash
git add src/worker/ribbons/incentive-store.ts tests/worker/incentive-store.test.ts src/worker/routes/ribbons.ts tests/worker/ribbons-route.test.ts
git commit -m "feat(flex-D): sync earned ribbons into user_ribbons; compute newlyEarned"
```

---

### Task D4: Rarity % — `earnedCount(ribbonId) / totalUsers`

**Files:**
- Modify: `src/worker/ribbons/incentive-store.ts` (add `ribbonRarity`)
- Modify: `src/worker/routes/ribbons.ts` (attach `rarityPct` per ribbon)
- Test: `tests/worker/incentive-store.test.ts` (append)
- Test: `tests/worker/ribbons-route.test.ts` (append)

**Interfaces:**
- Produces: `ribbonRarity(db): Promise<{ counts: Map<string, number>; totalUsers: number }>`.
- Consumes: Drizzle tables `userRibbons`, `users`.

- [ ] **Step 1: Write the failing data-access test**

Append to `tests/worker/incentive-store.test.ts`:

```ts
import { ribbonRarity } from "../../src/worker/ribbons/incentive-store";

describe("incentive-store: ribbonRarity", () => {
  it("counts distinct earners per ribbon id and the total user count", async () => {
    const db = getDb(env.DB);
    await db.insert(users).values([
      { id: "rar-a", email: "rar-a@x.com", createdAt: 1 },
      { id: "rar-b", email: "rar-b@x.com", createdAt: 1 },
    ]);
    await syncEarnedRibbons(db, "rar-a", ["living-dex"], 1000);
    await syncEarnedRibbons(db, "rar-b", ["living-dex", "shiny-10"], 1000);

    const { counts, totalUsers } = await ribbonRarity(db);
    expect(counts.get("living-dex")).toBe(2);
    expect(counts.get("shiny-10")).toBe(1);
    expect(counts.get("never-earned-anywhere")).toBeUndefined();
    expect(totalUsers).toBeGreaterThanOrEqual(2); // other tests in the suite add users too
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/worker/incentive-store.test.ts`
Expected: FAIL — `ribbonRarity` is not exported.

- [ ] **Step 3: Implement**

Add to `src/worker/ribbons/incentive-store.ts` (extend the `drizzle-orm` import to include `sql`, and import `users` alongside `userRibbons`):

```ts
import { eq, sql } from "drizzle-orm";
import { userRibbons, users } from "../../db/schema";
```

Append:

```ts
/**
 * Ribbon rarity across the whole userbase: `earnedCount(ribbonId) /
 * totalUsers`. Independent of the requesting user — computed from ALL
 * users' `user_ribbons` rows, so it's safe to include in the response for
 * signed-in AND logged-out requests alike (it never touches per-user data).
 */
export async function ribbonRarity(db: Db): Promise<{ counts: Map<string, number>; totalUsers: number }> {
  const [countRows, [{ value: totalUsers }]] = await Promise.all([
    db
      .select({ ribbonId: userRibbons.ribbonId, value: sql<number>`count(*)` })
      .from(userRibbons)
      .groupBy(userRibbons.ribbonId),
    db.select({ value: sql<number>`count(*)` }).from(users),
  ]);
  return {
    counts: new Map(countRows.map((r) => [r.ribbonId, Number(r.value)])),
    totalUsers: Number(totalUsers),
  };
}
```

- [ ] **Step 4: Run the data-access test to verify it passes**

Run: `npx vitest run tests/worker/incentive-store.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing route test**

Append to `tests/worker/ribbons-route.test.ts`:

```ts
  it("computes rarityPct as a 0..1 fraction of all users that never exceeds 1 and only rises as more users earn the same ribbon", async () => {
    const cookieA = await signIn("rarity-a@x.com");
    await postJson("/api/collection", { speciesId: 1001 }, cookieA);
    await call("/api/ribbons", undefined, cookieA); // sync A's earn

    const res1 = await call("/api/ribbons", undefined, cookieA);
    const body1 = (await res1.json()) as any;
    const firstCatch1 = body1.ribbons.find((r: any) => r.id === "fun-first-catch");
    expect(firstCatch1.rarityPct).toBeGreaterThan(0);
    expect(firstCatch1.rarityPct).toBeLessThanOrEqual(1);

    // A brand-new user who has NOT earned it — adds to totalUsers without adding an earner,
    // so the fraction can only drop or stay the same.
    const cookieB = await signIn("rarity-b@x.com");
    const res2 = await call("/api/ribbons", undefined, cookieB);
    const body2 = (await res2.json()) as any;
    const firstCatch2 = body2.ribbons.find((r: any) => r.id === "fun-first-catch");
    expect(firstCatch2.rarityPct).toBeLessThanOrEqual(firstCatch1.rarityPct);

    // A ribbon nobody in this whole test file ever earns has rarityPct 0.
    const neverEarned = body2.ribbons.find((r: any) => r.id === "rarity-paradox");
    expect(neverEarned.rarityPct).toBe(0);
  });

  it("returns rarityPct even for logged-out requests (it's a global aggregate, not per-user)", async () => {
    const res = await call("/api/ribbons");
    const body = (await res.json()) as any;
    const firstCatch = body.ribbons.find((r: any) => r.id === "fun-first-catch");
    expect(typeof firstCatch.rarityPct).toBe("number");
    expect(firstCatch.rarityPct).toBeGreaterThanOrEqual(0);
  });
```

- [ ] **Step 6: Run to verify failure**

Run: `npx vitest run tests/worker/ribbons-route.test.ts`
Expected: FAIL — `rarityPct` is `undefined`.

- [ ] **Step 7: Implement in `src/worker/routes/ribbons.ts`**

Extend the import from `incentive-store`:

```ts
import { syncEarnedRibbons, loadUserRibbonRows, ribbonRarity } from "../ribbons/incentive-store";
```

Replace the `ribbonsOut` line (added in D3) with:

```ts
  const rarity = await ribbonRarity(db);
  const ribbonsOut = ribbons.map((r) => ({
    ...r,
    newlyEarned: newlyEarnedIds.has(r.id),
    rarityPct: rarity.totalUsers > 0 ? (rarity.counts.get(r.id) ?? 0) / rarity.totalUsers : 0,
  }));
```

(`ribbonRarity` runs unconditionally — for signed-in *and* logged-out requests — since it's a global aggregate independent of `user`.)

- [ ] **Step 8: Verify + commit**

Run: `npx vitest run tests/worker/ribbons-route.test.ts tests/worker/incentive-store.test.ts && npx tsc -b`
Expected: all green.

```bash
git add src/worker/ribbons/incentive-store.ts src/worker/routes/ribbons.ts tests/worker/incentive-store.test.ts tests/worker/ribbons-route.test.ts
git commit -m "feat(flex-D): rarityPct per ribbon (earnedCount / totalUsers)"
```

---

### Task D5: Showcase — `PUT /api/ribbons/showcase` + `showcase` in `GET` response

**Files:**
- Modify: `src/worker/ribbons/incentive-store.ts` (add `SHOWCASE_SLOTS`, `getShowcase`, `setShowcase`)
- Modify: `src/worker/routes/ribbons.ts` (new `PUT /showcase` route; `showcase` in the `GET` response)
- Test: `tests/worker/incentive-store.test.ts` (append)
- Test: `tests/worker/ribbons-route.test.ts` (append; adds a `putJson` test helper)

**Interfaces:**
- Produces: `SHOWCASE_SLOTS = 6`; `getShowcase(db, userId): Promise<(string | null)[]>` (fixed length-6, slot-indexed, `null` for empty); `setShowcase(db, userId, ribbonIds): Promise<{ok: true} | {ok: false, errors: string[]}>` (validates length ≤ 6, no duplicates, every id actually earned — via `loadUserRibbonRows` from D3 — before writing; replaces the whole showcase atomically from the caller's point of view: delete-then-insert).
- Consumes: Drizzle table `userShowcase`; `loadUserRibbonRows` (D3).

- [ ] **Step 1: Write the failing data-access tests**

Append to `tests/worker/incentive-store.test.ts`:

```ts
import { getShowcase, setShowcase, SHOWCASE_SLOTS } from "../../src/worker/ribbons/incentive-store";

describe("incentive-store: getShowcase / setShowcase", () => {
  it("defaults to an all-null 6-slot showcase", async () => {
    const db = getDb(env.DB);
    await db.insert(users).values({ id: "sc-u1", email: "sc-u1@x.com", createdAt: 1 });
    const showcase = await getShowcase(db, "sc-u1");
    expect(showcase).toEqual(new Array(SHOWCASE_SLOTS).fill(null));
  });

  it("rejects pinning a ribbon the user hasn't earned, and writes nothing", async () => {
    const db = getDb(env.DB);
    await db.insert(users).values({ id: "sc-u2", email: "sc-u2@x.com", createdAt: 1 });
    const result = await setShowcase(db, "sc-u2", ["living-dex"]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(" ")).toMatch(/not earned/);
    expect(await getShowcase(db, "sc-u2")).toEqual(new Array(SHOWCASE_SLOTS).fill(null));
  });

  it("rejects more than 6 ribbons and duplicate ribbon ids", async () => {
    const db = getDb(env.DB);
    await db.insert(users).values({ id: "sc-u3", email: "sc-u3@x.com", createdAt: 1 });
    await syncEarnedRibbons(db, "sc-u3", ["living-dex"], 1000);

    const tooMany = await setShowcase(db, "sc-u3", new Array(7).fill("living-dex"));
    expect(tooMany.ok).toBe(false);

    const dup = await setShowcase(db, "sc-u3", ["living-dex", "living-dex"]);
    expect(dup.ok).toBe(false);
  });

  it("pins earned ribbons in slot order and replaces a prior showcase wholesale", async () => {
    const db = getDb(env.DB);
    await db.insert(users).values({ id: "sc-u4", email: "sc-u4@x.com", createdAt: 1 });
    await syncEarnedRibbons(db, "sc-u4", ["living-dex", "shiny-10"], 1000);

    const first = await setShowcase(db, "sc-u4", ["living-dex", "shiny-10"]);
    expect(first.ok).toBe(true);
    expect(await getShowcase(db, "sc-u4")).toEqual(["living-dex", "shiny-10", null, null, null, null]);

    const second = await setShowcase(db, "sc-u4", ["shiny-10"]); // replaces, doesn't append
    expect(second.ok).toBe(true);
    expect(await getShowcase(db, "sc-u4")).toEqual(["shiny-10", null, null, null, null, null]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/worker/incentive-store.test.ts`
Expected: FAIL — `getShowcase`/`setShowcase`/`SHOWCASE_SLOTS` are not exported.

- [ ] **Step 3: Implement**

Add `userShowcase` to the schema import in `src/worker/ribbons/incentive-store.ts`:

```ts
import { userRibbons, userShowcase, users } from "../../db/schema";
```

Append:

```ts
/** Fixed showcase size — the "trophy wall" holds up to this many pinned ribbons. */
export const SHOWCASE_SLOTS = 6;

/** Returns the user's showcase as a fixed 6-slot array (`null` for an empty slot), in slot order. */
export async function getShowcase(db: Db, userId: string): Promise<(string | null)[]> {
  const rows = await db
    .select({ ribbonId: userShowcase.ribbonId, slot: userShowcase.slot })
    .from(userShowcase)
    .where(eq(userShowcase.userId, userId));
  const out: (string | null)[] = new Array(SHOWCASE_SLOTS).fill(null);
  for (const r of rows) {
    if (r.slot >= 0 && r.slot < SHOWCASE_SLOTS) out[r.slot] = r.ribbonId;
  }
  return out;
}

/**
 * Replaces the user's showcase with `ribbonIds` (array index = slot). Every
 * id must be one the user has actually earned (checked against
 * `user_ribbons`, never trusted from the request) — the whole write is
 * rejected, with no partial update, if any id is unearned, the list is
 * longer than `SHOWCASE_SLOTS`, or it contains a duplicate.
 */
export async function setShowcase(
  db: Db,
  userId: string,
  ribbonIds: readonly string[],
): Promise<{ ok: true } | { ok: false; errors: string[] }> {
  const errors: string[] = [];
  if (ribbonIds.length > SHOWCASE_SLOTS) errors.push(`at most ${SHOWCASE_SLOTS} ribbons may be showcased`);
  if (new Set(ribbonIds).size !== ribbonIds.length) errors.push("duplicate ribbon ids");

  if (ribbonIds.length > 0) {
    const earned = await loadUserRibbonRows(db, userId);
    const unearned = ribbonIds.filter((id) => !earned.has(id));
    if (unearned.length > 0) errors.push(`not earned: ${unearned.join(", ")}`);
  }

  if (errors.length > 0) return { ok: false, errors };

  await db.delete(userShowcase).where(eq(userShowcase.userId, userId));
  if (ribbonIds.length > 0) {
    await db.insert(userShowcase).values(
      ribbonIds.map((ribbonId, slot) => ({ id: crypto.randomUUID(), userId, ribbonId, slot })),
    );
  }
  return { ok: true };
}
```

- [ ] **Step 4: Run the data-access tests to verify they pass**

Run: `npx vitest run tests/worker/incentive-store.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing route tests**

Add a `putJson` helper next to the existing `postJson` helper near the top of `tests/worker/ribbons-route.test.ts`:

```ts
const putJson = (path: string, body: unknown, cookie?: string) =>
  call(path, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }, cookie);
```

Append a new `describe` block:

```ts
describe("ribbon showcase", () => {
  it("rejects showcase writes when not signed in (401)", async () => {
    const res = await putJson("/api/ribbons/showcase", { ribbonIds: [] });
    expect(res.status).toBe(401);
  });

  it("GET /api/ribbons returns an empty 6-slot showcase by default", async () => {
    const cookie = await signIn("showcase-empty@x.com");
    const res = await call("/api/ribbons", undefined, cookie);
    const body = (await res.json()) as any;
    expect(body.showcase).toEqual([null, null, null, null, null, null]);
  });

  it("rejects pinning a ribbon the user hasn't earned", async () => {
    const cookie = await signIn("showcase-unearned@x.com");
    const res = await putJson("/api/ribbons/showcase", { ribbonIds: ["living-dex"] }, cookie);
    expect(res.status).toBe(400);
    const body = (await res.json()) as any;
    expect(body.errors[0]).toMatch(/not earned/);
  });

  it("pins earned ribbons and reflects them in slot order on the next GET", async () => {
    const cookie = await signIn("showcase-owner@x.com");
    await postJson("/api/collection", { speciesId: 1001 }, cookie); // earns fun-first-catch
    await call("/api/ribbons", undefined, cookie); // sync the earn into user_ribbons

    const put = await putJson("/api/ribbons/showcase", { ribbonIds: ["fun-first-catch"] }, cookie);
    expect(put.status).toBe(200);
    const putBody = (await put.json()) as any;
    expect(putBody.showcase).toEqual(["fun-first-catch", null, null, null, null, null]);

    const res = await call("/api/ribbons", undefined, cookie);
    const body = (await res.json()) as any;
    expect(body.showcase[0]).toBe("fun-first-catch");
  });

  it("rejects more than 6 ribbons and duplicate ribbon ids", async () => {
    const cookie = await signIn("showcase-overflow@x.com");
    await postJson("/api/collection", { speciesId: 1001 }, cookie);
    await call("/api/ribbons", undefined, cookie);

    const tooMany = await putJson("/api/ribbons/showcase", { ribbonIds: new Array(7).fill("fun-first-catch") }, cookie);
    expect(tooMany.status).toBe(400);

    const dup = await putJson("/api/ribbons/showcase", { ribbonIds: ["fun-first-catch", "fun-first-catch"] }, cookie);
    expect(dup.status).toBe(400);
  });
});
```

- [ ] **Step 6: Run to verify failure**

Run: `npx vitest run tests/worker/ribbons-route.test.ts`
Expected: FAIL — no `/showcase` route (404), and `showcase` missing from the `GET` response.

- [ ] **Step 7: Implement in `src/worker/routes/ribbons.ts`**

Add `requireUser` to the auth import (the file currently only imports `getCurrentUser`):

```ts
import { getCurrentUser, requireUser } from "../auth/current-user";
```

Extend the `incentive-store` import:

```ts
import { syncEarnedRibbons, loadUserRibbonRows, ribbonRarity, getShowcase, setShowcase, SHOWCASE_SLOTS } from "../ribbons/incentive-store";
```

Inside the `GET "/"` handler, compute the showcase (any point after `db`/`user` are known — placed just before the `ribbonsOut` line is fine) and add it to the response:

```ts
  const showcase = user ? await getShowcase(db, user.id) : new Array(SHOWCASE_SLOTS).fill(null);
```

```ts
  return c.json({
    ribbons: ribbonsOut,
    earnedCount: ribbons.filter((r) => r.earned).length,
    total: ribbons.length,
    showcase,
  });
});
```

Add the new route (after the `GET "/"` handler, still on `ribbonRoutes`):

```ts
ribbonRoutes.put("/showcase", async (c) => {
  const user = await requireUser(c);
  const db = getDb(c.env.DB);

  const body = await c.req.json().catch(() => null);
  const ribbonIds = Array.isArray(body?.ribbonIds) ? body.ribbonIds : null;
  if (!ribbonIds || !ribbonIds.every((id: unknown) => typeof id === "string")) {
    return c.json({ errors: ["ribbonIds must be an array of strings"] }, 400);
  }

  const result = await setShowcase(db, user.id, ribbonIds);
  if (!result.ok) return c.json({ errors: result.errors }, 400);

  return c.json({ showcase: await getShowcase(db, user.id) });
});
```

- [ ] **Step 8: Verify + commit**

Run: `npx vitest run tests/worker/ribbons-route.test.ts tests/worker/incentive-store.test.ts && npx tsc -b`
Expected: all green.

```bash
git add src/worker/ribbons/incentive-store.ts src/worker/routes/ribbons.ts tests/worker/incentive-store.test.ts tests/worker/ribbons-route.test.ts
git commit -m "feat(flex-D): PUT /api/ribbons/showcase + showcase in GET response"
```

---

### Task D6: Earn-moment ack — `POST /api/ribbons/seen`

**Files:**
- Modify: `src/worker/ribbons/incentive-store.ts` (add `markRibbonsSeen`)
- Modify: `src/worker/routes/ribbons.ts` (new `POST /seen` route)
- Test: `tests/worker/incentive-store.test.ts` (append)
- Test: `tests/worker/ribbons-route.test.ts` (append; also resolves the "stays newlyEarned" comment left in D3's test)

**Interfaces:**
- Produces: `markRibbonsSeen(db, userId, now): Promise<void>` — bumps `seenAt` to `now` for every `user_ribbons` row owned by the user.
- Consumes: Drizzle table `userRibbons`.

- [ ] **Step 1: Write the failing data-access test**

Append to `tests/worker/incentive-store.test.ts`:

```ts
import { markRibbonsSeen } from "../../src/worker/ribbons/incentive-store";

describe("incentive-store: markRibbonsSeen", () => {
  it("bumps seenAt to now for every row the user owns, leaving earnedAt untouched", async () => {
    const db = getDb(env.DB);
    await db.insert(users).values({ id: "seen-u1", email: "seen-u1@x.com", createdAt: 1 });
    await syncEarnedRibbons(db, "seen-u1", ["living-dex", "shiny-10"], 1000);

    await markRibbonsSeen(db, "seen-u1", 5000);

    const rows = await loadUserRibbonRows(db, "seen-u1");
    expect(rows.get("living-dex")).toEqual({ earnedAt: 1000, seenAt: 5000 });
    expect(rows.get("shiny-10")).toEqual({ earnedAt: 1000, seenAt: 5000 });
  });

  it("does not affect another user's rows", async () => {
    const db = getDb(env.DB);
    await db.insert(users).values([
      { id: "seen-u2", email: "seen-u2@x.com", createdAt: 1 },
      { id: "seen-u3", email: "seen-u3@x.com", createdAt: 1 },
    ]);
    await syncEarnedRibbons(db, "seen-u2", ["living-dex"], 1000);
    await syncEarnedRibbons(db, "seen-u3", ["living-dex"], 1000);

    await markRibbonsSeen(db, "seen-u2", 9999);

    expect((await loadUserRibbonRows(db, "seen-u2")).get("living-dex")!.seenAt).toBe(9999);
    expect((await loadUserRibbonRows(db, "seen-u3")).get("living-dex")!.seenAt).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/worker/incentive-store.test.ts`
Expected: FAIL — `markRibbonsSeen` is not exported.

- [ ] **Step 3: Implement**

Append to `src/worker/ribbons/incentive-store.ts`:

```ts
/** Acknowledges all outstanding earn moments for a user — bumps `seenAt` to `now` for every row they own. */
export async function markRibbonsSeen(db: Db, userId: string, now: number): Promise<void> {
  await db.update(userRibbons).set({ seenAt: now }).where(eq(userRibbons.userId, userId));
}
```

- [ ] **Step 4: Run the data-access tests to verify they pass**

Run: `npx vitest run tests/worker/incentive-store.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing route test**

Append to `tests/worker/ribbons-route.test.ts`:

```ts
  it("POST /api/ribbons/seen acknowledges outstanding earn moments (newlyEarned flips false)", async () => {
    const cookie = await signIn("seen-ack@x.com");
    await postJson("/api/collection", { speciesId: 1001 }, cookie);

    const before = await call("/api/ribbons", undefined, cookie);
    const beforeBody = (await before.json()) as any;
    expect(beforeBody.ribbons.find((r: any) => r.id === "fun-first-catch").newlyEarned).toBe(true);

    const ack = await call("/api/ribbons/seen", { method: "POST" }, cookie);
    expect(ack.status).toBe(200);

    const after = await call("/api/ribbons", undefined, cookie);
    const afterBody = (await after.json()) as any;
    expect(afterBody.ribbons.find((r: any) => r.id === "fun-first-catch").newlyEarned).toBe(false);
  });

  it("rejects the ack when not signed in (401)", async () => {
    const res = await call("/api/ribbons/seen", { method: "POST" });
    expect(res.status).toBe(401);
  });
```

- [ ] **Step 6: Run to verify failure**

Run: `npx vitest run tests/worker/ribbons-route.test.ts`
Expected: FAIL — no `/seen` route (404).

- [ ] **Step 7: Implement in `src/worker/routes/ribbons.ts`**

Extend the `incentive-store` import to include `markRibbonsSeen`, then add the route (after the `PUT "/showcase"` route):

```ts
ribbonRoutes.post("/seen", async (c) => {
  const user = await requireUser(c);
  const db = getDb(c.env.DB);
  await markRibbonsSeen(db, user.id, Date.now());
  return c.json({ ok: true });
});
```

- [ ] **Step 8: Verify + commit**

Run: `npx vitest run tests/worker/ribbons-route.test.ts tests/worker/incentive-store.test.ts && npx tsc -b`
Expected: all green.

```bash
git add src/worker/ribbons/incentive-store.ts src/worker/routes/ribbons.ts tests/worker/incentive-store.test.ts tests/worker/ribbons-route.test.ts
git commit -m "feat(flex-D): POST /api/ribbons/seen acks earn moments"
```

---

### Task D7: Nudges — `nearest` in the `GET` response

**Files:**
- Modify: `src/worker/routes/ribbons.ts` (attach `nearest` using `nearestRibbons` from D2)
- Test: `tests/worker/ribbons-route.test.ts` (append)

**Interfaces:**
- Consumes: `nearestRibbons` (`../ribbons/scoring`, D2); the enriched `ribbonsOut` array built in D3/D4 (structurally a superset of `RibbonResult`, so it can be passed directly).
- Produces: top-level `nearest: RibbonResult[]` (top ~5 locked, non-secret ribbons by progress ratio) in the `GET /api/ribbons` response.

- [ ] **Step 1: Write the failing route test**

Append to `tests/worker/ribbons-route.test.ts`:

```ts
  it("returns nearest as the top ~5 locked, non-secret ribbons by progress ratio, sorted descending", async () => {
    const cookie = await signIn("nudge@x.com");
    const res = await call("/api/ribbons", undefined, cookie);
    const body = (await res.json()) as any;

    expect(Array.isArray(body.nearest)).toBe(true);
    expect(body.nearest.length).toBeLessThanOrEqual(5);
    for (const r of body.nearest) {
      expect(r.earned).toBe(false);
      expect(r.secret).not.toBe(true);
    }
    const ratios = body.nearest.map((r: any) => r.progress.current / r.progress.total);
    for (let i = 1; i < ratios.length; i++) expect(ratios[i]).toBeLessThanOrEqual(ratios[i - 1]);
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/worker/ribbons-route.test.ts`
Expected: FAIL — `nearest` is `undefined`.

- [ ] **Step 3: Implement in `src/worker/routes/ribbons.ts`**

Add to the `catalog` import:

```ts
import { computeRibbons, isSixIv, type CollectionSummary, type ReferenceData } from "../ribbons/catalog";
import { nearestRibbons } from "../ribbons/scoring";
```

Right after the `ribbonsOut` computation, add:

```ts
  const nearest = nearestRibbons(ribbonsOut, 5);
```

Add `nearest` to the returned object:

```ts
  return c.json({
    ribbons: ribbonsOut,
    earnedCount: ribbons.filter((r) => r.earned).length,
    total: ribbons.length,
    showcase,
    nearest,
  });
});
```

- [ ] **Step 4: Verify + commit**

Run: `npx vitest run tests/worker/ribbons-route.test.ts && npx tsc -b`
Expected: all green.

```bash
git add src/worker/routes/ribbons.ts tests/worker/ribbons-route.test.ts
git commit -m "feat(flex-D): nearest-ribbon nudges in GET /api/ribbons"
```

---

### Task D8: Points + Trainer Score + rank in the response; extend client types (`api.ts`)

**Files:**
- Modify: `src/worker/routes/ribbons.ts` (attach `points` per ribbon; `trainerScore`/`rank` top-level)
- Modify: `src/react-app/api.ts` (extend `RibbonDto`; introduce `RibbonsResponse`; add `setRibbonShowcase`, `ackRibbonsSeen`)
- Test: `tests/worker/ribbons-route.test.ts` (append)
- Verify (no behavior test needed — type-level only): `src/react-app/pages/Ribbons.tsx` keeps compiling unchanged

**Interfaces:**
- Consumes: `pointsForRibbon`, `trainerScoreFor`, `rankFor` (`../ribbons/scoring`, D2).
- Produces (route): each ribbon gains `points: number`; response gains `trainerScore: number`, `rank: string`.
- Produces (client): `RibbonDto` gains `points`, `rarityPct`, `newlyEarned` (all required — the server always sends them now); new `RibbonsResponse` type replaces the ad-hoc inline return type of `fetchRibbons`; `setRibbonShowcase(ribbonIds): Promise<{showcase}>`; `ackRibbonsSeen(): Promise<void>`.

- [ ] **Step 1: Write the failing route test**

Append to `tests/worker/ribbons-route.test.ts`:

```ts
  it("computes trainerScore/rank from earned ribbons, and attaches points per ribbon", async () => {
    const cookie = await signIn("score@x.com");
    await postJson("/api/collection", { speciesId: 1001 }, cookie); // earns fun-first-catch (Fun, 5 pts)

    const res = await call("/api/ribbons", undefined, cookie);
    const body = (await res.json()) as any;

    const firstCatch = body.ribbons.find((r: any) => r.id === "fun-first-catch");
    expect(firstCatch.points).toBe(5);
    expect(body.trainerScore).toBeGreaterThanOrEqual(5);
    expect(typeof body.rank).toBe("string");
    expect(body.rank.length).toBeGreaterThan(0);
  });

  it("scores 0 / ranks Novice for a signed-in user with nothing earned, and for logged-out requests", async () => {
    const cookie = await signIn("score-zero@x.com");
    const res = await call("/api/ribbons", undefined, cookie);
    const body = (await res.json()) as any;
    expect(body.trainerScore).toBe(0);
    expect(body.rank).toBe("Novice");

    const outRes = await call("/api/ribbons");
    const outBody = (await outRes.json()) as any;
    expect(outBody.trainerScore).toBe(0);
    expect(outBody.rank).toBe("Novice");
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/worker/ribbons-route.test.ts`
Expected: FAIL — `points`/`trainerScore`/`rank` are `undefined`.

- [ ] **Step 3: Implement the route change**

Extend the `scoring` import:

```ts
import { nearestRibbons, pointsForRibbon, trainerScoreFor, rankFor } from "../ribbons/scoring";
```

Replace the `ribbonsOut` line (from D4) with:

```ts
  const ribbonsOut = ribbons.map((r) => ({
    ...r,
    newlyEarned: newlyEarnedIds.has(r.id),
    rarityPct: rarity.totalUsers > 0 ? (rarity.counts.get(r.id) ?? 0) / rarity.totalUsers : 0,
    points: pointsForRibbon(r),
  }));
  const trainerScore = trainerScoreFor(ribbons.filter((r) => r.earned));
  const rank = rankFor(trainerScore);
```

Add `trainerScore`/`rank` to the returned object:

```ts
  return c.json({
    ribbons: ribbonsOut,
    earnedCount: ribbons.filter((r) => r.earned).length,
    total: ribbons.length,
    trainerScore,
    rank,
    showcase,
    nearest,
  });
});
```

- [ ] **Step 4: Run to verify the route test passes**

Run: `npx vitest run tests/worker/ribbons-route.test.ts`
Expected: PASS (every test added across D3–D8 in this file).

- [ ] **Step 5: Extend the client types + add the two new API calls in `src/react-app/api.ts`**

Replace the existing `RibbonDto` type and `fetchRibbons` function:

```ts
export type RibbonDto = {
	id: string;
	name: string;
	description: string;
	category: string;
	earned: boolean;
	progress: { current: number; total: number };
	/** Hidden easter-egg ribbon: the UI must not reveal name/description until earned. */
	secret?: boolean;
	/** Points this ribbon contributes to trainerScore once earned (Flex Phase D). */
	points: number;
	/** Fraction (0..1) of all registered users who have earned this ribbon. */
	rarityPct: number;
	/** True if earned but not yet acknowledged via `ackRibbonsSeen` — drives the earn-moment toast (Phase E). */
	newlyEarned: boolean;
};

export type RibbonsResponse = {
	ribbons: RibbonDto[];
	earnedCount: number;
	total: number;
	/** Sum of `points` across every ribbon the signed-in user has earned; 0 when logged out. */
	trainerScore: number;
	/** Rank title derived from `trainerScore` (e.g. "Novice" .. "Living Legend"); "Novice" when logged out. */
	rank: string;
	/** 6 fixed showcase slots, in slot order; `null` for an empty slot. All-null when logged out. */
	showcase: (string | null)[];
	/** Top ~5 locked, non-secret ribbons closest to completion, for dashboard nudges (Phase E). */
	nearest: RibbonDto[];
};

export async function fetchRibbons(): Promise<RibbonsResponse> {
	const res = await fetch("/api/ribbons", { credentials: "include" });
	if (!res.ok) throw new Error(`ribbons fetch failed: ${res.status}`);
	return res.json() as Promise<RibbonsResponse>;
}

/**
 * Pins up to 6 earned ribbon ids (array index = slot) to the signed-in
 * user's showcase. The server validates ownership + earned status — an
 * unearned or duplicate id, or more than 6 ids, is rejected with a 400
 * `{errors}` body (surfaced as `ApiValidationError` by `handleJson`).
 */
export async function setRibbonShowcase(ribbonIds: string[]): Promise<{ showcase: (string | null)[] }> {
	const res = await fetch("/api/ribbons/showcase", {
		method: "PUT",
		credentials: "include",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ ribbonIds }),
	});
	return handleJson<{ showcase: (string | null)[] }>(res, "set ribbon showcase");
}

/** Acknowledges all outstanding earn moments (bumps `seenAt`) so `newlyEarned` clears on the next fetch. */
export async function ackRibbonsSeen(): Promise<void> {
	const res = await fetch("/api/ribbons/seen", { method: "POST", credentials: "include" });
	await handleJson<{ ok: boolean }>(res, "ack ribbons seen");
}
```

- [ ] **Step 6: Full verification**

Run: `npx vitest run && npx tsc -b && npm run build`
Expected: entire suite green; typecheck clean; production build succeeds. In particular confirm `src/react-app/pages/Ribbons.tsx` still compiles untouched — it only *reads* `RibbonDto` fields it already used (`id`, `name`, `category`, `earned`, `progress`, `secret`), so the new required fields don't break it (it never constructs a `RibbonDto` literal itself).

- [ ] **Step 7: Commit**

```bash
git add src/worker/routes/ribbons.ts src/react-app/api.ts tests/worker/ribbons-route.test.ts
git commit -m "feat(flex-D): points + trainerScore/rank in GET /api/ribbons; extend client types (api.ts)"
```

---

## Self-Review

**Spec coverage (Section 4 of the design spec, "Ribbon incentive layer"):**

| Spec item | Task | Status |
| --- | --- | --- |
| `user_ribbons` table (userId, ribbonId, earnedAt, seenAt) | D1 | ✓ |
| `user_showcase` table (userId, ribbonId, slot) | D1 | ✓ |
| Points by difficulty (Fun/Type-Gen/Form Sets/Rarity-class/Grand tiers, tuned) | D2 | ✓ — extended to all 11 real categories (`Shiny`, `Events`, `Regional`, `Forms`, `Completion`, `Collector` all explicitly graded, not left to a fallback) |
| Trainer Score = sum of earned points | D2 | ✓ (`trainerScoreFor`) |
| Rank title thresholds (Novice → Collector → Ace → Elite → Champion → Master → Living Legend) | D2 | ✓ (`RANKS`/`rankFor`) |
| Sync: upsert currently-earned ids on ribbon fetch | D3 | ✓ (`syncEarnedRibbons`, called from `GET /api/ribbons`) |
| Earn moments: `newlyEarned` = earnedAt > seenAt | D3 | ✓ |
| Rarity %: `earnedCount(ribbonId) / totalUsers`, handles 0 users | D4 | ✓ (`ribbonRarity`; `totalUsers > 0 ? … : 0` guard) |
| Showcase: pin up to 6 earned ribbons, validated | D5 | ✓ (`PUT /api/ribbons/showcase`, `setShowcase` validates length/dup/earned) |
| Earn-moment ack: `POST /api/ribbons/seen` | D6 | ✓ |
| Nudges: nearest ~5 non-secret locked ribbons by progress ratio | D7 | ✓ (`nearestRibbons`) |
| `GET /api/ribbons` extended: `points`, `rarityPct`, `newlyEarned` per ribbon; `trainerScore`, `rank`, `showcase`, `nearest` top-level | D3+D4+D5+D7+D8 (assembled incrementally) | ✓ |
| `RibbonDto`/`api.ts` client types + new client calls for showcase + seen | D8 | ✓ (`RibbonsResponse`, `setRibbonShowcase`, `ackRibbonsSeen`) |

**Points table (final, with justification recap):** Fun 5 · Type/Shiny/Events 15 · Regional/Forms/Form Sets 20 · Completion 30 · Rarity Class/Collector 40 · Grand 100, plus a `shiny-living-dex` → Grand-tier (100) override. This departs slightly from the prompt's shorthand ("Type/Gen 15 … Rarity Class/Regional/Collector 40") because Phase C already split what used to be "Generation" into two real categories with different difficulty (`Regional` = own one generation's dex; `Completion` = own 25/50/75/100% of the *entire* National Dex) — grading both at the prompt's flat "40" would make a single-generation dex ribbon (9 of these, one per gen, `earned` relatively early) as valuable as the Living-Dex-adjacent 100%-completion ribbon. The chosen table keeps `Regional` at a `Forms`/`Form Sets`-like 20 and reserves 40 for `Rarity Class` (own every Legendary/Mythical/etc.) and `Collector` (own all 25 natures / all 27 balls) — both genuinely narrow, hard-to-complete-by-accident sets, matching the prompt's intent for those two families specifically.

**Rank thresholds (recap):** 0 / 100 / 300 / 600 / 1000 / 1600 / 2400, against an estimated catalog max of ~2,900 points (dominated by the volume of `Type`/`typemaster-*` tiered ribbons — see risk 1 below). Chosen so early ranks are quick wins and `Living Legend` requires broad, sustained collecting without being unreachable.

**Placeholder scan:** none — every step carries complete, runnable code, exact test bodies, and exact verification commands. The one deliberately-approximate number (drizzle-kit's next migration index, "0006 as of this writing") is explicitly flagged as something to double-check against `migrations/meta/_journal.json` at execution time, since it depends on whatever has merged to the branch by then — this is a check-the-file instruction, not a placeholder to fill in.

**Type consistency:**
- `Db = ReturnType<typeof getDb>` reused verbatim from the existing `auth/session.ts` / `routes/collection.ts` pattern in `incentive-store.ts` — no new DB-type abstraction introduced.
- `pointsForRibbon`/`trainerScoreFor` take a structural `{id, category}` — both `RibbonResult` (from `catalog.ts`) and the route's enriched `ribbonsOut` elements satisfy it without a cast.
- `nearestRibbons(results: readonly RibbonResult[])` accepts `ribbonsOut` (a `RibbonResult & {newlyEarned, rarityPct, points}[]`) directly — TS structural typing allows passing the wider array wherever the narrower element type is expected; no cast needed, confirmed by `npx tsc -b` in each task's verify step.
- `RibbonDto` in `api.ts` gains three **required** (non-optional) fields (`points`, `rarityPct`, `newlyEarned`) rather than optional ones, because the server now always sends them (for both signed-in and logged-out requests) — an optional field would let a future regression silently drop one without a type error.
- `showcase`/`nearest` are additive top-level response keys; `Ribbons.tsx` and any other `fetchRibbons()` caller only destructures the pre-existing keys it already used, so nothing breaks — verified by `npx tsc -b`/`npm run build` in D8's final step, not just by reasoning.

**Determinism / idempotency:**
- `syncEarnedRibbons` is called on *every* signed-in `GET /api/ribbons` but only ever inserts on first-earn (`onConflictDoNothing`), so `earnedAt` is stable and no duplicate rows can accumulate under repeated polling.
- `newlyEarned` intentionally has no auto-expiry — it stays `true` across unlimited re-fetches until `POST /api/ribbons/seen` is called (D3's test explicitly re-fetches once with no ack and asserts it's still `true`), so a client that misses showing the toast once (e.g. a dropped response) doesn't lose the moment.
- `nearestRibbons` ties break by ribbon id (`localeCompare`) so the "top 5" selection is stable across calls when ratios are equal, not order-of-catalog-dependent.

**Risks / open questions:**
1. **Type category numerically dominates achievable Trainer Score.** Because Phase C generates ~3 tiered `typemaster-*` ribbons per type (up to 18 types), the `Type` category alone can be 50+ ribbons at 15 pts — a large share of the ~2,900-point estimated max, disproportionate to any single `Type` ribbon's individual difficulty. This is intentional-but-worth-flagging: broad `Type` coverage correlates with overall dex completeness anyway, so it isn't an exploitable shortcut, but a future tune pass (out of scope here) might lower `Type` to 10 or cap its contribution.
2. **Rank thresholds are hand-tuned against an *estimated* max score**, not a computed one — the real max depends on how many species/types exist in the live reference data (which grows as more Pokémon/forms are seeded) and shifts a little every time the catalog grows. If a future catalog change moves the real max by more than ~20%, revisit the `RANKS` table; this plan doesn't wire an automatic "% of theoretical max" style rank so titles stay fixed, human-legible labels rather than a moving target.
3. **`ribbonRarity`'s `totalUsers` counts every row in `users`,** including accounts that never once opened the Ribbons page (so never got a `user_ribbons` sync). Early on, with very few users, `rarityPct` values will look coarse (e.g. jumping between 0%, 50%, 100%) — acceptable for a hobby-scale app, flagged in case it looks "off" during manual QA with a tiny seeded userbase.
4. **Showcase replace-then-insert is two statements, not a single transaction.** D1 (Cloudflare) doesn't require Drizzle transactions for this pattern and the existing codebase has no `db.batch`/transaction usage to mirror (checked — only sequential awaits, e.g. `routes/boxes.ts`), so `setShowcase` follows that same house style. A crash between the `delete` and the `insert` would leave a user's showcase empty rather than corrupted — an acceptable failure mode for a non-critical, easily-re-set feature, not extended with a transaction here to stay consistent with the rest of the codebase.
5. **`markRibbonsSeen` acks everything, not a targeted subset.** The spec's earn-moment flow is "ack after showing a moment"; this plan implements the simpler whole-user bump (matching "an ack … bumps `seenAt`" in the spec) rather than a per-ribbon-id ack. If Phase E's UI needs to show earn-moment toasts one at a time and only ack the ones actually displayed, `POST /api/ribbons/seen` may need a follow-up `{ribbonIds?: string[]}` body option — flagged for the Phase E planner, not built here since Phase E owns the UI/UX for how moments are surfaced.
6. **`nearest` is computed from `ribbonsOut`** (post-D4/D8 enrichment) so it carries `points`/`rarityPct`/`newlyEarned` on each entry "for free" — this is a plus for Phase E's dashboard (no need to re-fetch), but do double check in review that this doesn't balloon response size unreasonably; each `nearest` entry is a normal ribbon-shaped object, no heavier than one already-returned catalog row.

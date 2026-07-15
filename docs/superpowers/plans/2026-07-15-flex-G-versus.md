# Flex Phase G — Versus (head-to-head) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let anyone compare two PUBLIC trainers head-to-head at `/versus/:a/:b` — six scored rounds (Strength, Diversity, Completion, Shiny, Ribbon score, Rarity Crown), per-type and per-generation breakdowns, an overall winner, a spice-by-margin trash-talk verdict, and a shareable result card — plus signed-in users can save, list, and delete rivalries so they can rematch a rival in one click.

**Architecture:** Phase F already added handles, `isPublic`, `react-router-dom`, the public read endpoint `GET /api/u/:handle`, and the extracted per-user aggregation helpers (`buildCollectionSummary`/`buildReferenceData`/`computeRibbons` in `src/worker/ribbons/collection-summary.ts`). Phase G builds directly on those. The scoring is split into three pure, DOM-free, unit-tested modules under `src/worker/versus/` (mirroring `ribbons/scoring.ts`): `rounds.ts` (round definitions, per-round winner, overall outcome), `verdict.ts` (spice-by-margin trash-talk pool + deterministic picker), and `stats.ts` (the per-user aggregator that turns a `CollectionSummary` + computed ribbons into the six round metrics + per-type/per-gen breakdowns — the same per-user computation `public-profile.ts` does, extended). A new **public, unauthenticated** read endpoint `GET /api/versus/:a/:b` resolves both handles, requires BOTH sides to be public (either unknown or private → the identical `404 {error:"not_found"}` F uses), builds each side through `stats.ts`, and returns both sides + rounds + outcome + verdict — **never email for either side**. Saved rivalries add one auth-scoped table `rivalries` (migration 0010) keyed by a **stable `opponentUserId`** (resolved from the opponent's handle at save time, because handles are user-editable and would break a saved rivalry on rename) with three `requireUser` endpoints (`POST`/`GET`/`DELETE /api/rivalries`). Client-side, `routes.ts` gains a pure `versusPath(a, b)` helper (unit-tested); `App.tsx` registers `/versus/:a/:b` as a **top-level, ungated** route (outside `AppLayout`, exactly like `/u/:handle`); a new `Versus` page renders the result reusing `Avatar`/`RankBadge`/`TypeIcon`/`RibbonIcon`/`FavoritesStrip` and its own minimal public header (wordmark + `ThemeToggle`, no `AccountMenu`). Entry points wire it together: a "Compare with me" affordance on `PublicProfile`, a "Save rivalry" button on the Versus page, and a "Rivals" list + compare-by-handle box on the signed-in Home dashboard.

**Tech Stack:** Cloudflare Workers + Hono + Drizzle (D1) — unchanged bindings; Vitest (`@cloudflare/vitest-pool-workers`) for pure-logic, route, and pure-helper tests; drizzle-kit for the migration; React 19 + Vite + `react-router-dom@7.18.1` (already installed in F) for the client. No React component-test harness exists — React tasks extract all extractable logic into DOM-free unit-tested modules and are otherwise verified by `npx tsc -b` + `npm run build`.

## Global Constraints

- **Versus is PUBLIC.** `GET /api/versus/:a/:b` is unauthenticated and reads ONLY public trainers. The `/versus/:a/:b` page is a **top-level, ungated** react-router route (outside `AppLayout`, like `/u/:handle`) with its own minimal public header (wordmark link home + `ThemeToggle`, **no** `AccountMenu`, no account-only chrome).
- **NEVER email — hard constraint.** Neither side of any versus response, nor the versus page, may expose `email` or any `users` column beyond what the public profile already exposes (`userId` — only so the client can fetch the public avatar image — `handle`, `displayName`, `gender`, `hasAvatar`, favorites, showcase, `trainerScore`, `rank`, aggregate stats). Task G2's tests assert the serialized response contains **neither** side's email substring.
- **Private/unknown → identical 404.** If EITHER handle is unknown OR belongs to a user with `isPublic !== 1`, `GET /api/versus/:a/:b` returns the SAME `404 {error:"not_found"}` F uses — it must never reveal which side failed or that a private profile exists. Same rule for resolving a rivalry opponent's handle at save time.
- **Reuse, don't duplicate.** The per-user numbers both the public profile and versus need are computed by ONE aggregator (`src/worker/versus/stats.ts`) built on F3's `buildCollectionSummary`/`buildReferenceData`/`computeRibbons` and `ribbons/scoring.ts` (`trainerScoreFor`/`rankFor`/`pointsForRibbon`). No scoring logic is re-implemented. The route builds `ReferenceData` ONCE and passes it to both sides.
- **Pure, unit-tested scoring modules.** All round-scoring and verdict logic lives in DOM-free modules (`versus/rounds.ts`, `versus/verdict.ts`) with real Vitest coverage — no DB, no DOM, no `api.ts` import, mirroring `ribbons/scoring.ts`. The verdict picker is a PURE function that selects a tier by victory margin and a line by a deterministic index; playful, not mean, **no profanity**.
- **Saved rivalries are auth-scoped and keyed by a stable id.** The `rivalries` table stores `opponentUserId` (resolved from the handle at save time), NOT the mutable handle, so a saved rivalry survives the opponent renaming their handle; the opponent's current handle/name is joined from `users` at read time. Save/list/delete all require `requireUser`. Uniqueness constraint on `(userId, opponentUserId)`. A user cannot rival themselves. Account deletion cascades: rivalries where the deleted user is the owner OR the opponent are removed.
- **Migration via drizzle-kit, applied the repo's existing way.** Edit `src/db/schema/user.ts` to add the `rivalries` table, then run `npx drizzle-kit generate` (no `--name`). The highest existing migration is `migrations/0009_woozy_hammerhead.sql` (`migrations/meta/_journal.json` idx 9), so this should generate `migrations/0010_<random-name>.sql` + `migrations/meta/0010_snapshot.json` + a new `_journal.json` entry — **confirm the actual next index against `migrations/meta/_journal.json` at execution time** rather than assuming. Do **not** hand-edit generated files. `npm run db:local` must apply cleanly. Tests need no extra wiring — `vitest.config.ts` reads every file under `migrations/` into `TEST_MIGRATIONS`.
- **Additive only.** `GET /api/auth/me` / `UserDto` / `CurrentUser` and every existing endpoint keep every existing field. `routes.ts` gains `versusPath` without changing existing helpers.
- **Worker test D1 state accumulates across `it()` blocks** (reset only between files). Use **unique** emails AND unique handles per test case, and the real magic-link `signIn` helper (see `tests/worker/profile.test.ts`) for authenticated (rivalries) cases. Never assert absolute row counts across cases.
- **BUILD-GATE (resolved but respect the split).** Root `tsc -b` compiles `tests/tsconfig.json` (no DOM, Workers-only, excludes `react-app`) and `tests/tsconfig.react.json` (DOM-libbed, `react-app` only). A `tests/worker/**` test imports only worker/db code (never a component, never `api.ts`); a `tests/react-app/**` pure-logic test (e.g. `routes.test.ts`) imports only DOM-free modules under `src/react-app/**` (like `src/react-app/routes.ts`), never a component or `api.ts`. `react-router-dom` is DOM-only and is imported only from `src/react-app` components.
- **No component-test harness.** React tasks (G4 helper aside, G5, G6) extract extractable logic into DOM-free pure modules that get real Vitest coverage, and are otherwise verified by `npx tsc -b` + `npm run build`. Do **not** start a dev server; visual verification is a separate, out-of-band step. Follow the frontend-design skill's principles for the Versus page, but reuse existing components/tokens — keep it consistent with `PublicProfile`/`Home`, not a new design system.
- **Verify of record, every task:** `npx tsc -b && npm run build && npx vitest run <relevant test files>`. The final task (G6) additionally runs the full `npx vitest run`.
- **Scope discipline.** This phase does NOT build a global leaderboard, following/friends, multi-way (3+) versus, share-card image export (layout + copy-link only), or the standalone stats dashboard. 1v1 only.

---

### Task G1: Pure round-scoring module (`versus/rounds.ts`) + spice-by-margin verdict module (`versus/verdict.ts`) + unit tests

**Files:**
- Create: `src/worker/versus/rounds.ts` (pure — round metadata, per-round winner, overall outcome)
- Test: `tests/worker/versus-rounds.test.ts`
- Create: `src/worker/versus/verdict.ts` (pure — verdict tiers, pools, deterministic picker)
- Test: `tests/worker/versus-verdict.test.ts`

**Interfaces:**
- Produces (`versus/rounds.ts`): `RoundKey = "strength" | "diversity" | "completion" | "shiny" | "ribbons" | "rarity"`; `RoundValues = Record<RoundKey, number>`; `RoundResult = { key: RoundKey; label: string; format: "int" | "percent"; a: number; b: number; winner: "a" | "b" | "tie" }`; `ROUND_DEFS: readonly { key: RoundKey; label: string; format: "int" | "percent" }[]` (length 6, in display order); `winnerOf(a: number, b: number): "a" | "b" | "tie"` (higher wins, equal → tie); `computeRounds(a: RoundValues, b: RoundValues): RoundResult[]`; `overallOutcome(rounds: readonly RoundResult[]): { winner: "a" | "b" | "tie"; aWins: number; bWins: number; ties: number }`.
- Produces (`versus/verdict.ts`): `VerdictTier = "draw" | "nailbiter" | "solid" | "decisive" | "shutout"`; `VERDICT_POOLS: Record<VerdictTier, readonly string[]>` (templates using `{winner}`/`{loser}`); `verdictTier(aWins: number, bWins: number): VerdictTier`; `seedFrom(a: string, b: string): number`; `pickVerdict(args: { winner: "a" | "b" | "tie"; aWins: number; bWins: number; aName: string; bName: string; seed: number }): string`.
- Consumes: nothing (both modules are pure; no imports beyond types within `versus/`).

- [ ] **Step 1: Write the failing round-scoring tests**

Create `tests/worker/versus-rounds.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  ROUND_DEFS,
  winnerOf,
  computeRounds,
  overallOutcome,
  type RoundValues,
} from "../../src/worker/versus/rounds";

const A: RoundValues = { strength: 30, diversity: 20, completion: 0.5, shiny: 40, ribbons: 800, rarity: 120 };
const B: RoundValues = { strength: 10, diversity: 25, completion: 0.5, shiny: 12, ribbons: 300, rarity: 40 };

describe("ROUND_DEFS", () => {
  it("defines exactly the six rounds in display order", () => {
    expect(ROUND_DEFS.map((r) => r.key)).toEqual([
      "strength",
      "diversity",
      "completion",
      "shiny",
      "ribbons",
      "rarity",
    ]);
  });

  it("marks completion as a percentage and the rest as integers", () => {
    const byKey = Object.fromEntries(ROUND_DEFS.map((r) => [r.key, r.format]));
    expect(byKey.completion).toBe("percent");
    expect(byKey.strength).toBe("int");
    expect(byKey.rarity).toBe("int");
  });
});

describe("winnerOf", () => {
  it("higher value wins", () => {
    expect(winnerOf(5, 3)).toBe("a");
    expect(winnerOf(3, 5)).toBe("b");
  });
  it("equal values tie (including 0-0)", () => {
    expect(winnerOf(7, 7)).toBe("tie");
    expect(winnerOf(0, 0)).toBe("tie");
  });
});

describe("computeRounds", () => {
  it("returns one result per round def, in order, with correct winners", () => {
    const rounds = computeRounds(A, B);
    expect(rounds.map((r) => r.key)).toEqual(ROUND_DEFS.map((r) => r.key));
    const byKey = Object.fromEntries(rounds.map((r) => [r.key, r]));
    expect(byKey.strength.winner).toBe("a");
    expect(byKey.diversity.winner).toBe("b");
    expect(byKey.completion.winner).toBe("tie");
    expect(byKey.shiny.winner).toBe("a");
    expect(byKey.ribbons.winner).toBe("a");
    expect(byKey.rarity.winner).toBe("a");
  });

  it("carries each side's raw value and label through", () => {
    const rounds = computeRounds(A, B);
    const shiny = rounds.find((r) => r.key === "shiny")!;
    expect(shiny.a).toBe(40);
    expect(shiny.b).toBe(12);
    expect(shiny.label).toBe("Shiny");
  });
});

describe("overallOutcome", () => {
  it("tallies round wins and names the overall winner", () => {
    const out = overallOutcome(computeRounds(A, B));
    expect(out.aWins).toBe(4);
    expect(out.bWins).toBe(1);
    expect(out.ties).toBe(1);
    expect(out.winner).toBe("a");
  });

  it("is a tie when both sides win the same number of rounds", () => {
    const even = overallOutcome(
      computeRounds(
        { strength: 5, diversity: 1, completion: 0, shiny: 0, ribbons: 0, rarity: 0 },
        { strength: 1, diversity: 5, completion: 0, shiny: 0, ribbons: 0, rarity: 0 },
      ),
    );
    expect(even.aWins).toBe(1);
    expect(even.bWins).toBe(1);
    expect(even.winner).toBe("tie");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/worker/versus-rounds.test.ts`
Expected: FAIL — module `src/worker/versus/rounds` not found.

- [ ] **Step 3: Implement `src/worker/versus/rounds.ts`**

```ts
/**
 * Pure head-to-head round scoring for Versus (Flex Phase G). No I/O — takes
 * two plain `RoundValues` objects (produced by `versus/stats.ts`) and returns
 * per-round winners + the overall outcome. Mirrors `ribbons/scoring.ts`'s
 * pure-and-unit-tested posture; the route (`routes/versus.ts`) is the caller.
 *
 * The six rounds and the exact formula each metric comes from (formulas live
 * in `stats.ts`; this module only COMPARES the resulting numbers):
 *  - strength   : competitive investment  = 3*sixIvCount + 2*level100Count + megaFormCount + gmaxFormCount
 *  - diversity  : breadth                  = distinct types owned + distinct generations owned
 *  - completion : National Dex fraction    = ownedSpecies / totalSpecies   (0..1, shown as %)
 *  - shiny      : distinct shiny species   = shinySpeciesIds.size
 *  - ribbons    : Ribbon score             = trainerScoreFor(earned)
 *  - rarity     : Rarity Crown             = Σ points of earned ribbons in rare-flex categories
 * Every round is "higher wins"; equal values (including 0-0) tie.
 */

export type RoundKey = "strength" | "diversity" | "completion" | "shiny" | "ribbons" | "rarity";

/** The six per-side metric values a versus is scored on (see the formula notes above). */
export type RoundValues = Record<RoundKey, number>;

export type RoundResult = {
  key: RoundKey;
  label: string;
  /** How the client should format the raw values: "percent" multiplies by 100 and appends %. */
  format: "int" | "percent";
  a: number;
  b: number;
  winner: "a" | "b" | "tie";
};

/** Round metadata in display order. */
export const ROUND_DEFS: readonly { key: RoundKey; label: string; format: "int" | "percent" }[] = [
  { key: "strength", label: "Strength", format: "int" },
  { key: "diversity", label: "Diversity", format: "int" },
  { key: "completion", label: "Completion", format: "percent" },
  { key: "shiny", label: "Shiny", format: "int" },
  { key: "ribbons", label: "Ribbon Score", format: "int" },
  { key: "rarity", label: "Rarity Crown", format: "int" },
];

/** Higher value wins; equal (including 0-0) is a tie. */
export function winnerOf(a: number, b: number): "a" | "b" | "tie" {
  if (a > b) return "a";
  if (b > a) return "b";
  return "tie";
}

/** Scores all six rounds for two sides, in `ROUND_DEFS` order. */
export function computeRounds(a: RoundValues, b: RoundValues): RoundResult[] {
  return ROUND_DEFS.map((def) => ({
    key: def.key,
    label: def.label,
    format: def.format,
    a: a[def.key],
    b: b[def.key],
    winner: winnerOf(a[def.key], b[def.key]),
  }));
}

/** Tallies round wins and names the overall winner (most rounds won; equal round-wins → tie). */
export function overallOutcome(rounds: readonly RoundResult[]): {
  winner: "a" | "b" | "tie";
  aWins: number;
  bWins: number;
  ties: number;
} {
  let aWins = 0;
  let bWins = 0;
  let ties = 0;
  for (const r of rounds) {
    if (r.winner === "a") aWins++;
    else if (r.winner === "b") bWins++;
    else ties++;
  }
  const winner = aWins > bWins ? "a" : bWins > aWins ? "b" : "tie";
  return { winner, aWins, bWins, ties };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/worker/versus-rounds.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing verdict tests**

Create `tests/worker/versus-verdict.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  VERDICT_POOLS,
  verdictTier,
  seedFrom,
  pickVerdict,
} from "../../src/worker/versus/verdict";

describe("verdictTier", () => {
  it("scales by absolute round-win margin", () => {
    expect(verdictTier(3, 3)).toBe("draw"); // margin 0
    expect(verdictTier(3, 2)).toBe("nailbiter"); // margin 1
    expect(verdictTier(4, 2)).toBe("solid"); // margin 2
    expect(verdictTier(4, 1)).toBe("solid"); // margin 3
    expect(verdictTier(5, 1)).toBe("decisive"); // margin 4
    expect(verdictTier(5, 0)).toBe("decisive"); // margin 5
    expect(verdictTier(6, 0)).toBe("shutout"); // margin 6
  });

  it("is symmetric in its arguments", () => {
    expect(verdictTier(2, 5)).toBe(verdictTier(5, 2));
  });
});

describe("VERDICT_POOLS", () => {
  it("has a non-empty line pool for every tier, with winner/loser placeholders (except draw)", () => {
    for (const tier of ["draw", "nailbiter", "solid", "decisive", "shutout"] as const) {
      expect(VERDICT_POOLS[tier].length).toBeGreaterThan(0);
    }
    for (const tier of ["nailbiter", "solid", "decisive", "shutout"] as const) {
      for (const line of VERDICT_POOLS[tier]) expect(line).toMatch(/\{winner\}/);
    }
  });

  it("contains no profanity (tasteful pool)", () => {
    const banned = /\b(damn|hell|crap|suck|stupid|idiot|trash)\b/i;
    for (const lines of Object.values(VERDICT_POOLS)) {
      for (const line of lines) expect(line).not.toMatch(banned);
    }
  });
});

describe("seedFrom", () => {
  it("is deterministic and order-sensitive", () => {
    expect(seedFrom("ash", "gary")).toBe(seedFrom("ash", "gary"));
    expect(seedFrom("ash", "gary")).not.toBe(seedFrom("gary", "ash"));
  });
});

describe("pickVerdict", () => {
  it("fills winner/loser names for an a-win and is deterministic on the seed", () => {
    const line = pickVerdict({ winner: "a", aWins: 6, bWins: 0, aName: "Red", bName: "Blue", seed: 3 });
    expect(line).toContain("Red");
    expect(line).not.toContain("{winner}");
    expect(line).not.toContain("{loser}");
    // same seed + inputs → same line
    expect(pickVerdict({ winner: "a", aWins: 6, bWins: 0, aName: "Red", bName: "Blue", seed: 3 })).toBe(line);
  });

  it("names the b-side winner when b wins", () => {
    const line = pickVerdict({ winner: "b", aWins: 1, bWins: 4, aName: "Red", bName: "Blue", seed: 1 });
    expect(line).toContain("Blue");
  });

  it("uses the draw pool (no winner/loser substitution required) on a tie", () => {
    const line = pickVerdict({ winner: "tie", aWins: 3, bWins: 3, aName: "Red", bName: "Blue", seed: 0 });
    expect(line).not.toContain("{winner}");
    expect(line).not.toContain("{loser}");
    expect(line.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `npx vitest run tests/worker/versus-verdict.test.ts`
Expected: FAIL — module `src/worker/versus/verdict` not found.

- [ ] **Step 7: Implement `src/worker/versus/verdict.ts`**

```ts
/**
 * Pure spice-by-margin trash-talk verdict pool for Versus (Flex Phase G). The
 * bigger the round-win margin, the spicier the tier. `pickVerdict` is a pure
 * function: it selects a tier by margin and a line within that tier by a
 * DETERMINISTIC index (`seed % pool.length`), so the same matchup URL always
 * renders the same line. Playful, never mean, no profanity. No I/O.
 */

export type VerdictTier = "draw" | "nailbiter" | "solid" | "decisive" | "shutout";

/**
 * Line pools per tier. `{winner}`/`{loser}` are filled by `pickVerdict`; the
 * `draw` pool names nobody (it's a tie). Kept tasteful — gentle ribbing only.
 */
export const VERDICT_POOLS: Record<VerdictTier, readonly string[]> = {
  draw: [
    "Dead heat — {a} and {b} are the same trainer in different hats.",
    "It's a tie. Somebody go catch one more Pokémon and settle this.",
    "Too close to call. This is exactly what the rematch button is for.",
    "Perfectly balanced, as all collections should be.",
  ],
  nailbiter: [
    "{winner} edges out {loser} by a whisker. Screenshot it fast.",
    "{winner} takes the photo finish; {loser} was one shiny away.",
    "A one-round nail-biter — {winner} wins it, {loser} takes notes.",
    "{winner} squeaks past {loser}. Rematch practically guaranteed.",
  ],
  solid: [
    "{winner} has the better dex today, and {loser} knows it.",
    "Clear enough: {winner} over {loser}. Respectable all around.",
    "{winner} takes the set. {loser} put up a real fight, though.",
    "{winner} wins comfortably; {loser} has a little homework.",
  ],
  decisive: [
    "{winner} runs the table on {loser}. Not much to debate.",
    "{winner} well clear of {loser}. Time for the tall grass, {loser}.",
    "Lopsided — {winner} was in a different tier than {loser} today.",
    "{winner} makes it look easy against {loser}.",
  ],
  shutout: [
    "Clean sweep — {winner} shuts out {loser} six-for-six.",
    "{winner} six, {loser} zero. Someone go check on {loser}.",
    "Total domination: {winner} leaves {loser} nothing.",
    "Flawless victory for {winner}. {loser} gets a participation ribbon.",
  ],
};

/** Tier by absolute round-win margin: 0 draw · 1 nailbiter · 2-3 solid · 4-5 decisive · 6 shutout. */
export function verdictTier(aWins: number, bWins: number): VerdictTier {
  const margin = Math.abs(aWins - bWins);
  if (margin === 0) return "draw";
  if (margin === 1) return "nailbiter";
  if (margin <= 3) return "solid";
  if (margin <= 5) return "decisive";
  return "shutout";
}

/** Small deterministic hash of the ordered handle pair — the line index seed. */
export function seedFrom(a: string, b: string): number {
  const s = `${a}|${b}`;
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/**
 * Picks the verdict line for a finished matchup. Tie → a `draw` line with the
 * two names filled into `{a}`/`{b}`. Otherwise the winner's name fills
 * `{winner}` and the loser's `{loser}`, choosing a line by `seed % pool.length`.
 */
export function pickVerdict(args: {
  winner: "a" | "b" | "tie";
  aWins: number;
  bWins: number;
  aName: string;
  bName: string;
  seed: number;
}): string {
  const tier = verdictTier(args.aWins, args.bWins);
  const pool = VERDICT_POOLS[tier];
  const line = pool[args.seed % pool.length];
  if (args.winner === "tie") {
    return line.replaceAll("{a}", args.aName).replaceAll("{b}", args.bName);
  }
  const winnerName = args.winner === "a" ? args.aName : args.bName;
  const loserName = args.winner === "a" ? args.bName : args.aName;
  return line.replaceAll("{winner}", winnerName).replaceAll("{loser}", loserName);
}
```

- [ ] **Step 8: Run to verify it passes**

Run: `npx vitest run tests/worker/versus-verdict.test.ts`
Expected: PASS.

- [ ] **Step 9: Verify + commit**

Run: `npx vitest run tests/worker/versus-rounds.test.ts tests/worker/versus-verdict.test.ts && npx tsc -b && npm run build`
Expected: all green, clean typecheck, successful build.

```bash
git add src/worker/versus/rounds.ts tests/worker/versus-rounds.test.ts src/worker/versus/verdict.ts tests/worker/versus-verdict.test.ts
git commit -m "feat(flex-G): pure versus round-scoring + spice-by-margin verdict modules"
```

---

### Task G2: Versus aggregator (`versus/stats.ts`) + public read endpoint `GET /api/versus/:a/:b` — both sides, no email, private/unknown → 404

**Files:**
- Create: `src/worker/versus/stats.ts` (per-user aggregator built on `collection-summary.ts` + `scoring.ts`)
- Test: `tests/worker/versus-stats.test.ts`
- Create: `src/worker/routes/versus.ts` (public `GET /:a/:b`)
- Modify: `src/worker/index.ts` (mount `app.route("/api/versus", versusRoutes)`)
- Test: `tests/worker/versus.test.ts`
- Modify: `src/react-app/api.ts` (`VersusSideDto`, `VersusRoundDto`, `VersusOutcomeDto`, `VersusDto`, `fetchVersus`)

**Interfaces:**
- Produces (`versus/stats.ts`): `RARITY_FLEX_CATEGORIES: ReadonlySet<string>`; `VersusStatsUser = { userId: string; handle: string; displayName: string | null; gender: string | null; hasAvatar: boolean }`; `VersusStats = VersusStatsUser & { trainerScore: number; rank: string; favorites: FavoriteEnriched[]; showcase: { id: string; name: string; category: string }[]; stats: { dexCount: number; shinySpeciesCount: number; specimenCount: number; ribbonCount: number }; rounds: RoundValues; byType: Record<string, number>; byGen: Record<string, number> }`; `buildVersusStats(db, user: { id; handle; displayName; gender; avatarKey }, ref: ReferenceData): Promise<VersusStats>`. (`FavoriteEnriched` = the element type of `getFavoritesEnriched`'s result — `{ speciesId; name; homeId }`.)
- Produces (route): `GET /api/versus/:a/:b` — public. `200 { versus: { a: VersusSideResponse; b: VersusSideResponse; rounds; outcome; verdict } }`; `404 {error:"not_found"}` if either handle is unknown or the user is private. `VersusSideResponse` excludes email and every non-public column.
- Produces (client): `VersusSideDto`, `VersusRoundDto`, `VersusOutcomeDto`, `VersusDto`; `fetchVersus(a, b): Promise<VersusDto | null>` (`null` on 404).
- Consumes: `buildCollectionSummary`, `buildReferenceData`, `computeRibbons` (`../ribbons/collection-summary`); `trainerScoreFor`, `rankFor`, `pointsForRibbon` (`../ribbons/scoring`); `getShowcase` (`../ribbons/incentive-store`); `getFavoritesEnriched` (`../profile/favorites-store`); `normalizeHandle` (`../profile/handle`); `computeRounds`, `overallOutcome`, `type RoundValues` (`../versus/rounds`); `pickVerdict`, `seedFrom` (`../versus/verdict`); `users` table; `type ReferenceData` (`../ribbons/catalog`).

- [ ] **Step 1: Write the failing aggregator tests**

Create `tests/worker/versus-stats.test.ts`:

```ts
import { env } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import { getDb } from "../../src/worker/db";
import { users, species, specimens } from "../../src/db/schema";
import { buildReferenceData } from "../../src/worker/ribbons/collection-summary";
import { buildVersusStats, RARITY_FLEX_CATEGORIES } from "../../src/worker/versus/stats";

describe("versus/stats: buildVersusStats", () => {
  it("aggregates round metrics + type/gen breakdown for a user's collection", async () => {
    const db = getDb(env.DB);
    // Two reference species of different type + generation.
    await db.insert(species).values([
      { id: 7001, name: "vstat-a", generation: 1, types: JSON.stringify(["fire"]), homeId: 7001 },
      { id: 7002, name: "vstat-b", generation: 2, types: JSON.stringify(["water", "flying"]), homeId: 7002 },
    ]);
    await db.insert(users).values({ id: "vs-u1", email: "vs-u1@x.com", handle: "vs-u1", createdAt: 1 });
    const now = Date.now();
    await db.insert(specimens).values([
      { id: "vs-s1", userId: "vs-u1", speciesId: 7001, isShiny: 1, isEvent: 0, level: 100, source: "manual", createdAt: now, updatedAt: now },
      { id: "vs-s2", userId: "vs-u1", speciesId: 7002, isShiny: 0, isEvent: 0, source: "manual", createdAt: now, updatedAt: now },
    ]);

    const ref = await buildReferenceData(db);
    const u = { id: "vs-u1", handle: "vs-u1", displayName: "Vstat One", gender: null, avatarKey: null };
    const s = await buildVersusStats(db, u, ref);

    expect(s.handle).toBe("vs-u1");
    expect(s.displayName).toBe("Vstat One");
    expect(s.stats.dexCount).toBe(2);
    expect(s.stats.shinySpeciesCount).toBe(1);
    expect(s.stats.specimenCount).toBe(2);
    // breakdown: one fire, one water, one flying (species 7002 is dual-type)
    expect(s.byType.fire).toBe(1);
    expect(s.byType.water).toBe(1);
    expect(s.byType.flying).toBe(1);
    expect(s.byGen["1"]).toBe(1);
    expect(s.byGen["2"]).toBe(1);
    // diversity = distinct types (3) + distinct gens (2)
    expect(s.rounds.diversity).toBe(5);
    // shiny round = distinct shiny species
    expect(s.rounds.shiny).toBe(1);
    // strength = 3*sixIv + 2*level100 + mega + gmax = 0 + 2 + 0 + 0
    expect(s.rounds.strength).toBe(2);
    // completion is a 0..1 fraction of total reference species
    expect(s.rounds.completion).toBeGreaterThan(0);
    expect(s.rounds.completion).toBeLessThanOrEqual(1);
    // ribbons round mirrors trainerScore
    expect(s.rounds.ribbons).toBe(s.trainerScore);
    expect(typeof s.rounds.rarity).toBe("number");
  });

  it("exposes the rare-flex categories the rarity round scores", () => {
    expect(RARITY_FLEX_CATEGORIES.has("Rarity Class")).toBe(true);
    expect(RARITY_FLEX_CATEGORIES.has("Grand")).toBe(true);
    expect(RARITY_FLEX_CATEGORIES.has("Collector")).toBe(true);
    expect(RARITY_FLEX_CATEGORIES.has("Fun")).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/worker/versus-stats.test.ts`
Expected: FAIL — module `src/worker/versus/stats` not found.

- [ ] **Step 3: Implement `src/worker/versus/stats.ts`**

```ts
/**
 * Per-user aggregator for Versus (Flex Phase G). Turns a user's collection
 * (via F3's `buildCollectionSummary`) + computed ribbons into the six round
 * metrics `versus/rounds.ts` compares, plus a per-type / per-generation
 * breakdown for the diverging bars. Reuses the exact scoring the public
 * profile uses (`trainerScoreFor`/`rankFor`/`pointsForRibbon`) — no duplicated
 * scoring. The caller (`routes/versus.ts`, and reusable elsewhere) builds
 * `ReferenceData` ONCE and passes it in, so a two-sided versus loads the
 * global species/forms reference a single time. NEVER reads or returns email.
 */
import { buildCollectionSummary, computeRibbons } from "../ribbons/collection-summary";
import { trainerScoreFor, rankFor, pointsForRibbon } from "../ribbons/scoring";
import { getShowcase } from "../ribbons/incentive-store";
import { getFavoritesEnriched } from "../profile/favorites-store";
import type { getDb } from "../db";
import type { ReferenceData } from "../ribbons/catalog";
import type { RoundValues } from "./rounds";

type Db = ReturnType<typeof getDb>;

/** Ribbon categories that count toward the "Rarity Crown" round (the rare flexes). */
export const RARITY_FLEX_CATEGORIES: ReadonlySet<string> = new Set(["Rarity Class", "Grand", "Collector"]);

/** The identity fields safe to echo publicly (never email). */
export type VersusStatsUser = {
  userId: string;
  handle: string;
  displayName: string | null;
  gender: string | null;
  hasAvatar: boolean;
};

export type VersusStats = VersusStatsUser & {
  trainerScore: number;
  rank: string;
  favorites: Awaited<ReturnType<typeof getFavoritesEnriched>>;
  showcase: { id: string; name: string; category: string }[];
  stats: { dexCount: number; shinySpeciesCount: number; specimenCount: number; ribbonCount: number };
  rounds: RoundValues;
  /** Owned distinct-species count per lowercase type (sparse — only present types). */
  byType: Record<string, number>;
  /** Owned distinct-species count per generation, keyed by the number as a string (sparse). */
  byGen: Record<string, number>;
};

/**
 * Builds one side of a versus. `user` is the resolved `users` row subset
 * (never carrying email into this function). `ref` is shared across both
 * sides by the caller.
 */
export async function buildVersusStats(
  db: Db,
  user: { id: string; handle: string; displayName: string | null; gender: string | null; avatarKey: string | null },
  ref: ReferenceData,
): Promise<VersusStats> {
  const summary = await buildCollectionSummary(db, user.id);
  const ribbons = computeRibbons(summary, ref);
  const earned = ribbons.filter((r) => r.earned);
  const trainerScore = trainerScoreFor(earned);
  const rank = rankFor(trainerScore);

  const rarity = earned.reduce(
    (sum, r) => (RARITY_FLEX_CATEGORIES.has(r.category) ? sum + pointsForRibbon(r) : sum),
    0,
  );

  // Per-type / per-generation breakdown over the user's OWNED species,
  // resolved against the shared reference data.
  const speciesById = new Map(ref.species.map((s) => [s.id, s] as const));
  const byType: Record<string, number> = {};
  const byGen: Record<string, number> = {};
  for (const speciesId of summary.speciesIds) {
    const meta = speciesById.get(speciesId);
    if (!meta) continue;
    const genKey = String(meta.generation);
    byGen[genKey] = (byGen[genKey] ?? 0) + 1;
    for (const type of meta.types) {
      const key = type.toLowerCase();
      byType[key] = (byType[key] ?? 0) + 1;
    }
  }
  const distinctTypes = Object.keys(byType).length;
  const distinctGens = Object.keys(byGen).length;
  const totalSpecies = ref.species.length;

  const byId = new Map(ribbons.map((r) => [r.id, r] as const));
  const showcaseSlots = await getShowcase(db, user.id);
  const showcase = showcaseSlots
    .filter((id): id is string => id !== null)
    .map((id) => byId.get(id))
    .filter((r): r is NonNullable<typeof r> => r !== undefined)
    .map((r) => ({ id: r.id, name: r.name, category: r.category }));

  const favorites = await getFavoritesEnriched(db, user.id);

  const rounds: RoundValues = {
    strength: 3 * summary.sixIvCount + 2 * summary.level100Count + summary.megaFormCount + summary.gmaxFormCount,
    diversity: distinctTypes + distinctGens,
    completion: totalSpecies > 0 ? summary.speciesIds.size / totalSpecies : 0,
    shiny: summary.shinySpeciesIds.size,
    ribbons: trainerScore,
    rarity,
  };

  return {
    userId: user.id,
    handle: user.handle,
    displayName: user.displayName,
    gender: user.gender,
    hasAvatar: user.avatarKey !== null,
    trainerScore,
    rank,
    favorites,
    showcase,
    stats: {
      dexCount: summary.speciesIds.size,
      shinySpeciesCount: summary.shinySpeciesIds.size,
      specimenCount: summary.specimenCount,
      ribbonCount: earned.length,
    },
    rounds,
    byType,
    byGen,
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/worker/versus-stats.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing endpoint tests**

Create `tests/worker/versus.test.ts`:

```ts
import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import worker from "../../src/worker/index";

const call = async (path: string, init?: RequestInit, cookie?: string) => {
  const ctx = createExecutionContext();
  const headers = new Headers(init?.headers);
  if (cookie) headers.set("Cookie", cookie);
  const res = await worker.fetch(new Request(`http://x${path}`, { ...init, headers }), env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
};
const postJson = (path: string, body: unknown, cookie?: string) =>
  call(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }, cookie);
const putJson = (path: string, body: unknown, cookie?: string) =>
  call(path, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }, cookie);

const signIn = async (email: string): Promise<string> => {
  const r1 = await postJson("/api/auth/request-link", { email });
  const { devLink } = (await r1.json()) as any;
  const path = new URL(devLink).pathname + new URL(devLink).search;
  const verify = await call(path, { redirect: "manual" } as any);
  return verify.headers.get("set-cookie")!.split(";")[0];
};

/** Signs in, sets a display name (backfills a handle) then overrides the handle explicitly. */
const makeTrainer = async (email: string, handle: string, name: string): Promise<string> => {
  const cookie = await signIn(email);
  await putJson("/api/profile", { displayName: name, gender: "boy" }, cookie);
  await putJson("/api/profile/handle", { handle }, cookie);
  return cookie;
};

describe("GET /api/versus/:a/:b", () => {
  it("404s when a side is unknown", async () => {
    await makeTrainer("vsx-a@x.com", "vsx-real", "Real One");
    const res = await call("/api/versus/vsx-real/vsx-nobody");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
  });

  it("compares two public trainers WITHOUT leaking either email, readable without a cookie", async () => {
    await makeTrainer("vsx-red@x.com", "vsx-red", "Red");
    await makeTrainer("vsx-blue@x.com", "vsx-blue", "Blue");

    const res = await call("/api/versus/vsx-red/vsx-blue");
    expect(res.status).toBe(200);
    const raw = await res.text();
    expect(raw).not.toContain("vsx-red@x.com");
    expect(raw).not.toContain("vsx-blue@x.com");
    const body = JSON.parse(raw) as any;
    expect(body.versus.a.handle).toBe("vsx-red");
    expect(body.versus.b.handle).toBe("vsx-blue");
    expect(body.versus.a).not.toHaveProperty("email");
    expect(body.versus.b).not.toHaveProperty("email");
    expect(Array.isArray(body.versus.rounds)).toBe(true);
    expect(body.versus.rounds).toHaveLength(6);
    expect(["a", "b", "tie"]).toContain(body.versus.outcome.winner);
    expect(typeof body.versus.verdict).toBe("string");
    expect(body.versus.verdict.length).toBeGreaterThan(0);
  });

  it("is case-insensitive on both handles", async () => {
    await makeTrainer("vsx-c1@x.com", "vsx-caseone", "Case One");
    await makeTrainer("vsx-c2@x.com", "vsx-casetwo", "Case Two");
    const res = await call("/api/versus/VSX-CaseOne/VSX-CaseTwo");
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.versus.a.handle).toBe("vsx-caseone");
  });

  it("404s (indistinguishably) when a side is private", async () => {
    await makeTrainer("vsx-pub@x.com", "vsx-pub", "Pub");
    const ghost = await makeTrainer("vsx-ghost@x.com", "vsx-ghost", "Ghost");
    await putJson("/api/profile/visibility", { isPublic: false }, ghost);

    const res = await call("/api/versus/vsx-pub/vsx-ghost");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
  });
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `npx vitest run tests/worker/versus.test.ts`
Expected: FAIL — no `/api/versus/:a/:b` route yet.

- [ ] **Step 7: Implement `src/worker/routes/versus.ts`**

```ts
import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { users } from "../../db/schema";
import { normalizeHandle } from "../profile/handle";
import { buildReferenceData } from "../ribbons/collection-summary";
import { buildVersusStats } from "../versus/stats";
import { computeRounds, overallOutcome } from "../versus/rounds";
import { pickVerdict, seedFrom } from "../versus/verdict";

export const versusRoutes = new Hono<{ Bindings: Env }>();

/** Serializes one side of a versus — public fields only, never email. */
function sideResponse(s: Awaited<ReturnType<typeof buildVersusStats>>) {
  return {
    userId: s.userId, // ONLY exposed so the client can fetch the public avatar image
    handle: s.handle,
    displayName: s.displayName,
    gender: s.gender,
    hasAvatar: s.hasAvatar,
    trainerScore: s.trainerScore,
    rank: s.rank,
    favorites: s.favorites,
    showcase: s.showcase,
    stats: s.stats,
    byType: s.byType,
    byGen: s.byGen,
  };
}

/**
 * Public, unauthenticated head-to-head of two trainers by handle. Both sides
 * must be public; if EITHER handle is unknown or that user is private
 * (`isPublic !== 1`), returns the IDENTICAL 404 the public profile uses — never
 * revealing which side failed or that a private profile exists. Never returns
 * email for either side.
 */
versusRoutes.get("/:a/:b", async (c) => {
  const handleA = normalizeHandle(c.req.param("a"));
  const handleB = normalizeHandle(c.req.param("b"));
  const db = getDb(c.env.DB);

  const [rowsA, rowsB] = await Promise.all([
    db.select().from(users).where(eq(users.handle, handleA)).limit(1),
    db.select().from(users).where(eq(users.handle, handleB)).limit(1),
  ]);
  const userA = rowsA[0];
  const userB = rowsB[0];
  if (!userA || userA.isPublic !== 1 || !userB || userB.isPublic !== 1) {
    return c.json({ error: "not_found" }, 404);
  }

  const ref = await buildReferenceData(db);
  const [sideA, sideB] = await Promise.all([
    buildVersusStats(db, userA, ref),
    buildVersusStats(db, userB, ref),
  ]);

  const rounds = computeRounds(sideA.rounds, sideB.rounds);
  const outcome = overallOutcome(rounds);
  const verdict = pickVerdict({
    winner: outcome.winner,
    aWins: outcome.aWins,
    bWins: outcome.bWins,
    aName: sideA.displayName ?? sideA.handle,
    bName: sideB.displayName ?? sideB.handle,
    seed: seedFrom(sideA.handle, sideB.handle),
  });

  return c.json({
    versus: {
      a: sideResponse(sideA),
      b: sideResponse(sideB),
      rounds,
      outcome,
      verdict,
    },
  });
});
```

Mount it in `src/worker/index.ts` (add the import alongside the other route imports and the mount alongside the other `app.route` calls — place it directly after the `/api/u` mount):

```ts
import { versusRoutes } from "./routes/versus";
```

```ts
app.route("/api/versus", versusRoutes);
```

- [ ] **Step 8: Run to verify it passes**

Run: `npx vitest run tests/worker/versus.test.ts && npx tsc -b`
Expected: PASS (all four cases, including both no-email assertions and private→404).

- [ ] **Step 9: Add the client types + `fetchVersus` in `src/react-app/api.ts`**

Append to the "Public profile" section of `src/react-app/api.ts` (reuses `FavoriteDto`, `PublicShowcaseRibbon`, `PublicProfileStats`, and `handleJson` already defined there):

```ts
/* ---------- Versus (Flex Phase G) ---------- */

export type VersusRoundDto = {
	key: "strength" | "diversity" | "completion" | "shiny" | "ribbons" | "rarity";
	label: string;
	/** "percent" values are 0..1 fractions the UI renders as a percentage; "int" are raw counts. */
	format: "int" | "percent";
	a: number;
	b: number;
	winner: "a" | "b" | "tie";
};

export type VersusOutcomeDto = {
	winner: "a" | "b" | "tie";
	aWins: number;
	bWins: number;
	ties: number;
};

export type VersusSideDto = {
	/** Only used to build the public avatar URL (`avatarUrl(userId)`); no other user id is exposed. */
	userId: string;
	handle: string;
	displayName: string | null;
	gender: string | null;
	hasAvatar: boolean;
	trainerScore: number;
	rank: string;
	favorites: FavoriteDto[];
	showcase: PublicShowcaseRibbon[];
	stats: PublicProfileStats;
	/** Owned distinct-species count per lowercase type (sparse — only present types). */
	byType: Record<string, number>;
	/** Owned distinct-species count per generation, keyed by the number as a string (sparse). */
	byGen: Record<string, number>;
};

export type VersusDto = {
	a: VersusSideDto;
	b: VersusSideDto;
	rounds: VersusRoundDto[];
	outcome: VersusOutcomeDto;
	verdict: string;
};

/**
 * Fetches a public head-to-head comparison of two trainers by handle. Returns
 * `null` for a 404 — which covers an unknown handle OR a private trainer on
 * either side (the server makes them indistinguishable on purpose). Never
 * sends credentials; the endpoint is public and returns no account-private
 * data for either side.
 */
export async function fetchVersus(a: string, b: string): Promise<VersusDto | null> {
	const res = await fetch(`/api/versus/${encodeURIComponent(a)}/${encodeURIComponent(b)}`);
	if (res.status === 404) return null;
	const body = await handleJson<{ versus: VersusDto }>(res, "fetch versus");
	return body.versus;
}
```

- [ ] **Step 10: Final verify + commit**

Run: `npx vitest run tests/worker/versus-stats.test.ts tests/worker/versus.test.ts tests/worker/ribbons.test.ts tests/worker/public-profile.test.ts && npx tsc -b && npm run build`
Expected: all green (the ribbons + public-profile suites confirm the shared aggregation path is untouched).

```bash
git add src/worker/versus/stats.ts tests/worker/versus-stats.test.ts src/worker/routes/versus.ts src/worker/index.ts tests/worker/versus.test.ts src/react-app/api.ts
git commit -m "feat(flex-G): versus aggregator (stats.ts) + public GET /api/versus/:a/:b (no email, private->404)"
```

---

### Task G3: `rivalries` table (migration 0010) + store + auth-scoped save/list/delete endpoints + account-delete cascade + client wrappers

**Files:**
- Modify: `src/db/schema/user.ts` (add the `rivalries` table)
- New (generated): `migrations/0010_<name>.sql`, `migrations/meta/0010_snapshot.json`, updated `migrations/meta/_journal.json`
- Test: `tests/db/schema.test.ts` (append round-trip + uniqueness test)
- Create: `src/worker/rivalries/rivalries-store.ts` (data-access — save/list/delete)
- Test: `tests/worker/rivalries-store.test.ts`
- Create: `src/worker/routes/rivalries.ts` (`POST /`, `GET /`, `DELETE /:id`)
- Modify: `src/worker/index.ts` (mount `app.route("/api/rivalries", rivalryRoutes)`)
- Modify: `src/worker/routes/auth.ts` (delete a user's rivalries — owned AND as-opponent — in the account-deletion batch)
- Test: `tests/worker/rivalries.test.ts`
- Modify: `src/react-app/api.ts` (`RivalryDto`, `saveRivalry`, `listRivalries`, `deleteRivalry`)

**Interfaces:**
- Produces (schema): `rivalries` table `{ id: text pk; userId: text→users.id; opponentUserId: text→users.id; createdAt: integer }` with `unique(userId, opponentUserId)`.
- Produces (store): `saveRivalry(db, userId, opponentUserId, now): Promise<void>` (`onConflictDoNothing` on the unique index — re-saving is idempotent); `listRivalries(db, userId): Promise<RivalryRow[]>` where `RivalryRow = { id: string; opponentUserId: string; handle: string | null; displayName: string | null; hasAvatar: boolean; isPublic: boolean; createdAt: number }` (joined from `users`, newest first); `deleteRivalry(db, userId, id): Promise<boolean>` (scoped to `userId`; returns whether a row was removed).
- Produces (route): `POST /api/rivalries` — body `{ handle: string }`, `requireUser`; resolves the handle to a PUBLIC user (unknown/private → `404 {error:"not_found"}`), rejects self (`400 {errors}`), saves, returns `{ rivalries: RivalryDto[] }` (the refreshed list). `GET /api/rivalries` — `requireUser`, returns `{ rivalries: RivalryDto[] }`. `DELETE /api/rivalries/:id` — `requireUser`, returns `{ ok: true }` (idempotent — deleting an id you don't own is a no-op that still returns ok).
- Produces (client): `RivalryDto = { id: string; opponentUserId: string; handle: string | null; displayName: string | null; hasAvatar: boolean; isPublic: boolean; createdAt: number }`; `saveRivalry(handle): Promise<{ rivalries: RivalryDto[] }>`; `listRivalries(): Promise<{ rivalries: RivalryDto[] }>`; `deleteRivalry(id): Promise<void>`.
- Consumes: `requireUser`; `users` table; `normalizeHandle` (`../profile/handle`).

- [ ] **Step 1: Add the `rivalries` table to `src/db/schema/user.ts`**

Append after the `userFavorites` table (the file already imports `sqliteTable`, `integer`, `text`, `unique`):

```ts
/**
 * A signed-in user's saved rivalries. The opponent is stored by the STABLE
 * `opponentUserId` (resolved from their handle at save time), NOT by handle —
 * handles are user-editable (Settings), so a handle would break the saved
 * rivalry the moment the opponent renamed themselves. The opponent's CURRENT
 * handle/name is joined from `users` at read time. Unique per (owner,
 * opponent) so the same rival can't be saved twice.
 */
export const rivalries = sqliteTable(
  "rivalries",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id),
    opponentUserId: text("opponent_user_id").notNull().references(() => users.id),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [unique("rivalries_user_id_opponent_user_id_unique").on(t.userId, t.opponentUserId)],
);
```

- [ ] **Step 2: Write the failing schema test**

Append to `tests/db/schema.test.ts` (after the existing final `describe` block — reuse the file's existing `getDb`/`eq` imports; import `rivalries` + `users` from `../../src/db/schema`):

```ts
describe("rivalries schema", () => {
  it("round-trips a rivalry and enforces (userId, opponentUserId) uniqueness", async () => {
    const db = getDb(env.DB);
    await db.insert(users).values([
      { id: "riv-owner", email: "riv-owner@x.com", createdAt: 1 },
      { id: "riv-opp", email: "riv-opp@x.com", createdAt: 1 },
    ]);
    await db.insert(rivalries).values({ id: "riv-1", userId: "riv-owner", opponentUserId: "riv-opp", createdAt: 10 });

    const [row] = await db.select().from(rivalries).where(eq(rivalries.id, "riv-1"));
    expect(row.userId).toBe("riv-owner");
    expect(row.opponentUserId).toBe("riv-opp");

    await expect(
      db.insert(rivalries).values({ id: "riv-2", userId: "riv-owner", opponentUserId: "riv-opp", createdAt: 11 }),
    ).rejects.toThrow();
  });
});
```

(Add `rivalries` to the existing `import { ... } from "../../src/db/schema"` line at the top of the file if it isn't already imported.)

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run tests/db/schema.test.ts`
Expected: FAIL — `rivalries` isn't a valid Drizzle table ref yet (TypeScript fails to compile the file).

- [ ] **Step 4: Generate the migration**

Run: `npx drizzle-kit generate`

Confirm `migrations/meta/_journal.json` gained one new entry (expected idx `10`) and inspect the generated `migrations/0010_<name>.sql`. It should be a single `CREATE TABLE` plus a unique index, shaped roughly like:

```sql
CREATE TABLE `rivalries` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`opponent_user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`opponent_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rivalries_user_id_opponent_user_id_unique` ON `rivalries` (`user_id`,`opponent_user_id`);
```

If drizzle-kit emits changes to any OTHER table, STOP and re-check the schema edit rather than hand-patching. Trust the actual generated index number over the `0010` written here.

- [ ] **Step 5: Apply locally + verify the schema test**

Run: `npm run db:local`
Run: `npx vitest run tests/db/schema.test.ts && npx tsc -b`
Expected: both green.

- [ ] **Step 6: Write the failing store tests**

Create `tests/worker/rivalries-store.test.ts`:

```ts
import { env } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import { getDb } from "../../src/worker/db";
import { users } from "../../src/db/schema";
import { saveRivalry, listRivalries, deleteRivalry } from "../../src/worker/rivalries/rivalries-store";

describe("rivalries-store", () => {
  it("saves, lists (joined to the opponent's current profile), and deletes", async () => {
    const db = getDb(env.DB);
    await db.insert(users).values([
      { id: "rs-owner", email: "rs-owner@x.com", createdAt: 1 },
      { id: "rs-opp", email: "rs-opp@x.com", handle: "rs-opp-handle", displayName: "Opp Name", isPublic: 1, createdAt: 1 },
    ]);

    await saveRivalry(db, "rs-owner", "rs-opp", 100);
    const list = await listRivalries(db, "rs-owner");
    expect(list).toHaveLength(1);
    expect(list[0].opponentUserId).toBe("rs-opp");
    expect(list[0].handle).toBe("rs-opp-handle");
    expect(list[0].displayName).toBe("Opp Name");
    expect(list[0].isPublic).toBe(true);

    const removed = await deleteRivalry(db, "rs-owner", list[0].id);
    expect(removed).toBe(true);
    expect(await listRivalries(db, "rs-owner")).toHaveLength(0);
  });

  it("is idempotent on re-save (unique on owner+opponent)", async () => {
    const db = getDb(env.DB);
    await db.insert(users).values([
      { id: "rs-o2", email: "rs-o2@x.com", createdAt: 1 },
      { id: "rs-p2", email: "rs-p2@x.com", handle: "rs-p2-h", createdAt: 1 },
    ]);
    await saveRivalry(db, "rs-o2", "rs-p2", 1);
    await saveRivalry(db, "rs-o2", "rs-p2", 2);
    expect(await listRivalries(db, "rs-o2")).toHaveLength(1);
  });

  it("deleteRivalry only removes the caller's own row", async () => {
    const db = getDb(env.DB);
    await db.insert(users).values([
      { id: "rs-o3", email: "rs-o3@x.com", createdAt: 1 },
      { id: "rs-o4", email: "rs-o4@x.com", createdAt: 1 },
      { id: "rs-p3", email: "rs-p3@x.com", createdAt: 1 },
    ]);
    await saveRivalry(db, "rs-o3", "rs-p3", 1);
    const [mine] = await listRivalries(db, "rs-o3");
    // rs-o4 tries to delete rs-o3's rivalry id — no-op
    expect(await deleteRivalry(db, "rs-o4", mine.id)).toBe(false);
    expect(await listRivalries(db, "rs-o3")).toHaveLength(1);
  });
});
```

- [ ] **Step 7: Run to verify it fails**

Run: `npx vitest run tests/worker/rivalries-store.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 8: Implement `src/worker/rivalries/rivalries-store.ts`**

```ts
/**
 * Data-access for saved rivalries (Flex Phase G). All D1 I/O for the
 * auth-scoped `POST/GET/DELETE /api/rivalries` endpoints lives here; the
 * opponent is keyed by the stable `opponentUserId`, and their CURRENT
 * handle/name is joined from `users` at read time (so a rename doesn't break
 * a saved rivalry). `routes/rivalries.ts` is the only caller.
 */
import { and, desc, eq } from "drizzle-orm";
import type { getDb } from "../db";
import { rivalries, users } from "../../db/schema";

type Db = ReturnType<typeof getDb>;

export type RivalryRow = {
  id: string;
  opponentUserId: string;
  handle: string | null;
  displayName: string | null;
  hasAvatar: boolean;
  isPublic: boolean;
  createdAt: number;
};

/** Saves a rivalry (idempotent — the `(userId, opponentUserId)` unique index makes a re-save a no-op). */
export async function saveRivalry(db: Db, userId: string, opponentUserId: string, now: number): Promise<void> {
  await db
    .insert(rivalries)
    .values({ id: crypto.randomUUID(), userId, opponentUserId, createdAt: now })
    .onConflictDoNothing({ target: [rivalries.userId, rivalries.opponentUserId] });
}

/** Lists a user's saved rivalries, newest first, joined to each opponent's current profile. */
export async function listRivalries(db: Db, userId: string): Promise<RivalryRow[]> {
  const rows = await db
    .select({
      id: rivalries.id,
      opponentUserId: rivalries.opponentUserId,
      handle: users.handle,
      displayName: users.displayName,
      avatarKey: users.avatarKey,
      isPublic: users.isPublic,
      createdAt: rivalries.createdAt,
    })
    .from(rivalries)
    .innerJoin(users, eq(rivalries.opponentUserId, users.id))
    .where(eq(rivalries.userId, userId))
    .orderBy(desc(rivalries.createdAt));
  return rows.map((r) => ({
    id: r.id,
    opponentUserId: r.opponentUserId,
    handle: r.handle,
    displayName: r.displayName,
    hasAvatar: r.avatarKey !== null,
    isPublic: r.isPublic === 1,
    createdAt: r.createdAt,
  }));
}

/** Deletes one of the caller's rivalries by id (scoped to `userId`). Returns whether a row was removed. */
export async function deleteRivalry(db: Db, userId: string, id: string): Promise<boolean> {
  const existing = await db
    .select({ id: rivalries.id })
    .from(rivalries)
    .where(and(eq(rivalries.id, id), eq(rivalries.userId, userId)))
    .limit(1);
  if (existing.length === 0) return false;
  await db.delete(rivalries).where(and(eq(rivalries.id, id), eq(rivalries.userId, userId)));
  return true;
}
```

- [ ] **Step 9: Run to verify it passes**

Run: `npx vitest run tests/worker/rivalries-store.test.ts`
Expected: PASS.

- [ ] **Step 10: Write the failing route tests**

Create `tests/worker/rivalries.test.ts`:

```ts
import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import worker from "../../src/worker/index";

const call = async (path: string, init?: RequestInit, cookie?: string) => {
  const ctx = createExecutionContext();
  const headers = new Headers(init?.headers);
  if (cookie) headers.set("Cookie", cookie);
  const res = await worker.fetch(new Request(`http://x${path}`, { ...init, headers }), env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
};
const postJson = (path: string, body: unknown, cookie?: string) =>
  call(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }, cookie);
const putJson = (path: string, body: unknown, cookie?: string) =>
  call(path, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }, cookie);

const signIn = async (email: string): Promise<string> => {
  const r1 = await postJson("/api/auth/request-link", { email });
  const { devLink } = (await r1.json()) as any;
  const path = new URL(devLink).pathname + new URL(devLink).search;
  const verify = await call(path, { redirect: "manual" } as any);
  return verify.headers.get("set-cookie")!.split(";")[0];
};
const makeTrainer = async (email: string, handle: string, name: string): Promise<string> => {
  const cookie = await signIn(email);
  await putJson("/api/profile", { displayName: name, gender: "boy" }, cookie);
  await putJson("/api/profile/handle", { handle }, cookie);
  return cookie;
};

describe("/api/rivalries", () => {
  it("rejects list/save/delete when not signed in (401)", async () => {
    expect((await call("/api/rivalries")).status).toBe(401);
    expect((await postJson("/api/rivalries", { handle: "whoever" })).status).toBe(401);
    expect((await call("/api/rivalries/whatever", { method: "DELETE" })).status).toBe(401);
  });

  it("saves a rivalry by handle, lists it, then deletes it", async () => {
    const me = await makeTrainer("riv-me@x.com", "riv-me", "Me");
    await makeTrainer("riv-rival@x.com", "riv-rival", "Rival");

    const saved = await postJson("/api/rivalries", { handle: "riv-rival" }, me);
    expect(saved.status).toBe(200);
    const savedBody = (await saved.json()) as any;
    expect(savedBody.rivalries).toHaveLength(1);
    expect(savedBody.rivalries[0].handle).toBe("riv-rival");
    expect(savedBody.rivalries[0].displayName).toBe("Rival");

    const list = await call("/api/rivalries", undefined, me);
    const listBody = (await list.json()) as any;
    expect(listBody.rivalries).toHaveLength(1);

    const id = listBody.rivalries[0].id;
    const del = await call(`/api/rivalries/${id}`, { method: "DELETE" }, me);
    expect(del.status).toBe(200);
    const after = await call("/api/rivalries", undefined, me);
    expect(((await after.json()) as any).rivalries).toHaveLength(0);
  });

  it("404s saving an unknown or private opponent (indistinguishable)", async () => {
    const me = await makeTrainer("riv-me2@x.com", "riv-me2", "Me2");
    const unknown = await postJson("/api/rivalries", { handle: "riv-nobody" }, me);
    expect(unknown.status).toBe(404);

    const ghost = await makeTrainer("riv-ghost@x.com", "riv-ghost", "Ghost");
    await putJson("/api/profile/visibility", { isPublic: false }, ghost);
    const priv = await postJson("/api/rivalries", { handle: "riv-ghost" }, me);
    expect(priv.status).toBe(404);
  });

  it("rejects rivaling yourself (400)", async () => {
    const me = await makeTrainer("riv-self@x.com", "riv-self", "Self");
    const res = await postJson("/api/rivalries", { handle: "riv-self" }, me);
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 11: Run to verify it fails**

Run: `npx vitest run tests/worker/rivalries.test.ts`
Expected: FAIL — no `/api/rivalries` routes yet.

- [ ] **Step 12: Implement `src/worker/routes/rivalries.ts`**

```ts
import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { users } from "../../db/schema";
import { requireUser } from "../auth/current-user";
import { normalizeHandle } from "../profile/handle";
import { saveRivalry, listRivalries, deleteRivalry } from "../rivalries/rivalries-store";

export const rivalryRoutes = new Hono<{ Bindings: Env }>();

/** Lists the signed-in user's saved rivalries (newest first). */
rivalryRoutes.get("/", async (c) => {
  const user = await requireUser(c);
  const db = getDb(c.env.DB);
  return c.json({ rivalries: await listRivalries(db, user.id) });
});

/**
 * Saves a rivalry against a PUBLIC trainer identified by handle. Unknown or
 * private opponent → the same 404 the public profile uses (never reveals a
 * private profile exists). Rivaling yourself → 400. Returns the refreshed list.
 */
rivalryRoutes.post("/", async (c) => {
  const user = await requireUser(c);
  const body = await c.req.json().catch(() => null);
  const rawHandle = (body as { handle?: unknown } | null)?.handle;
  if (typeof rawHandle !== "string") return c.json({ errors: ["handle must be a string"] }, 400);

  const db = getDb(c.env.DB);
  const rows = await db.select().from(users).where(eq(users.handle, normalizeHandle(rawHandle))).limit(1);
  const opponent = rows[0];
  if (!opponent || opponent.isPublic !== 1) return c.json({ error: "not_found" }, 404);
  if (opponent.id === user.id) return c.json({ errors: ["you cannot rival yourself"] }, 400);

  await saveRivalry(db, user.id, opponent.id, Date.now());
  return c.json({ rivalries: await listRivalries(db, user.id) });
});

/** Deletes one of the caller's saved rivalries by id (idempotent). */
rivalryRoutes.delete("/:id", async (c) => {
  const user = await requireUser(c);
  const db = getDb(c.env.DB);
  await deleteRivalry(db, user.id, c.req.param("id"));
  return c.json({ ok: true });
});
```

Mount it in `src/worker/index.ts` (import alongside the other route imports; mount alongside the other `app.route` calls, right after the `/api/versus` mount):

```ts
import { rivalryRoutes } from "./routes/rivalries";
```

```ts
app.route("/api/rivalries", rivalryRoutes);
```

- [ ] **Step 13: Cascade rivalries on account deletion in `src/worker/routes/auth.ts`**

Add `rivalries` to the schema import at the top of `auth.ts` (it already imports `specimens`, `importJobs`, `boxes`, `users`, etc.), and `or` from `drizzle-orm` (the file already imports `eq`):

```ts
import { and, eq, or } from "drizzle-orm";
```

(If `auth.ts` currently imports only `eq`, widen that import to include `or`; leave any existing `and` import as-is.)

Add one delete to the existing `db.batch([...])` in the `DELETE /account` handler — remove rivalries where the departing user is the OWNER or the OPPONENT, so no `opponent_user_id` FK dangles (place it before the `db.delete(users)` line):

```ts
    db.delete(rivalries).where(or(eq(rivalries.userId, user.id), eq(rivalries.opponentUserId, user.id))),
```

- [ ] **Step 14: Write the failing account-deletion cascade test**

Append to `tests/worker/rivalries.test.ts`:

```ts
describe("/api/rivalries account-deletion cascade", () => {
  it("removes rivalries where the deleted user is owner or opponent", async () => {
    const a = await makeTrainer("riv-del-a@x.com", "riv-del-a", "DelA");
    const b = await makeTrainer("riv-del-b@x.com", "riv-del-b", "DelB");
    // a saves b, and b saves a — so a appears as owner (a's row) and opponent (b's row)
    await postJson("/api/rivalries", { handle: "riv-del-b" }, a);
    await postJson("/api/rivalries", { handle: "riv-del-a" }, b);

    // delete a's account
    const del = await call("/api/auth/account", { method: "DELETE" }, a);
    expect(del.status).toBe(200);

    // b's list no longer references the deleted user
    const list = await call("/api/rivalries", undefined, b);
    expect(((await list.json()) as any).rivalries).toHaveLength(0);
  });
});
```

- [ ] **Step 15: Run to verify it passes**

Run: `npx vitest run tests/worker/rivalries.test.ts tests/worker/rivalries-store.test.ts && npx tsc -b`
Expected: all green (including the cascade test — deleting account `a` removes both `a`'s owned rivalry and `b`'s rivalry that pointed at `a`).

- [ ] **Step 16: Add the client wrappers in `src/react-app/api.ts`**

Append to the Versus section of `src/react-app/api.ts`:

```ts
export type RivalryDto = {
	id: string;
	/** Stable opponent id — build the avatar URL / read-only references from this, never a handle. */
	opponentUserId: string;
	/** The opponent's CURRENT handle (may have changed since you saved them); null if they cleared it. */
	handle: string | null;
	displayName: string | null;
	hasAvatar: boolean;
	/** False if the opponent has since gone private — a rematch link would 404. */
	isPublic: boolean;
	createdAt: number;
};

/** Saves a rivalry against a public trainer by handle. Returns the refreshed list. */
export async function saveRivalry(handle: string): Promise<{ rivalries: RivalryDto[] }> {
	const res = await fetch("/api/rivalries", {
		method: "POST",
		credentials: "include",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ handle }),
	});
	return handleJson<{ rivalries: RivalryDto[] }>(res, "save rivalry");
}

/** Lists the signed-in user's saved rivalries (newest first). */
export async function listRivalries(): Promise<{ rivalries: RivalryDto[] }> {
	const res = await fetch("/api/rivalries", { credentials: "include" });
	return handleJson<{ rivalries: RivalryDto[] }>(res, "list rivalries");
}

/** Deletes one saved rivalry by id. */
export async function deleteRivalry(id: string): Promise<void> {
	const res = await fetch(`/api/rivalries/${encodeURIComponent(id)}`, {
		method: "DELETE",
		credentials: "include",
	});
	await handleJson<{ ok: boolean }>(res, "delete rivalry");
}
```

- [ ] **Step 17: Final verify + commit**

Run: `npx vitest run tests/db/schema.test.ts tests/worker/rivalries-store.test.ts tests/worker/rivalries.test.ts && npx tsc -b && npm run build`
Expected: all green.

```bash
git add src/db/schema/user.ts migrations/ tests/db/schema.test.ts src/worker/rivalries/rivalries-store.ts tests/worker/rivalries-store.test.ts src/worker/routes/rivalries.ts src/worker/routes/auth.ts src/worker/index.ts tests/worker/rivalries.test.ts src/react-app/api.ts
git commit -m "feat(flex-G): rivalries table (migration 0010) + auth-scoped save/list/delete + cascade + client wrappers"
```

---

### Task G4: `/versus/:a/:b` route registration (top-level, ungated) + pure `versusPath` helper + routes test

**Files:**
- Modify: `src/react-app/routes.ts` (add `versusPath`)
- Test: `tests/react-app/routes.test.ts` (append `versusPath` cases)
- Create: `src/react-app/pages/Versus.tsx` (placeholder stub — replaced in G5)
- Modify: `src/react-app/App.tsx` (register `/versus/:a/:b` as a top-level route outside `AppLayout`)
- Verify only (no component tests): `npx tsc -b` + `npm run build`, plus `npx vitest run tests/react-app/routes.test.ts`

**Interfaces:**
- Produces (pure, `src/react-app/routes.ts`): `versusPath(a: string, b: string): string` → `/versus/${a}/${b}`.
- Consumes: `useParams` (`react-router-dom`); existing `PublicProfile` route pattern from F4.

- [ ] **Step 1: Write the failing `versusPath` test**

Append to `tests/react-app/routes.test.ts` (reuses the file's existing import block — add `versusPath` to the `from "../../src/react-app/routes"` import):

```ts
describe("versusPath", () => {
	it("builds the /versus/:a/:b path from two handles", () => {
		expect(versusPath("ash-ketchum", "gary-oak")).toBe("/versus/ash-ketchum/gary-oak");
	});
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/react-app/routes.test.ts`
Expected: FAIL — `versusPath` is not exported.

- [ ] **Step 3: Add `versusPath` to `src/react-app/routes.ts`**

Add directly after the existing `publicProfilePath` function:

```ts
/** Head-to-head comparison path for two trainer handles. */
export function versusPath(a: string, b: string): string {
	return `/versus/${a}/${b}`;
}
```

- [ ] **Step 4: Run to verify it passes, then typecheck**

Run: `npx vitest run tests/react-app/routes.test.ts && npx tsc -b`
Expected: PASS; clean typecheck.

- [ ] **Step 5: Create the `src/react-app/pages/Versus.tsx` stub (replaced in G5)**

So `App.tsx` compiles now and G5 is a focused, isolated change:

```tsx
// src/react-app/pages/Versus.tsx
//
// Public head-to-head at /versus/:a/:b. Placeholder stub — the real page
// (fetch + round bars + breakdowns + verdict + share card) lands in Flex
// Phase G, Task G5. Ungated + unauthenticated by design (registered outside
// AppLayout, like /u/:handle).

import { useParams } from "react-router-dom";

export function Versus() {
	const { a, b } = useParams<{ a: string; b: string }>();
	return (
		<div className="app">
			<div className="container page">
				<p>
					Versus {a} vs {b} — coming in G5.
				</p>
			</div>
		</div>
	);
}
```

- [ ] **Step 6: Register the route in `src/react-app/App.tsx`**

Add the import alongside the existing page imports:

```ts
import { Versus } from "./pages/Versus";
```

Add the `/versus/:a/:b` route as a top-level, ungated route — a sibling of the existing `/u/:handle` route, BEFORE the `<Route element={<AppLayout />}>` block (so it renders outside the onboarding gate and account chrome, exactly like the public profile):

```tsx
	return (
		<Routes>
			<Route path="/u/:handle" element={<PublicProfile />} />
			<Route path="/versus/:a/:b" element={<Versus />} />
			<Route element={<AppLayout />}>
				<Route index element={<HomeRoute />} />
				<Route path="species" element={<SpeciesRoute />} />
				<Route path="events" element={<EventsRoute />} />
				<Route path="collection" element={<CollectionRoute />} />
				<Route path="ribbons" element={<Ribbons />} />
				<Route path="import-export" element={<ImportExport />} />
				<Route path="settings" element={<SettingsRoute />} />
				<Route path="*" element={<HomeRoute />} />
			</Route>
		</Routes>
	);
```

- [ ] **Step 7: Verify + commit**

Run: `npx vitest run tests/react-app/routes.test.ts && npx tsc -b && npm run build`
Expected: all green — `npm run build` confirms `App.tsx` + the `Versus` stub compile and bundle. No component test (no harness — see Global Constraints); routing correctness is confirmed by build success plus the pure `routes.test.ts`. SPA fallback (`wrangler.jsonc` `not_found_handling: "single-page-application"`) already serves `index.html` for deep links like `/versus/x/y`.

```bash
git add src/react-app/routes.ts tests/react-app/routes.test.ts src/react-app/pages/Versus.tsx src/react-app/App.tsx
git commit -m "feat(flex-G): /versus/:a/:b top-level ungated route + versusPath helper (stub page)"
```

---

### Task G5: `Versus` page — render `/versus/:a/:b` (round bars, type/gen breakdown, overall winner, verdict, share card) + CSS

**Files:**
- Create: `src/react-app/versus/versusDisplay.ts` (pure — display helpers: value formatting, breakdown row builder; unit-tested)
- Test: `tests/react-app/versusDisplay.test.ts`
- Modify: `src/react-app/pages/Versus.tsx` (replace the G4 stub with the real page)
- Modify: `src/react-app/styles.css` (append `.versus*` styles)
- Verify: `npx tsc -b` + `npm run build`, plus `npx vitest run tests/react-app/versusDisplay.test.ts`

**Interfaces:**
- Produces (pure, `src/react-app/versus/versusDisplay.ts`): `TYPE_ORDER: readonly string[]` (the 18 canonical types, display order); `GEN_ORDER: readonly number[]` (`[1..9]`); `formatRoundValue(format: "int" | "percent", value: number): string`; `barPercents(a: number, b: number): { a: number; b: number }` (each 0..100, the larger side = 100, the other proportional; both 0 → both 0); `BreakdownRow = { key: string; label: string; a: number; b: number }`; `buildBreakdown(order: readonly (string | number)[], a: Record<string, number>, b: Record<string, number>): BreakdownRow[]` (drops rows where both sides are 0).
- Consumes: `fetchVersus`, `VersusDto`, `VersusRoundDto`, `VersusSideDto` (`../api`, G2); `saveRivalry` (`../api`, G3 — the save button is added in G6, so G5 does not import it yet); `Avatar`, `RankBadge`, `ThemeToggle`, `TypeIcon`, `RibbonIcon`, `FavoritesStrip`; `typeColor` (`../theme`); `PATHS` (`../routes`); `useParams`, `Link` (`react-router-dom`).

- [ ] **Step 1: Write the failing display-helper tests**

Create `tests/react-app/versusDisplay.test.ts` (pure module — no `api.ts`/component import, per the BUILD-GATE split; mirrors `tests/react-app/incentiveDisplay.test.ts`):

```ts
import { describe, expect, it } from "vitest";
import {
	TYPE_ORDER,
	GEN_ORDER,
	formatRoundValue,
	barPercents,
	buildBreakdown,
} from "../../src/react-app/versus/versusDisplay";

describe("TYPE_ORDER / GEN_ORDER", () => {
	it("lists all 18 types and 9 generations", () => {
		expect(TYPE_ORDER).toHaveLength(18);
		expect(GEN_ORDER).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
	});
});

describe("formatRoundValue", () => {
	it("formats ints plainly and percents as a rounded %", () => {
		expect(formatRoundValue("int", 42)).toBe("42");
		expect(formatRoundValue("percent", 0.5)).toBe("50%");
		expect(formatRoundValue("percent", 0.333)).toBe("33%");
	});
});

describe("barPercents", () => {
	it("scales the larger side to 100 and the other proportionally", () => {
		expect(barPercents(50, 25)).toEqual({ a: 100, b: 50 });
		expect(barPercents(0, 10)).toEqual({ a: 0, b: 100 });
	});
	it("is 0/0 when both sides are 0", () => {
		expect(barPercents(0, 0)).toEqual({ a: 0, b: 0 });
	});
});

describe("buildBreakdown", () => {
	it("emits a row per key in order, dropping rows where both sides are 0", () => {
		const rows = buildBreakdown([1, 2, 3], { "1": 3, "3": 1 }, { "1": 1, "2": 0 });
		expect(rows.map((r) => r.key)).toEqual(["1", "3"]); // gen 2 dropped (both 0)
		expect(rows[0]).toEqual({ key: "1", label: "1", a: 3, b: 1 });
		expect(rows[1]).toEqual({ key: "3", label: "3", a: 1, b: 0 });
	});
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/react-app/versusDisplay.test.ts`
Expected: FAIL — module `src/react-app/versus/versusDisplay` not found.

- [ ] **Step 3: Implement `src/react-app/versus/versusDisplay.ts`**

```ts
// src/react-app/versus/versusDisplay.ts
//
// DOM-free display helpers for the Versus page (Flex Phase G). Kept free of
// React/DOM/api.ts imports so it's unit-testable the same way
// incentiveDisplay.ts / routes.ts are (see the BUILD-GATE split — tests import
// this, never a component).

/** The 18 canonical Pokémon types, in the palette's documented order. */
export const TYPE_ORDER: readonly string[] = [
	"normal", "fire", "water", "electric", "grass", "ice",
	"fighting", "poison", "ground", "flying", "psychic", "bug",
	"rock", "ghost", "dragon", "dark", "steel", "fairy",
];

/** Generations 1..9, for the per-generation breakdown. */
export const GEN_ORDER: readonly number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9];

/** Formats a round's raw value for display — a percent round is a 0..1 fraction shown as a whole %. */
export function formatRoundValue(format: "int" | "percent", value: number): string {
	if (format === "percent") return `${Math.round(value * 100)}%`;
	return String(value);
}

/** Bar widths (0..100) for a two-sided comparison: larger side fills the bar, the other is proportional. */
export function barPercents(a: number, b: number): { a: number; b: number } {
	const max = Math.max(a, b);
	if (max <= 0) return { a: 0, b: 0 };
	return { a: Math.round((a / max) * 100), b: Math.round((b / max) * 100) };
}

export type BreakdownRow = { key: string; label: string; a: number; b: number };

/**
 * Builds diverging-breakdown rows over a fixed key order (types or gens),
 * reading each side's sparse count map (missing = 0) and dropping any row
 * where both sides own nothing.
 */
export function buildBreakdown(
	order: readonly (string | number)[],
	a: Record<string, number>,
	b: Record<string, number>,
): BreakdownRow[] {
	const rows: BreakdownRow[] = [];
	for (const k of order) {
		const key = String(k);
		const av = a[key] ?? 0;
		const bv = b[key] ?? 0;
		if (av === 0 && bv === 0) continue;
		rows.push({ key, label: key, a: av, b: bv });
	}
	return rows;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/react-app/versusDisplay.test.ts`
Expected: PASS.

- [ ] **Step 5: Replace `src/react-app/pages/Versus.tsx` with the real page**

```tsx
// src/react-app/pages/Versus.tsx
//
// Public head-to-head at /versus/:a/:b (Flex Phase G). Ungated +
// unauthenticated: registered outside AppLayout, fetched via the public
// GET /api/versus/:a/:b endpoint, which never returns email or private data
// for either side. If either side is unknown or private, the whole comparison
// comes back null (indistinguishable) and renders the same "not found" state.
// Its own minimal header (wordmark link home + theme toggle) — no AccountMenu.

import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { fetchVersus, type VersusDto, type VersusRoundDto, type VersusSideDto } from "../api";
import { Avatar } from "../components/Avatar";
import { RankBadge } from "../components/RankBadge";
import { ThemeToggle } from "../components/ThemeToggle";
import { TypeIcon } from "../components/TypeIcon";
import { RibbonIcon } from "../ribbons/RibbonIcon";
import { PATHS } from "../routes";
import { typeColor } from "../theme";
import {
	TYPE_ORDER,
	GEN_ORDER,
	formatRoundValue,
	barPercents,
	buildBreakdown,
	type BreakdownRow,
} from "../versus/versusDisplay";

type LoadState =
	| { status: "loading" }
	| { status: "not_found" }
	| { status: "error" }
	| { status: "ok"; versus: VersusDto };

function PublicHeader() {
	return (
		<header className="toolbar public-profile__bar">
			<div className="toolbar__inner container">
				<Link className="wordmark" to={PATHS.home}>
					PokeDexFlex
				</Link>
				<div className="toolbar__controls">
					<ThemeToggle />
				</div>
			</div>
		</header>
	);
}

export function Versus() {
	const { a, b } = useParams<{ a: string; b: string }>();
	const [state, setState] = useState<LoadState>({ status: "loading" });

	useEffect(() => {
		let cancelled = false;
		setState({ status: "loading" });
		fetchVersus(a ?? "", b ?? "")
			.then((versus) => {
				if (cancelled) return;
				setState(versus ? { status: "ok", versus } : { status: "not_found" });
			})
			.catch(() => {
				if (!cancelled) setState({ status: "error" });
			});
		return () => {
			cancelled = true;
		};
	}, [a, b]);

	return (
		<div className="app">
			<PublicHeader />
			<div className="container page">
				{state.status === "loading" && <p className="state__title">Loading…</p>}

				{state.status === "not_found" && (
					<div className="state">
						<p className="state__title">Matchup unavailable</p>
						<p className="state__hint">
							One or both trainers don't exist or are private.{" "}
							<Link to={PATHS.home}>Back to PokeDexFlex</Link>
						</p>
					</div>
				)}

				{state.status === "error" && (
					<div className="state">
						<p className="state__title">Something went wrong</p>
						<p className="state__hint">
							Couldn't load this matchup. <Link to={PATHS.home}>Back to PokeDexFlex</Link>
						</p>
					</div>
				)}

				{state.status === "ok" && <VersusBody versus={state.versus} />}
			</div>
		</div>
	);
}

function nameOf(side: VersusSideDto): string {
	return side.displayName ?? `@${side.handle}`;
}

function VersusBody({ versus }: { versus: VersusDto }) {
	const { a, b, rounds, outcome, verdict } = versus;
	const winnerName = outcome.winner === "a" ? nameOf(a) : outcome.winner === "b" ? nameOf(b) : null;

	return (
		<>
			{/* Result share card — laid out to screenshot; copy-link lives in G6. */}
			<section className="versus-card" aria-label="Matchup result">
				<div className="versus-card__side">
					<Avatar userId={a.userId} displayName={a.displayName} hasAvatar={a.hasAvatar} size="lg" />
					<h2 className="versus-card__name">{nameOf(a)}</h2>
					<RankBadge trainerScore={a.trainerScore} rank={a.rank} size="sm" />
					<p className="versus-card__wins">{outcome.aWins} rounds</p>
				</div>

				<div className="versus-card__center">
					<span className="versus-card__vs">VS</span>
					<p className="versus-card__verdict">{verdict}</p>
					{winnerName ? (
						<p className="versus-card__winner">Winner: {winnerName}</p>
					) : (
						<p className="versus-card__winner">It's a draw</p>
					)}
				</div>

				<div className="versus-card__side">
					<Avatar userId={b.userId} displayName={b.displayName} hasAvatar={b.hasAvatar} size="lg" />
					<h2 className="versus-card__name">{nameOf(b)}</h2>
					<RankBadge trainerScore={b.trainerScore} rank={b.rank} size="sm" />
					<p className="versus-card__wins">{outcome.bWins} rounds</p>
				</div>
			</section>

			<section className="versus-rounds" aria-label="Rounds">
				<h2 className="ribbon-section__title">Rounds</h2>
				{rounds.map((r) => (
					<RoundRow key={r.key} round={r} />
				))}
			</section>

			<section className="versus-breakdown" aria-label="By type">
				<h2 className="ribbon-section__title">By type</h2>
				<BreakdownBars rows={buildBreakdown(TYPE_ORDER, a.byType, b.byType)} kind="type" />
			</section>

			<section className="versus-breakdown" aria-label="By generation">
				<h2 className="ribbon-section__title">By generation</h2>
				<BreakdownBars rows={buildBreakdown(GEN_ORDER, a.byGen, b.byGen)} kind="gen" />
			</section>

			{(a.showcase.length > 0 || b.showcase.length > 0) && (
				<section className="versus-showcase" aria-label="Trophy walls">
					<h2 className="ribbon-section__title">Trophy walls</h2>
					<div className="versus-showcase__cols">
						<ShowcaseColumn side={a} />
						<ShowcaseColumn side={b} />
					</div>
				</section>
			)}
		</>
	);
}

function RoundRow({ round }: { round: VersusRoundDto }) {
	const pct = barPercents(round.a, round.b);
	return (
		<div className="versus-round">
			<div className={`versus-round__side versus-round__side--a${round.winner === "a" ? " is-winner" : ""}`}>
				<span className="versus-round__value">{formatRoundValue(round.format, round.a)}</span>
				<span className="versus-round__bar">
					<span className="versus-round__fill versus-round__fill--a" style={{ width: `${pct.a}%` }} />
				</span>
			</div>
			<span className="versus-round__label">{round.label}</span>
			<div className={`versus-round__side versus-round__side--b${round.winner === "b" ? " is-winner" : ""}`}>
				<span className="versus-round__bar">
					<span className="versus-round__fill versus-round__fill--b" style={{ width: `${pct.b}%` }} />
				</span>
				<span className="versus-round__value">{formatRoundValue(round.format, round.b)}</span>
			</div>
		</div>
	);
}

function BreakdownBars({ rows, kind }: { rows: BreakdownRow[]; kind: "type" | "gen" }) {
	if (rows.length === 0) return <p className="state__hint">Neither trainer owns any yet.</p>;
	return (
		<div className="versus-breakdown__rows">
			{rows.map((row) => {
				const pct = barPercents(row.a, row.b);
				return (
					<div className="versus-breakdown__row" key={row.key}>
						<span className="versus-breakdown__count">{row.a}</span>
						<span className="versus-breakdown__bar versus-breakdown__bar--a">
							<span className="versus-breakdown__fill" style={{ width: `${pct.a}%` }} />
						</span>
						<span className="versus-breakdown__key">
							{kind === "type" ? (
								<TypeIcon type={row.key} color={typeColor(row.key)} size={18} />
							) : (
								<span className="versus-breakdown__gen">{row.label}</span>
							)}
						</span>
						<span className="versus-breakdown__bar versus-breakdown__bar--b">
							<span className="versus-breakdown__fill" style={{ width: `${pct.b}%` }} />
						</span>
						<span className="versus-breakdown__count">{row.b}</span>
					</div>
				);
			})}
		</div>
	);
}

function ShowcaseColumn({ side }: { side: VersusSideDto }) {
	return (
		<div className="versus-showcase__col">
			<p className="versus-showcase__name">{nameOf(side)}</p>
			<div className="trophy-wall__grid">
				{side.showcase.map((r) => (
					<div className="trophy-wall__slot" key={r.id}>
						<RibbonIcon ribbon={{ id: r.id, category: r.category }} size={56} />
						<span className="trophy-wall__name">{r.name}</span>
					</div>
				))}
			</div>
		</div>
	);
}
```

- [ ] **Step 6: Append CSS to `src/react-app/styles.css`**

```css
/* ---------- Versus (Flex Phase G) ---------- */

.versus-card {
	display: grid;
	grid-template-columns: 1fr auto 1fr;
	align-items: center;
	gap: 1rem;
	padding: 1.25rem;
	margin: 1rem 0 1.5rem;
	border: 1px solid var(--border);
	border-radius: 16px;
	background: var(--surface);
}

.versus-card__side {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 0.5rem;
	text-align: center;
}

.versus-card__name {
	font-family: var(--font-display);
	font-size: 1.1rem;
	margin: 0;
}

.versus-card__wins {
	color: var(--muted);
	font-size: 0.85rem;
	margin: 0;
}

.versus-card__center {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 0.5rem;
	max-width: 20rem;
	text-align: center;
}

.versus-card__vs {
	font-family: var(--font-display);
	font-weight: 700;
	font-size: 1.5rem;
	color: var(--muted);
}

.versus-card__verdict {
	font-style: italic;
	margin: 0;
}

.versus-card__winner {
	font-weight: 600;
	margin: 0;
}

.versus-round {
	display: grid;
	grid-template-columns: 1fr auto 1fr;
	align-items: center;
	gap: 0.75rem;
	padding: 0.35rem 0;
}

.versus-round__label {
	font-size: 0.8rem;
	text-transform: uppercase;
	letter-spacing: 0.04em;
	color: var(--muted);
	white-space: nowrap;
}

.versus-round__side {
	display: flex;
	align-items: center;
	gap: 0.5rem;
}

.versus-round__side--a {
	flex-direction: row-reverse;
}

.versus-round__value {
	font-variant-numeric: tabular-nums;
	min-width: 3ch;
	font-weight: 600;
}

.versus-round__side.is-winner .versus-round__value {
	color: var(--accent);
}

.versus-round__bar {
	position: relative;
	flex: 1;
	height: 8px;
	border-radius: 999px;
	background: var(--border);
	overflow: hidden;
}

.versus-round__fill {
	position: absolute;
	top: 0;
	bottom: 0;
	border-radius: 999px;
	background: var(--muted);
}

.versus-round__fill--a {
	right: 0;
}

.versus-round__fill--b {
	left: 0;
}

.versus-round__side--a.is-winner .versus-round__fill,
.versus-round__side--b.is-winner .versus-round__fill {
	background: var(--accent);
}

.versus-breakdown__rows {
	display: flex;
	flex-direction: column;
	gap: 0.25rem;
}

.versus-breakdown__row {
	display: grid;
	grid-template-columns: 2ch 1fr auto 1fr 2ch;
	align-items: center;
	gap: 0.4rem;
}

.versus-breakdown__count {
	font-variant-numeric: tabular-nums;
	font-size: 0.8rem;
	color: var(--muted);
	text-align: center;
}

.versus-breakdown__bar {
	position: relative;
	height: 6px;
	border-radius: 999px;
	background: var(--border);
	overflow: hidden;
}

.versus-breakdown__bar--a {
	transform: scaleX(-1);
}

.versus-breakdown__fill {
	position: absolute;
	left: 0;
	top: 0;
	bottom: 0;
	background: var(--accent);
	border-radius: 999px;
}

.versus-breakdown__key {
	display: flex;
	justify-content: center;
	align-items: center;
	min-width: 24px;
}

.versus-breakdown__gen {
	font-variant-numeric: tabular-nums;
	font-size: 0.8rem;
	color: var(--muted);
}

.versus-showcase__cols {
	display: grid;
	grid-template-columns: 1fr 1fr;
	gap: 1rem;
}

.versus-showcase__name {
	font-weight: 600;
	margin: 0 0 0.5rem;
}

@media (max-width: 640px) {
	.versus-card {
		grid-template-columns: 1fr;
	}
	.versus-showcase__cols {
		grid-template-columns: 1fr;
	}
}
```

- [ ] **Step 7: Verify + commit**

Run: `npx vitest run tests/react-app/versusDisplay.test.ts && npx tsc -b && npm run build`
Expected: clean typecheck, successful build, pure-helper tests green. No component test (no harness — see Global Constraints); the endpoint behavior is already covered by `tests/worker/versus.test.ts` (G2).

```bash
git add src/react-app/versus/versusDisplay.ts tests/react-app/versusDisplay.test.ts src/react-app/pages/Versus.tsx src/react-app/styles.css
git commit -m "feat(flex-G): Versus page — round bars, type/gen breakdown, verdict, share card + CSS"
```

---

### Task G6: Entry points — "Compare with me" on PublicProfile, "Save rivalry" on Versus, "Rivals" list + compare box on Home

**Files:**
- Modify: `src/react-app/pages/PublicProfile.tsx` (add a "Compare with me" link when the signed-in viewer has a handle and it isn't their own profile)
- Modify: `src/react-app/pages/Versus.tsx` (add a "Save rivalry" button when the signed-in viewer is one side of the matchup)
- Create: `src/react-app/versus/rivalTarget.ts` (pure — resolve who a viewer would save from a matchup; unit-tested)
- Test: `tests/react-app/rivalTarget.test.ts`
- Modify: `src/react-app/pages/Home.tsx` (add a "Rivals" section: saved-rivalry rematch links + a compare-by-handle box)
- Modify: `src/react-app/styles.css` (append `.rivals*` styles)
- Verify: `npx tsc -b` + `npm run build`, plus the FULL `npx vitest run`.

**Interfaces:**
- Produces (pure, `src/react-app/versus/rivalTarget.ts`): `rivalTargetHandle(args: { viewerHandle: string | null; aHandle: string; bHandle: string }): string | null` — returns the OTHER side's handle when the viewer is one side of the matchup (so they'd save the opponent), else `null` (a spectator can't save either side, and a viewer never rivals themselves).
- Consumes: `useAuth().user` (for `handle`); `versusPath`, `publicProfilePath` (`../routes`); `saveRivalry`, `listRivalries`, `deleteRivalry`, `RivalryDto` (`../api`, G3); `Avatar` (existing); `useNavigate`, `Link` (`react-router-dom`).

- [ ] **Step 1: Write the failing `rivalTargetHandle` test**

Create `tests/react-app/rivalTarget.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { rivalTargetHandle } from "../../src/react-app/versus/rivalTarget";

describe("rivalTargetHandle", () => {
	it("returns the opponent's handle when the viewer is side A", () => {
		expect(rivalTargetHandle({ viewerHandle: "red", aHandle: "red", bHandle: "blue" })).toBe("blue");
	});
	it("returns the opponent's handle when the viewer is side B", () => {
		expect(rivalTargetHandle({ viewerHandle: "blue", aHandle: "red", bHandle: "blue" })).toBe("red");
	});
	it("returns null for a spectator (viewer is neither side)", () => {
		expect(rivalTargetHandle({ viewerHandle: "green", aHandle: "red", bHandle: "blue" })).toBeNull();
	});
	it("returns null when the viewer has no handle (not signed in / no handle yet)", () => {
		expect(rivalTargetHandle({ viewerHandle: null, aHandle: "red", bHandle: "blue" })).toBeNull();
	});
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/react-app/rivalTarget.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/react-app/versus/rivalTarget.ts`**

```ts
// src/react-app/versus/rivalTarget.ts
//
// Pure helper (Flex Phase G): given the signed-in viewer's handle and the two
// sides of a matchup, returns the handle the viewer would SAVE as a rivalry
// (the OTHER side), or null if the viewer is a spectator / has no handle. Kept
// DOM-free so it's unit-testable (see the BUILD-GATE split).

export function rivalTargetHandle(args: {
	viewerHandle: string | null;
	aHandle: string;
	bHandle: string;
}): string | null {
	const { viewerHandle, aHandle, bHandle } = args;
	if (!viewerHandle) return null;
	if (viewerHandle === aHandle) return bHandle;
	if (viewerHandle === bHandle) return aHandle;
	return null;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/react-app/rivalTarget.test.ts`
Expected: PASS.

- [ ] **Step 5: Add a "Compare with me" link to `src/react-app/pages/PublicProfile.tsx`**

Extend the imports at the top of the file:

```ts
import { useAuth } from "../auth/AuthProvider";
import { PATHS, versusPath } from "../routes";
```

(The file already imports `PATHS` from `../routes` — replace that import with the combined `PATHS, versusPath` form rather than adding a duplicate line.)

Inside `PublicProfileBody`, read the viewer and compute whether a compare CTA applies, then render it under the hero (a signed-in viewer with a handle, viewing someone ELSE's profile, can compare themselves against this trainer):

```tsx
function PublicProfileBody({ profile }: { profile: PublicProfileDto }) {
	const { user } = useAuth();
	const canCompare = user?.handle != null && user.handle !== profile.handle;

	return (
		<>
			<section className="public-profile__hero">
				<Avatar userId={profile.userId} displayName={profile.displayName} hasAvatar={profile.hasAvatar} size="lg" />
				<div>
					<p className="hero__eyebrow">@{profile.handle}</p>
					<h1 className="hero__title hero__title--slim">{profile.displayName ?? "Trainer"}</h1>
					<RankBadge trainerScore={profile.trainerScore} rank={profile.rank} size="sm" />
					{canCompare && (
						<Link className="button button--primary public-profile__compare" to={versusPath(user!.handle!, profile.handle)}>
							Compare with me
						</Link>
					)}
				</div>
			</section>
			{/* ...the existing stats / FavoritesStrip / showcase sections are UNCHANGED... */}
```

(Leave the rest of `PublicProfileBody` — the `public-profile__stats` section, `FavoritesStrip`, and the showcase section — exactly as it is today; only the hero block gains the `useAuth`/`canCompare` logic and the compare `Link`.)

- [ ] **Step 6: Add a "Save rivalry" button to `src/react-app/pages/Versus.tsx`**

Extend the imports:

```ts
import { useAuth } from "../auth/AuthProvider";
import { fetchVersus, saveRivalry, type VersusDto, type VersusRoundDto, type VersusSideDto } from "../api";
import { rivalTargetHandle } from "../versus/rivalTarget";
```

(Replace the existing `import { fetchVersus, ... } from "../api";` line with the combined form that adds `saveRivalry`.)

Add a save-rivalry control to `VersusBody` (a signed-in viewer who is one side of the matchup can save the OTHER trainer). Put it in the share card's center column, under the winner line:

```tsx
function VersusBody({ versus }: { versus: VersusDto }) {
	const { a, b, rounds, outcome, verdict } = versus;
	const winnerName = outcome.winner === "a" ? nameOf(a) : outcome.winner === "b" ? nameOf(b) : null;
	const { user } = useAuth();
	const targetHandle = rivalTargetHandle({ viewerHandle: user?.handle ?? null, aHandle: a.handle, bHandle: b.handle });
	const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");

	async function handleSaveRivalry() {
		if (!targetHandle) return;
		setSaveState("saving");
		try {
			await saveRivalry(targetHandle);
			setSaveState("saved");
		} catch {
			setSaveState("error");
		}
	}
```

Then, inside the `versus-card__center` block, after the winner `<p>`, add:

```tsx
					{targetHandle && (
						<button
							type="button"
							className="button versus-card__save"
							onClick={handleSaveRivalry}
							disabled={saveState === "saving" || saveState === "saved"}
						>
							{saveState === "saved" ? "Rivalry saved" : saveState === "saving" ? "Saving…" : "Save rivalry"}
						</button>
					)}
					{saveState === "error" && <p className="state__hint">Couldn't save — try again.</p>}
```

- [ ] **Step 7: Add a "Rivals" section to `src/react-app/pages/Home.tsx`**

Extend the imports:

```ts
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { listRivalries, deleteRivalry, type RivalryDto } from "../api";
import { publicProfilePath, versusPath } from "../routes";
```

(The file already imports `useState` from `"react"` — widen that to include `useEffect`. Add the `react-router-dom` import; `Home` currently receives navigation via props but the Rivals box navigates directly.)

Add a `Rivals` component near the bottom of the file (before `export function Home`), and render `<Rivals />` inside the signed-in branch of `Home` (after the existing `TrophyWall`/`NudgeList`/`FavoritesStrip` content — place `{user && <Rivals />}` at the end of the signed-in dashboard content, inside the `.container.page` wrapper):

```tsx
function Rivals() {
	const navigate = useNavigate();
	const [rivals, setRivals] = useState<RivalryDto[]>([]);
	const [handle, setHandle] = useState("");

	useEffect(() => {
		let cancelled = false;
		listRivalries()
			.then((r) => {
				if (!cancelled) setRivals(r.rivalries);
			})
			.catch(() => {
				/* non-fatal — the Rivals box is optional dashboard chrome */
			});
		return () => {
			cancelled = true;
		};
	}, []);

	const { user } = useAuth();

	function startCompare() {
		const target = handle.trim().toLowerCase();
		if (user?.handle && target) navigate(versusPath(user.handle, target));
	}

	async function remove(id: string) {
		await deleteRivalry(id);
		setRivals((prev) => prev.filter((r) => r.id !== id));
	}

	return (
		<section className="rivals" aria-label="Rivals">
			<h2 className="ribbon-section__title">Rivals</h2>

			{user?.handle ? (
				<div className="rivals__compare">
					<input
						className="input"
						value={handle}
						placeholder="a trainer's handle"
						onChange={(e) => setHandle(e.target.value)}
					/>
					<button type="button" className="button button--primary" onClick={startCompare} disabled={!handle.trim()}>
						Compare
					</button>
				</div>
			) : (
				<p className="state__hint">Set a public handle in Settings to compare with other trainers.</p>
			)}

			{rivals.length > 0 && (
				<ul className="rivals__list">
					{rivals.map((r) => (
						<li className="rivals__item" key={r.id}>
							<Avatar userId={r.opponentUserId} displayName={r.displayName} hasAvatar={r.hasAvatar} size="sm" />
							<span className="rivals__name">
								{r.handle ? (
									<Link to={publicProfilePath(r.handle)}>{r.displayName ?? `@${r.handle}`}</Link>
								) : (
									(r.displayName ?? "Trainer")
								)}
							</span>
							{user?.handle && r.handle && r.isPublic ? (
								<Link className="button rivals__rematch" to={versusPath(user.handle, r.handle)}>
									Rematch
								</Link>
							) : (
								<span className="state__hint">unavailable</span>
							)}
							<button type="button" className="button" onClick={() => void remove(r.id)}>
								Remove
							</button>
						</li>
					))}
				</ul>
			)}
		</section>
	);
}
```

(Note: `Home` already imports `Avatar` and `useAuth` — reuse those. The `{user && <Rivals />}` render sits inside the existing signed-in `.container.page`.)

- [ ] **Step 8: Append CSS for the Rivals section + compare CTA to `src/react-app/styles.css`**

```css
/* ---------- Rivals (Flex Phase G) ---------- */

.public-profile__compare {
	display: inline-block;
	margin-top: 0.5rem;
}

.versus-card__save {
	margin-top: 0.25rem;
}

.rivals {
	margin-top: 1.5rem;
}

.rivals__compare {
	display: flex;
	gap: 0.5rem;
	margin-bottom: 1rem;
	max-width: 26rem;
}

.rivals__list {
	list-style: none;
	margin: 0;
	padding: 0;
	display: flex;
	flex-direction: column;
	gap: 0.5rem;
}

.rivals__item {
	display: flex;
	align-items: center;
	gap: 0.75rem;
}

.rivals__name {
	flex: 1;
}

.rivals__rematch {
	white-space: nowrap;
}
```

- [ ] **Step 9: Final verify + commit**

Run: `npx tsc -b && npm run build && npx vitest run`
Expected: clean typecheck, successful build, and the FULL suite green (every prior test plus the new G1–G6 tests). Confirm the new pure tests (`versus-rounds`, `versus-verdict`, `versus-stats`, `versus`, `rivalries-store`, `rivalries`, `routes` `versusPath`, `versusDisplay`, `rivalTarget`) all ran.

Manually confirm (by reading the JSX) that no new code path renders `user.email` on the Versus page, the PublicProfile compare CTA, or the Home Rivals section — email stays only in Settings' Account section.

```bash
git add src/react-app/pages/PublicProfile.tsx src/react-app/pages/Versus.tsx src/react-app/versus/rivalTarget.ts tests/react-app/rivalTarget.test.ts src/react-app/pages/Home.tsx src/react-app/styles.css
git commit -m "feat(flex-G): entry points — compare CTA, save-rivalry button, Home rivals list + compare box"
```

---

## Self-Review

**Spec coverage** (against `docs/superpowers/specs/2026-07-14-ribbons-and-rivalry-design.md` §5–6, the HANDOFF Phase G description, and the four LOCKED DECISIONS):

| Spec / locked-decision item | Task | Status |
| --- | --- | --- |
| `/versus/:a/:b` compares two trainers by handle | G2 (endpoint), G4 (route), G5 (page) | ✓ |
| Versus is PUBLIC; endpoint unauthenticated; page top-level ungated w/ minimal header | G2 (public `GET`), G4 (route outside `AppLayout`), G5 (own wordmark+ThemeToggle header, no AccountMenu) | ✓ |
| Either handle unknown OR private → identical `404 {error:"not_found"}`, never revealing which | G2 (single guard returns 404 if either side missing/`isPublic!==1`; test covers unknown + private) | ✓ |
| **Never email** for either side (endpoint + page) | G2 (`sideResponse` excludes email; `buildVersusStats` never reads it; test asserts serialized response has neither email) , G5 (no email rendered), G6 (email stays only in Settings) | ✓ — hard constraint, enforced + tested |
| 6 scored rounds (Strength, Diversity, Completion, Shiny, Ribbon score, Rarity Crown) each with per-side value + winner | G1 (`rounds.ts` — pure), G2 (`stats.ts` computes the metrics) | ✓ |
| Per-type (18) + per-generation (9) breakdown | G2 (`byType`/`byGen`), G5 (`buildBreakdown` + `BreakdownBars`) | ✓ |
| Overall winner | G1 (`overallOutcome`), G5 (share-card winner line) | ✓ |
| Share card (layout + copy-link; image export deferred) | G5 (`.versus-card` share layout). Copy-link is not added (see risk 5) — flagged | ◐ — layout done; copy-link deferred, flagged below |
| Spice-by-margin trash-talk verdict pool (tiers by margin, deterministic pick, pure, unit-tested, playful/no profanity) | G1 (`verdict.ts` — 5 tiers, `pickVerdict` deterministic index, profanity test) | ✓ — regenerated fresh (old pool unrecoverable) |
| Saved rivalries: save / list / delete, auth-scoped | G3 (`POST`/`GET`/`DELETE /api/rivalries`, all `requireUser`) | ✓ |
| Opponent stored by STABLE key (`opponentUserId`) not mutable handle; uniqueness on (userId, opponentUserId) | G3 (schema + store + justification) | ✓ |
| `rivalries` table via drizzle-kit generate (confirm next index) | G3 (0010 expected; instructs confirming against `_journal.json`) | ✓ |
| Reuse per-user computation for BOTH sides (no duplicated scoring) | G2 (`stats.ts` on `collection-summary.ts` + `scoring.ts`; route builds `ref` once, both sides through the same path) | ✓ |
| Pure round-scoring + verdict in DOM-free unit-tested module (mirrors scoring.ts) | G1 (`versus/rounds.ts`, `versus/verdict.ts` + tests) | ✓ |
| `versusPath` helper (pure, unit-tested) + `/versus` route registration | G4 | ✓ |
| Entry points: compare from a public profile / picker, save-rivalry button, saved-rivalries surface | G6 (PublicProfile "Compare with me", Versus "Save rivalry", Home "Rivals" list + compare-by-handle box) | ✓ |
| Stats dashboard / leaderboard / following / multi-way / image export | *(out of scope)* | — deliberately excluded per Global Constraints |

**Tables/columns added:** one new table `rivalries` `{ id text pk, userId text→users.id, opponentUserId text→users.id, createdAt integer }` with `unique(userId, opponentUserId)` — Task G3, one migration (expected `0010`, confirm at execution). No other schema changes.

**Endpoints added:** `GET /api/versus/:a/:b` (G2, public); `POST /api/rivalries`, `GET /api/rivalries`, `DELETE /api/rivalries/:id` (G3, auth-scoped). `DELETE /api/auth/account` behavior extended (G3: rivalries cascade). No existing endpoint's response shape changed.

**Round formulas** (each a pure "higher wins; equal → tie" comparison, values produced by `stats.ts`):
- **Strength** = `3·sixIvCount + 2·level100Count + megaFormCount + gmaxFormCount` — competitive/power investment.
- **Diversity** = `distinctTypesOwned + distinctGensOwned` — collection breadth.
- **Completion** = `ownedSpecies / totalReferenceSpecies` (0..1, shown as %) — National Dex progress.
- **Shiny** = `shinySpeciesIds.size` — distinct species owned as shiny.
- **Ribbon Score** = `trainerScoreFor(earnedRibbons)` — the Phase-D Trainer Score.
- **Rarity Crown** = `Σ pointsForRibbon(r)` over earned ribbons whose category ∈ {`Rarity Class`, `Grand`, `Collector`} — who holds the rare flexes.

**Reuse / DRY:** `stats.ts` is built entirely on F3's `buildCollectionSummary`/`buildReferenceData`/`computeRibbons` and Phase D's `trainerScoreFor`/`rankFor`/`pointsForRibbon` — no scoring is re-implemented; it computes the same per-user numbers `public-profile.ts` does and extends them with the round metrics + breakdowns. The route loads `ReferenceData` once for both sides. The pure round/verdict logic mirrors `ribbons/scoring.ts`. The page reuses `Avatar`/`RankBadge`/`TypeIcon`/`RibbonIcon` and the same `.trophy-wall__grid`/`RibbonIcon` markup the public profile/`TrophyWall` use, plus the same minimal public header pattern as `PublicProfile`.

**Placeholder scan:** none — every code step carries complete, runnable code and exact verification commands. The one deliberately-approximate value is the migration index (`0010`), explicitly flagged as "confirm against `migrations/meta/_journal.json` at execution time" (matching how Phases D/F handled it). `Versus.tsx` is intentionally a labeled stub in G4 and fully replaced with complete code in G5 (so the route wiring and the page render are separately reviewable) — not left as a placeholder.

**Type consistency:**
- `RoundValues` (`rounds.ts`) is produced by `stats.ts` (`VersusStats.rounds`) and consumed by `computeRounds`; the six keys (`strength/diversity/completion/shiny/ribbons/rarity`) are identical across `rounds.ts`, `stats.ts`, and the client `VersusRoundDto`.
- `RoundResult` (server) is mirrored field-for-field by `VersusRoundDto` (client): `{ key, label, format, a, b, winner }`. `overallOutcome`'s return matches `VersusOutcomeDto` (`{ winner, aWins, bWins, ties }`).
- `sideResponse` (route) emits exactly the fields of `VersusSideDto` (`userId, handle, displayName, gender, hasAvatar, trainerScore, rank, favorites, showcase, byType, byGen, stats`); `favorites` uses the existing `FavoriteDto`, `showcase` the existing `PublicShowcaseRibbon`, `stats` the existing `PublicProfileStats` (reused from F3, not re-declared).
- `RivalryRow` (store) → `RivalryDto` (client) match field-for-field (`id, opponentUserId, handle, displayName, hasAvatar, isPublic, createdAt`). `isPublic` is stored numeric and converted to a JS boolean exactly once, in `listRivalries` (`r.isPublic === 1`), consistent with `getCurrentUser`/`serializeUser`.
- `pickVerdict`'s `winner: "a" | "b" | "tie"` is exactly `overallOutcome().winner`; the route passes `aName`/`bName` as `displayName ?? handle`.
- `versusPath(a, b)` returns `/versus/${a}/${b}`, matching the `/versus/:a/:b` route pattern and the `GET /api/versus/:a/:b` endpoint.

**Determinism / idempotency:**
- `computeRounds`/`overallOutcome`/`verdictTier`/`pickVerdict` are pure and deterministic; `pickVerdict` picks a line by `seed % pool.length` with `seed = seedFrom(handleA, handleB)`, so a given matchup URL always renders the same verdict line.
- `GET /api/versus/:a/:b` is a pure read (no writes), safe to call unauthenticated and repeatedly.
- `saveRivalry` uses `onConflictDoNothing` on `(userId, opponentUserId)`, so re-saving is a no-op; `deleteRivalry` is scoped to the caller and idempotent (deleting an id you don't own returns `false`/`ok`).
- Handle lookups reuse `normalizeHandle`, so both the versus endpoint and rivalry save are case-insensitive by construction (handles are always stored lowercased).

**Risks / open questions (resolved via judgment call — flagged for the controller to sanity-check):**
1. **Rarity Crown = rare-flex ribbon points, not per-specimen rarity.** The spec's original phrasing was "whose single rarest owned mon wins," but the HANDOFF/instruction offer "who holds rarer/more rare-flex ribbons." I chose the ribbon-based definition (Σ points of earned `Rarity Class`/`Grand`/`Collector` ribbons) because it is derivable purely from `computeRibbons` output with zero extra queries and no dependence on the whole-userbase rarity engine, and it reuses `pointsForRibbon`. Flagging in case a per-specimen "rarest single mon" metric (via `src/worker/rarity/`) is preferred — that would need the rarity engine wired into `stats.ts`.
2. **Strength formula weighting.** `3·sixIv + 2·level100 + mega + gmax` is a reasonable "competitive investment" proxy from fields already in `CollectionSummary`, kept distinct from the Shiny and Ribbon rounds to avoid double-counting. The exact weights are a tunable judgment call.
3. **Comparing yourself / a===b.** `GET /api/versus/:a/:b` doesn't special-case identical handles — it renders every round as a tie with a draw verdict. Harmless; not worth a guard. (Rivalries DO reject self via a 400.)
4. **Rivalry opponent going private after save.** A saved rivalry stores `opponentUserId`; if that opponent later goes private (or clears their handle), `listRivalries` still returns the row (joined to `users`) but the client marks it "unavailable" and hides the rematch link (`isPublic`/`handle` checks in G6). The stale row isn't auto-pruned — the user can Remove it. Acceptable.
5. **Share card copy-link deferred.** The spec asks for "layout + copy-link now." G5 delivers the screenshot-ready `.versus-card` layout; I did not add a copy-current-URL button (the URL is already the shareable artifact and the browser address bar carries it). Flagging: a one-line "Copy link" button mirroring Settings' `copyShareLink` could be added to G5/G6 if wanted.
6. **`stats.ts` cost per versus.** Each side runs the full `buildCollectionSummary` + `computeRibbons` (same cost as `GET /api/ribbons` / `GET /api/u/:handle`), so a versus is ~2× that, uncached. Consistent with the existing routes and acceptable at current scale; a cache/denormalized-stats optimization is deferred.
7. **Home `Rivals` fetch on mount.** `<Rivals />` calls `listRivalries()` on mount for a signed-in user; failures are swallowed (optional dashboard chrome). It adds one authenticated request to the Home dashboard — negligible, and it renders nothing intrusive when the list is empty.

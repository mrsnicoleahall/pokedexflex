# Flex Phase C — Ribbon Catalog Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Grow the ribbon catalog from ~30 to ~115 by adding five families — Regional/National-Dex-completion, Rarity-class species sets, Specimen-detail collector, Type & Shiny deepening, and more easter eggs — all driven by the existing pure engine (`src/worker/ribbons/catalog.ts`) plus a new curated-set module and a wider `CollectionSummary`.

**Architecture:** The pure engine `computeRibbons(summary, ref)` stays the single source of truth. New species-id sets live in a new pure module `src/worker/ribbons/species-sets.ts` (verified against Bulbapedia). New per-user facts (natures, balls, level-100 count, 6IV count, mega/gmax form counts, shiny species) are aggregated **only** in the route `src/worker/routes/ribbons.ts` and passed in via extra `CollectionSummary` fields. The client resolver `src/react-app/ribbons/ribbonIconResolver.ts` gains rules for the new categories, and `CATEGORY_ORDER` in `src/react-app/pages/Ribbons.tsx` is extended so every new category renders.

**Tech Stack:** Cloudflare Workers + Hono + Drizzle (D1); Vitest (Workers pool) for both pure-engine and route tests; Vite + React + TypeScript on the client. Depends on Phase B (icon system) being in place.

## Global Constraints

- **Pure engine stays pure.** `src/worker/ribbons/catalog.ts` and the new `src/worker/ribbons/species-sets.ts` do **no** I/O — no DB, no `fetch`, no `env`. All aggregation (DB queries, JSON parsing of the `ivs` column) lives only in `src/worker/routes/ribbons.ts`.
- **Don't break existing ribbons/tests.** Existing ids (`living-dex`, `complete-dex-forms`, `gen-{N}`, `type-{slug}`, `form-fanatic-*`, `formset-*`, `shiny-{10,50,100}`, `event-{10,50,100}`, `fun-*`) keep working. The `gen-{N}` ribbons are **repurposed** (renamed to region flavor + recategorized `Generation` → `Regional`) but keep their **ids and earn logic** so `tests/worker/ribbons.test.ts` and `tests/worker/ribbons-route.test.ts` continue to pass.
- **`CollectionSummary` grows with required fields.** Every place that constructs a `CollectionSummary` (the route's `emptySummary`, the pure-test fixture `emptySummary` in `tests/worker/ribbons.test.ts`) must be updated in the same task that widens the type, or `tsc` fails.
- **National dex ids are 1..1025.** Every curated id set is verified against an authoritative source (Bulbapedia; URL cited in a code comment) and guarded by an exact count-assertion test so a wrong entry is caught.
- **6IV detection parses the `ivs` JSON text column** in the route, not in SQL. A specimen is 6IV iff its parsed `ivs` object has all six stats (`hp, atk, def, spa, spd, spe`) `=== 31`. Null / missing / malformed `ivs` is **not** 6IV (never throws).
- **New categories must render.** New categories (`Completion`, `Regional`, `Rarity Class`, `Collector`) are added to `CATEGORY_ORDER` (`src/react-app/pages/Ribbons.tsx`) in a sensible order, and the client resolver (`src/react-app/ribbons/ribbonIconResolver.ts`) gets rules for them, including assigning the two still-free kawaii pieces `coin` and `heart`.
- **No dev server.** Verify only via `npx vitest run <path>`, `npx tsc -b`, and `npm run build`. Visual verification is the controller's job.
- **Determinism.** Catalog order stays stable and deterministic. New families are appended in a fixed order (see Task ordering) so snapshot-style index assertions never flake.

---

### Task C1: Widen `CollectionSummary` + aggregate the new per-user facts

**Files:**
- Modify: `src/worker/ribbons/catalog.ts` (widen `CollectionSummary`; add pure `isSixIv` helper)
- Modify: `src/worker/routes/ribbons.ts` (aggregate new fields)
- Modify: `tests/worker/ribbons.test.ts` (widen the `emptySummary` fixture)
- Test: `tests/worker/ribbons-route.test.ts` (add a collector-aggregation case)
- Test (pure): `tests/worker/six-iv.test.ts`

**Interfaces:**
- Produces (from `catalog.ts`): widened `CollectionSummary` with `naturesOwned: Set<string>`, `ballsOwned: Set<string>`, `level100Count: number`, `sixIvCount: number`, `megaFormCount: number`, `gmaxFormCount: number`, `shinySpeciesIds: Set<number>`; and `isSixIv(ivsJson: string | null): boolean`.
- Consumes (in `ribbons.ts`): the widened type; Drizzle tables `specimens`, `forms`.

- [ ] **Step 1: Write the failing pure test for `isSixIv`**

Create `tests/worker/six-iv.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isSixIv } from "../../src/worker/ribbons/catalog";

describe("isSixIv", () => {
  it("is true only when all six IVs are exactly 31", () => {
    expect(isSixIv(JSON.stringify({ hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 }))).toBe(true);
  });
  it("is false when any IV is below 31", () => {
    expect(isSixIv(JSON.stringify({ hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 30 }))).toBe(false);
  });
  it("is false for null, empty, malformed, or partial ivs (never throws)", () => {
    expect(isSixIv(null)).toBe(false);
    expect(isSixIv("")).toBe(false);
    expect(isSixIv("not json")).toBe(false);
    expect(isSixIv(JSON.stringify({ hp: 31 }))).toBe(false);
    expect(isSixIv(JSON.stringify({ hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: "31" }))).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/worker/six-iv.test.ts`
Expected: FAIL — `isSixIv` is not exported.

- [ ] **Step 3: Widen `CollectionSummary` and add `isSixIv` in `catalog.ts`**

In `src/worker/ribbons/catalog.ts`, replace the `CollectionSummary` type with:

```ts
export type CollectionSummary = {
  speciesIds: Set<number>;
  formIds: Set<number>;
  shinyCount: number;
  eventCount: number;
  /** Total specimens the user owns (all boxes, all species). */
  specimenCount: number;
  /** Total boxes the user has created. */
  boxCount: number;
  /** Distinct nature names owned, lowercased (e.g. "adamant"). */
  naturesOwned: Set<string>;
  /** Distinct Poké Ball names owned, lowercased (e.g. "ultra ball"). */
  ballsOwned: Set<string>;
  /** Specimens at level 100. */
  level100Count: number;
  /** Specimens with a flawless (all-31) IV spread. */
  sixIvCount: number;
  /** Distinct owned form ids whose formType is "mega". */
  megaFormCount: number;
  /** Distinct owned form ids whose formType is "gigantamax". */
  gmaxFormCount: number;
  /** Species ids for which the user owns at least one shiny. */
  shinySpeciesIds: Set<number>;
};
```

Add this pure helper near the other helpers (e.g. just below `prettyName`):

```ts
const SIX_IV_STATS = ["hp", "atk", "def", "spa", "spd", "spe"] as const;

/**
 * Pure test for a flawless (6×31) IV spread from the raw JSON `ivs` column.
 * Returns false for null / empty / malformed / partial input — never throws.
 */
export function isSixIv(ivsJson: string | null): boolean {
  if (!ivsJson) return false;
  let parsed: unknown;
  try {
    parsed = JSON.parse(ivsJson);
  } catch {
    return false;
  }
  if (typeof parsed !== "object" || parsed === null) return false;
  const obj = parsed as Record<string, unknown>;
  return SIX_IV_STATS.every((k) => obj[k] === 31);
}
```

- [ ] **Step 4: Run the pure test to verify it passes**

Run: `npx vitest run tests/worker/six-iv.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Update the two `emptySummary` constructors**

In `src/worker/routes/ribbons.ts`, replace `emptySummary` with:

```ts
const emptySummary: CollectionSummary = {
  speciesIds: new Set(),
  formIds: new Set(),
  shinyCount: 0,
  eventCount: 0,
  specimenCount: 0,
  boxCount: 0,
  naturesOwned: new Set(),
  ballsOwned: new Set(),
  level100Count: 0,
  sixIvCount: 0,
  megaFormCount: 0,
  gmaxFormCount: 0,
  shinySpeciesIds: new Set(),
};
```

In `tests/worker/ribbons.test.ts`, update its `emptySummary` fixture to include the same seven new fields (all empty sets / `0`). This keeps every existing pure test compiling and passing unchanged.

- [ ] **Step 6: Aggregate the new fields in `ribbons.ts`**

In `src/worker/routes/ribbons.ts`, update the imports and the signed-in aggregation. Add `sql` / `inArray` as needed and `isSixIv` to the catalog import:

```ts
import { and, count, countDistinct, eq, isNotNull, inArray } from "drizzle-orm";
import { computeRibbons, isSixIv, type CollectionSummary, type ReferenceData } from "../ribbons/catalog";
```

Inside `if (user) { ... }`, add these queries to the `Promise.all` (alongside the existing six) and derive the JS-computed facts afterward:

```ts
      db.selectDistinct({ nature: specimens.nature }).from(specimens)
        .where(and(eq(specimens.userId, user.id), isNotNull(specimens.nature))),
      db.selectDistinct({ ball: specimens.ball }).from(specimens)
        .where(and(eq(specimens.userId, user.id), isNotNull(specimens.ball))),
      db.select({ value: count(specimens.id) }).from(specimens)
        .where(and(eq(specimens.userId, user.id), eq(specimens.level, 100))),
      db.selectDistinct({ speciesId: specimens.speciesId }).from(specimens)
        .where(and(eq(specimens.userId, user.id), eq(specimens.isShiny, 1))),
      // Owned form ids joined to their formType, for mega / gmax breadth.
      db.selectDistinct({ formId: specimens.formId, formType: forms.formType })
        .from(specimens)
        .innerJoin(forms, eq(specimens.formId, forms.id))
        .where(eq(specimens.userId, user.id)),
      // Raw ivs strings for 6IV detection (parsed in JS — cannot query JSON in D1).
      db.select({ ivs: specimens.ivs }).from(specimens)
        .where(and(eq(specimens.userId, user.id), isNotNull(specimens.ivs))),
```

Destructure the new results and build the widened summary:

```ts
    const [
      speciesRows, formRows,
      [{ value: shinyCount }], [{ value: eventCount }],
      [{ value: specimenCount }], [{ value: boxCount }],
      natureRows, ballRows,
      [{ value: level100Count }],
      shinySpeciesRows, ownedFormTypeRows, ivsRows,
    ] = await Promise.all([ /* ...existing six..., then the six added above... */ ]);

    let megaFormCount = 0;
    let gmaxFormCount = 0;
    for (const r of ownedFormTypeRows) {
      if (r.formType === "mega") megaFormCount++;
      else if (r.formType === "gigantamax") gmaxFormCount++;
    }
    const sixIvCount = ivsRows.reduce((n, r) => (isSixIv(r.ivs) ? n + 1 : n), 0);

    summary = {
      speciesIds: new Set(speciesRows.map((r) => r.speciesId)),
      formIds: new Set(formRows.map((r) => r.formId).filter((id): id is number => id !== null)),
      shinyCount, eventCount, specimenCount, boxCount,
      naturesOwned: new Set(natureRows.map((r) => (r.nature ?? "").toLowerCase()).filter(Boolean)),
      ballsOwned: new Set(ballRows.map((r) => (r.ball ?? "").toLowerCase()).filter(Boolean)),
      level100Count,
      sixIvCount,
      megaFormCount,
      gmaxFormCount,
      shinySpeciesIds: new Set(shinySpeciesRows.map((r) => r.speciesId)),
    };
```

(Keep the existing `ref` build and `computeRibbons` call unchanged.)

- [ ] **Step 7: Add a route-level aggregation test**

Append to `tests/worker/ribbons-route.test.ts` a test that creates a specimen with a nature, ball, level 100, and a 6IV spread, then asserts the corresponding collector ribbons (added in C5) advance. Because C5 isn't built yet, this step's test only asserts the request still returns 200 and `total` grew; expand it in C5. Minimal addition:

```ts
  it("still returns the catalog after the summary was widened (no crash on new aggregates)", async () => {
    const cookie = await signIn("widened@x.com");
    await postJson("/api/collection", { speciesId: 1001, level: 100, nature: "Adamant", ball: "Ultra Ball",
      ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 } }, cookie);
    const res = await call("/api/ribbons", undefined, cookie);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.total).toBeGreaterThan(0);
  });
```

- [ ] **Step 8: Verify + commit**

Run: `npx vitest run tests/worker/ribbons.test.ts tests/worker/ribbons-route.test.ts tests/worker/six-iv.test.ts && npx tsc -b`
Expected: all green; typecheck clean.

```bash
git add src/worker/ribbons/catalog.ts src/worker/routes/ribbons.ts tests/worker/ribbons.test.ts tests/worker/ribbons-route.test.ts tests/worker/six-iv.test.ts
git commit -m "feat(flex-C): widen CollectionSummary + aggregate natures/balls/level100/6IV/mega/gmax/shiny-species"
```

---

### Task C2: Curated species-id sets (`species-sets.ts`) + verified count assertions

**Files:**
- Create: `src/worker/ribbons/species-sets.ts`
- Test: `tests/worker/species-sets.test.ts`

**Interfaces:**
- Produces: `LEGENDARY_PROPER_IDS`, `MYTHICAL_IDS`, `FOSSIL_IDS`, `BABY_IDS`, `ULTRA_BEAST_IDS`, `PARADOX_IDS` (all `readonly number[]`), plus `NATURE_NAMES` (25 lowercase strings) and `BALL_TYPES` (27 lowercase strings). Pure data module, no I/O.
- Consumes: nothing (leaf module). `priors.ts` is **untouched**; Starters/Pseudo reuse `STARTER_FINAL_IDS` / `PSEUDO_IDS` from `priors.ts` directly in C4.

- [ ] **Step 1: Write the failing count-assertion test**

Create `tests/worker/species-sets.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  LEGENDARY_PROPER_IDS, MYTHICAL_IDS, FOSSIL_IDS, BABY_IDS,
  ULTRA_BEAST_IDS, PARADOX_IDS, NATURE_NAMES, BALL_TYPES,
} from "../../src/worker/ribbons/species-sets";

/** A wrong or duplicated entry changes the size — these assertions catch it. */
describe("curated species sets (verified against Bulbapedia)", () => {
  it("has the exact expected membership counts", () => {
    expect(LEGENDARY_PROPER_IDS).toHaveLength(71);
    expect(MYTHICAL_IDS).toHaveLength(23);
    expect(FOSSIL_IDS).toHaveLength(25);
    expect(BABY_IDS).toHaveLength(19);
    expect(ULTRA_BEAST_IDS).toHaveLength(11);
    expect(PARADOX_IDS).toHaveLength(20);
    expect(NATURE_NAMES).toHaveLength(25);
    expect(BALL_TYPES).toHaveLength(27);
  });

  it("contains no duplicate ids within a set", () => {
    for (const set of [LEGENDARY_PROPER_IDS, MYTHICAL_IDS, FOSSIL_IDS, BABY_IDS, ULTRA_BEAST_IDS, PARADOX_IDS]) {
      expect(new Set(set).size).toBe(set.length);
    }
  });

  it("keeps the six species sets mutually exclusive", () => {
    const all = [
      ["legendary", LEGENDARY_PROPER_IDS], ["mythical", MYTHICAL_IDS], ["fossil", FOSSIL_IDS],
      ["baby", BABY_IDS], ["ultra-beast", ULTRA_BEAST_IDS], ["paradox", PARADOX_IDS],
    ] as const;
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const overlap = all[i][1].filter((id) => all[j][1].includes(id));
        expect(overlap, `${all[i][0]} ∩ ${all[j][0]}`).toEqual([]);
      }
    }
  });

  it("keeps every national dex id in range 1..1025", () => {
    for (const set of [LEGENDARY_PROPER_IDS, MYTHICAL_IDS, FOSSIL_IDS, BABY_IDS, ULTRA_BEAST_IDS, PARADOX_IDS]) {
      for (const id of set) expect(id).toBeGreaterThanOrEqual(1), expect(id).toBeLessThanOrEqual(1025);
    }
  });

  it("names/balls are lowercase and unique", () => {
    expect(new Set(NATURE_NAMES).size).toBe(25);
    expect(new Set(BALL_TYPES).size).toBe(27);
    expect(NATURE_NAMES.every((n) => n === n.toLowerCase())).toBe(true);
    expect(BALL_TYPES.every((b) => b === b.toLowerCase())).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/worker/species-sets.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `species-sets.ts` with verified ids**

Create `src/worker/ribbons/species-sets.ts`:

```ts
// Curated, verified national-dex id sets for the rarity-class ribbon families,
// plus the canonical nature and Poké Ball name lists for the collector family.
// PURE DATA — no I/O. National dex ids are 1..1025.
//
// Every set below was verified against Bulbapedia on 2026-07-14; each set has a
// count-assertion test in tests/worker/species-sets.test.ts so a wrong or
// duplicated entry fails CI. priors.ts is intentionally left untouched — its
// LEGENDARY_IDS is a *lumped* prior (legendaries + mythicals + UBs + paradox)
// unsuitable for these *separated* achievement sets.

// Legendary Pokémon (proper) — EXCLUDES Mythicals, Ultra Beasts, and the
// non-box Paradox mons. Includes the box legendaries Koraidon (1007) and
// Miraidon (1008), which Bulbapedia dual-classifies as Legendary AND Paradox;
// they live here (not in PARADOX_IDS) so each set stays mutually exclusive.
// Source: https://bulbapedia.bulbagarden.net/wiki/Legendary_Pok%C3%A9mon
// (Bulbapedia states 71 Legendary Pokémon as of Gen IX.)
export const LEGENDARY_PROPER_IDS: readonly number[] = [
  144, 145, 146, 150,                                  // Gen 1 birds + Mewtwo
  243, 244, 245, 249, 250,                             // Gen 2 beasts + Lugia/Ho-Oh
  377, 378, 379, 380, 381, 382, 383, 384,              // Gen 3 Regis/Eon/weather/Rayquaza
  480, 481, 482, 483, 484, 485, 486, 487, 488,         // Gen 4 lake trio/creation/Heatran/Regigigas/Cresselia
  638, 639, 640, 641, 642, 643, 644, 645, 646,         // Gen 5 SoJ/Forces/Tao/Kyurem
  716, 717, 718,                                       // Gen 6 Xerneas/Yveltal/Zygarde
  772, 773, 785, 786, 787, 788, 789, 790, 791, 792, 800, // Gen 7 Null/Silvally/Tapus/Cosmog line/Necrozma
  888, 889, 890, 891, 892, 894, 895, 896, 897, 898, 905, // Gen 8 Zacian/Zamazenta/Eternatus/Kubfu/Urshifu/Regi/Glastrier/Spectrier/Calyrex/Enamorus
  1001, 1002, 1003, 1004, 1007, 1008, 1014, 1015, 1016, 1017, 1024, // Gen 9 Ruinous/Koraidon/Miraidon/Loyal Three/Ogerpon/Terapagos
];

// Mythical Pokémon (23 as of Gen IX). Pecharunt (1025) is Mythical, not Legendary.
// Source: https://bulbapedia.bulbagarden.net/wiki/Mythical_Pok%C3%A9mon
export const MYTHICAL_IDS: readonly number[] = [
  151, 251, 385, 386, 489, 490, 491, 492, 493, 494,
  647, 648, 649, 719, 720, 721, 801, 802, 807, 808, 809, 893, 1025,
];

// Fossil Pokémon — classic fossil-revived species (base + evolutions) through
// Gen 8's Galar chimeras. Gen 9 has no revivable fossils.
// Source: https://bulbapedia.bulbagarden.net/wiki/Fossil_Pok%C3%A9mon
export const FOSSIL_IDS: readonly number[] = [
  138, 139, 140, 141, 142,       // Kanto: Omanyte/Omastar, Kabuto/Kabutops, Aerodactyl
  345, 346, 347, 348,            // Hoenn: Lileep/Cradily, Anorith/Armaldo
  408, 409, 410, 411,            // Sinnoh: Cranidos/Rampardos, Shieldon/Bastiodon
  564, 565, 566, 567,            // Unova: Tirtouga/Carracosta, Archen/Archeops
  696, 697, 698, 699,            // Kalos: Tyrunt/Tyrantrum, Amaura/Aurorus
  880, 881, 882, 883,            // Galar: Dracozolt, Arctozolt, Dracovish, Arctovish
];

// Baby Pokémon — the official breeding-only pre-evolutions (19 as of Gen IX).
// Source: https://bulbapedia.bulbagarden.net/wiki/Baby_Pok%C3%A9mon
export const BABY_IDS: readonly number[] = [
  172, 173, 174, 175, 236, 238, 239, 240,  // Gen 2
  298, 360,                                 // Gen 3: Azurill, Wynaut
  406, 433, 438, 439, 440, 446, 447, 458,   // Gen 4: Budew, Chingling, Bonsly, Mime Jr., Happiny, Munchlax, Riolu, Mantyke
  848,                                      // Gen 8: Toxel
];

// Ultra Beasts (11). Necrozma is a Legendary, not a UB, so it is excluded.
// Source: https://bulbapedia.bulbagarden.net/wiki/Ultra_Beast
export const ULTRA_BEAST_IDS: readonly number[] = [
  793, 794, 795, 796, 797, 798, 799,  // Nihilego, Buzzwole, Pheromosa, Xurkitree, Celesteela, Kartana, Guzzlord
  803, 804, 805, 806,                 // Poipole, Naganadel, Stakataka, Blacephalon
];

// Paradox Pokémon (20) — the 22 Gen 9 Paradox mons MINUS the two box legendaries
// Koraidon (1007) and Miraidon (1008), which are tracked as Legendaries above.
// Source: https://bulbapedia.bulbagarden.net/wiki/Paradox_Pok%C3%A9mon
export const PARADOX_IDS: readonly number[] = [
  984, 985, 986, 987, 988, 989,       // Ancient: Great Tusk .. Sandy Shocks
  990, 991, 992, 993, 994, 995,       // Future: Iron Treads .. Iron Thorns
  1005, 1006, 1009, 1010,             // Roaring Moon, Iron Valiant, Walking Wake, Iron Leaves
  1020, 1021, 1022, 1023,             // Gouging Fire, Raging Bolt, Iron Boulder, Iron Crown
];

// All 25 natures (lowercase, for case-insensitive matching against stored values).
// Source: https://bulbapedia.bulbagarden.net/wiki/Nature
export const NATURE_NAMES: readonly string[] = [
  "hardy", "lonely", "brave", "adamant", "naughty",
  "bold", "docile", "relaxed", "impish", "lax",
  "timid", "hasty", "serious", "jolly", "naive",
  "modest", "mild", "quiet", "bashful", "rash",
  "calm", "gentle", "sassy", "careful", "quirky",
];

// Every Poké Ball obtainable through Gen VII (USUM) — matches the app's save
// import scope (USUM). Source: https://bulbapedia.bulbagarden.net/wiki/Pok%C3%A9_Ball
export const BALL_TYPES: readonly string[] = [
  "poké ball", "great ball", "ultra ball", "master ball",
  "safari ball", "net ball", "dive ball", "nest ball", "repeat ball",
  "timer ball", "luxury ball", "premier ball", "dusk ball", "heal ball",
  "quick ball", "cherish ball", "fast ball", "level ball", "lure ball",
  "heavy ball", "love ball", "friend ball", "moon ball", "sport ball",
  "dream ball", "beast ball", "park ball",
];
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run tests/worker/species-sets.test.ts`
Expected: PASS (5 tests) — every count assertion green, no overlaps.

- [ ] **Step 5: Commit**

```bash
git add src/worker/ribbons/species-sets.ts tests/worker/species-sets.test.ts
git commit -m "feat(flex-C): verified curated species sets (legendary/mythical/fossil/baby/UB/paradox) + natures/balls"
```

---

### Task C3: Regional dexes + National Dex completion tiers

Repurpose the existing `gen-{N}` ribbons into region-flavored **Regional** ribbons (id + earn logic unchanged), and add graduated **National Dex %** completion tiers.

**Files:**
- Modify: `src/worker/ribbons/catalog.ts` (region names + category on the gen loop; new national-dex tier block)
- Test: `tests/worker/ribbons.test.ts` (regional rename + national% cases)

**Interfaces:**
- Consumes: `summary.speciesIds`, `ref.species`.
- Produces: `gen-{N}` ribbons in category `Regional` named `<Region> Regional Dex`; new `national-dex-{25,50,75,100}` ribbons in category `Completion`.

**Category decision (justified):** National Dex % tiers go in a new **`Completion`** category, *not* `Grand`. `Grand` is reserved for the two absolute marquee ribbons (`living-dex`, `complete-dex-forms`); the % tiers are graduated milestones on the way there, so grouping them separately keeps `Grand` special while letting `Completion` sort right after it. `Regional` replaces `Generation` because the family is re-themed by region (still defined by the `generation` field — the honest derivable version; true game-specific regional dexes need curated lists we don't have).

- [ ] **Step 1: Write the failing tests**

Append to `tests/worker/ribbons.test.ts` (inside the top-level `describe`):

```ts
  it("re-themes gen ribbons as Regional dexes (id + earn logic unchanged)", () => {
    const summary: CollectionSummary = { ...emptySummary, speciesIds: new Set([1, 2]) };
    const gen1 = byId(computeRibbons(summary, ref), "gen-1");
    expect(gen1.category).toBe("Regional");
    expect(gen1.name).toBe("Kanto Regional Dex");
    expect(gen1.earned).toBe(true); // still: own all gen-1 species
  });

  it("adds National Dex % completion tiers (Completion category) earned by ratio", () => {
    // ref has 3 species total; owning 2 of 3 = 66% -> clears 25 and 50, not 75/100.
    const summary: CollectionSummary = { ...emptySummary, speciesIds: new Set([1, 2]) };
    const results = computeRibbons(summary, ref);
    const t25 = byId(results, "national-dex-25");
    expect(t25.category).toBe("Completion");
    expect(t25.earned).toBe(true);
    expect(byId(results, "national-dex-50").earned).toBe(true);
    expect(byId(results, "national-dex-75").earned).toBe(false);
    expect(byId(results, "national-dex-100").earned).toBe(false);
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/worker/ribbons.test.ts`
Expected: FAIL — category is still `Generation`, national-dex ids don't exist.

- [ ] **Step 3: Implement**

In `src/worker/ribbons/catalog.ts`, add a region-name map near the top-level consts:

```ts
/** Generation → region label, for Regional-dex ribbon flavor (dex still defined by the `generation` field). */
const REGION_NAMES: Record<number, string> = {
  1: "Kanto", 2: "Johto", 3: "Hoenn", 4: "Sinnoh", 5: "Unova",
  6: "Kalos", 7: "Alola", 8: "Galar", 9: "Paldea",
};

/** National Dex completion percentage tiers. */
const NATIONAL_DEX_TIERS = [25, 50, 75, 100] as const;
```

Replace the existing `gen-{N}` push so it uses the region name and `Regional` category (keep id `gen-${gen}` and the `progressFor` earn logic):

```ts
  for (const gen of generations) {
    const ids = ref.species.filter((s) => s.generation === gen).map((s) => s.id);
    const p = progressFor(summary.speciesIds, ids);
    const region = REGION_NAMES[gen] ?? `Generation ${gen}`;
    results.push({
      id: `gen-${gen}`,
      name: `${region} Regional Dex`,
      description: `Own every species introduced in Generation ${gen} (the ${region} regional dex).`,
      category: "Regional",
      earned: p.earned,
      progress: { current: p.current, total: p.total },
    });
  }
```

Immediately after the gen loop, add the National Dex % block:

```ts
  // national-dex-{25,50,75,100}: own at least N% of all species.
  {
    const totalSpecies = allSpeciesIds.length;
    const owned = allSpeciesIds.reduce((n, id) => (summary.speciesIds.has(id) ? n + 1 : n), 0);
    for (const tier of NATIONAL_DEX_TIERS) {
      const threshold = Math.ceil((totalSpecies * tier) / 100);
      results.push({
        id: `national-dex-${tier}`,
        name: `National Dex ${tier}%`,
        description: `Register ${tier}% of the National Pokédex.`,
        category: "Completion",
        earned: totalSpecies > 0 && owned >= threshold,
        progress: { current: Math.min(owned, threshold), total: threshold },
      });
    }
  }
```

(Insert this block **after** the gen loop and **before** the type loop so catalog order stays: living-dex, complete-dex-forms, regional gens, national%, types, …)

- [ ] **Step 4: Verify + commit**

Run: `npx vitest run tests/worker/ribbons.test.ts tests/worker/ribbons-route.test.ts`
Expected: PASS — existing gen/route assertions (which key on id, not category) still pass; new cases pass.

```bash
git add src/worker/ribbons/catalog.ts tests/worker/ribbons.test.ts
git commit -m "feat(flex-C): regional-dex re-theme + National Dex % completion tiers"
```

---

### Task C4: Rarity-class ribbons (own-all-of-set)

**Files:**
- Modify: `src/worker/ribbons/catalog.ts` (rarity-class block; imports from `species-sets.ts` + `priors.ts`)
- Test: `tests/worker/ribbons.test.ts`

**Interfaces:**
- Consumes: `LEGENDARY_PROPER_IDS`, `MYTHICAL_IDS`, `FOSSIL_IDS`, `BABY_IDS`, `ULTRA_BEAST_IDS`, `PARADOX_IDS` (C2); `STARTER_FINAL_IDS`, `PSEUDO_IDS` (`priors.ts`, unchanged); `summary.speciesIds`.
- Produces: eight ribbons `rarity-{starters,legendaries,mythicals,pseudo,fossils,babies,ultra-beasts,paradox}` in category `Rarity Class`.

- [ ] **Step 1: Write the failing test**

Append to `tests/worker/ribbons.test.ts`:

```ts
  it("adds eight Rarity Class ribbons, each earned only when the whole set is owned", () => {
    const results = computeRibbons(emptySummary, ref);
    const ids = results.filter((r) => r.category === "Rarity Class").map((r) => r.id);
    expect(ids).toEqual([
      "rarity-starters", "rarity-legendaries", "rarity-mythicals", "rarity-pseudo",
      "rarity-fossils", "rarity-babies", "rarity-ultra-beasts", "rarity-paradox",
    ]);
    // total reflects the curated set size regardless of ref contents.
    const ub = results.find((r) => r.id === "rarity-ultra-beasts")!;
    expect(ub.progress.total).toBe(11);
    expect(ub.earned).toBe(false);
  });

  it("earns rarity-babies once every baby species id is owned", () => {
    const babyIds = [172, 173, 174, 175, 236, 238, 239, 240, 298, 360, 406, 433, 438, 439, 440, 446, 447, 458, 848];
    const results = computeRibbons({ ...emptySummary, speciesIds: new Set(babyIds) }, ref);
    const babies = results.find((r) => r.id === "rarity-babies")!;
    expect(babies.earned).toBe(true);
    expect(babies.progress).toEqual({ current: 19, total: 19 });
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/worker/ribbons.test.ts`
Expected: FAIL — no Rarity Class ribbons yet.

- [ ] **Step 3: Implement**

Add imports at the top of `catalog.ts`:

```ts
import {
  LEGENDARY_PROPER_IDS, MYTHICAL_IDS, FOSSIL_IDS, BABY_IDS, ULTRA_BEAST_IDS, PARADOX_IDS,
} from "./species-sets";
import { STARTER_FINAL_IDS, PSEUDO_IDS } from "../rarity/priors";
```

Add a table + loop (place it after the type loop, before form-fanatic, so order is regional → national% → types → **rarity class** → forms):

```ts
  // rarity-{class}: own every member of a curated rarity-class set.
  const RARITY_SETS: { id: string; name: string; label: string; ids: readonly number[] }[] = [
    { id: "rarity-starters", name: "Starter Squad", label: "final-stage starter", ids: [...STARTER_FINAL_IDS] },
    { id: "rarity-legendaries", name: "Legendary Keeper", label: "Legendary", ids: LEGENDARY_PROPER_IDS },
    { id: "rarity-mythicals", name: "Mythic Hoard", label: "Mythical", ids: MYTHICAL_IDS },
    { id: "rarity-pseudo", name: "Pseudo Powerhouse", label: "pseudo-legendary", ids: [...PSEUDO_IDS] },
    { id: "rarity-fossils", name: "Fossil Restorer", label: "Fossil", ids: FOSSIL_IDS },
    { id: "rarity-babies", name: "Baby Boom", label: "Baby", ids: BABY_IDS },
    { id: "rarity-ultra-beasts", name: "Beyond the Wormhole", label: "Ultra Beast", ids: ULTRA_BEAST_IDS },
    { id: "rarity-paradox", name: "Temporal Anomaly", label: "Paradox", ids: PARADOX_IDS },
  ];
  for (const set of RARITY_SETS) {
    const p = progressFor(summary.speciesIds, [...set.ids]);
    results.push({
      id: set.id,
      name: set.name,
      description: `Own every ${set.label} Pokémon.`,
      category: "Rarity Class",
      earned: p.earned,
      progress: { current: p.current, total: p.total },
    });
  }
```

- [ ] **Step 4: Verify + commit**

Run: `npx vitest run tests/worker/ribbons.test.ts tests/worker/species-sets.test.ts`
Expected: PASS.

```bash
git add src/worker/ribbons/catalog.ts tests/worker/ribbons.test.ts
git commit -m "feat(flex-C): eight Rarity Class ribbons (starters/legendaries/mythicals/pseudo/fossils/babies/UB/paradox)"
```

---

### Task C5: Specimen-detail collector ribbons (10)

**Files:**
- Modify: `src/worker/ribbons/catalog.ts` (collector block; imports `NATURE_NAMES`, `BALL_TYPES`)
- Test: `tests/worker/ribbons.test.ts`
- Test: `tests/worker/ribbons-route.test.ts` (expand the C1 aggregation case)

**Interfaces:**
- Consumes: `summary.naturesOwned`, `summary.ballsOwned`, `summary.level100Count`, `summary.sixIvCount`, `summary.megaFormCount`, `summary.gmaxFormCount`; `NATURE_NAMES`, `BALL_TYPES` (C2).
- Produces: ten ribbons in category `Collector`: `collector-natures`, `collector-balls`, `collector-level100-{1,10,50}`, `collector-6iv-{1,10,50}`, `collector-mega`, `collector-gmax`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/worker/ribbons.test.ts`:

```ts
  describe("Collector ribbons", () => {
    it("earns collector-natures only when all 25 natures are owned", () => {
      const all = new Set([
        "hardy","lonely","brave","adamant","naughty","bold","docile","relaxed","impish","lax",
        "timid","hasty","serious","jolly","naive","modest","mild","quiet","bashful","rash",
        "calm","gentle","sassy","careful","quirky",
      ]);
      const done = byId(computeRibbons({ ...emptySummary, naturesOwned: all }, ref), "collector-natures");
      expect(done.category).toBe("Collector");
      expect(done.earned).toBe(true);
      expect(done.progress).toEqual({ current: 25, total: 25 });

      const partial = byId(computeRibbons({ ...emptySummary, naturesOwned: new Set(["adamant", "bogus"]) }, ref), "collector-natures");
      expect(partial.earned).toBe(false);
      expect(partial.progress).toEqual({ current: 1, total: 25 }); // "bogus" isn't canonical
    });

    it("earns collector-balls only when all 27 canonical balls are owned", () => {
      const partial = byId(computeRibbons({ ...emptySummary, ballsOwned: new Set(["ultra ball", "great ball"]) }, ref), "collector-balls");
      expect(partial.progress).toEqual({ current: 2, total: 27 });
      expect(partial.earned).toBe(false);
    });

    it("earns level-100 and 6IV tiers by count", () => {
      const r = computeRibbons({ ...emptySummary, level100Count: 12, sixIvCount: 1 }, ref);
      expect(byId(r, "collector-level100-1").earned).toBe(true);
      expect(byId(r, "collector-level100-10").earned).toBe(true);
      expect(byId(r, "collector-level100-50").earned).toBe(false);
      expect(byId(r, "collector-6iv-1").earned).toBe(true);
      expect(byId(r, "collector-6iv-10").earned).toBe(false);
    });

    it("earns mega / gmax breadth milestones by owned-form count", () => {
      const r = computeRibbons({ ...emptySummary, megaFormCount: 20, gmaxFormCount: 3 }, ref);
      expect(byId(r, "collector-mega").earned).toBe(true);
      expect(byId(r, "collector-gmax").earned).toBe(false);
      expect(byId(r, "collector-gmax").progress).toEqual({ current: 3, total: 10 });
    });
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/worker/ribbons.test.ts`
Expected: FAIL — Collector ribbons don't exist.

- [ ] **Step 3: Implement**

Add imports to `catalog.ts`:

```ts
import { NATURE_NAMES, BALL_TYPES } from "./species-sets";
```

(Combine with the existing `species-sets` import from C4 into one statement.)

Add these consts near the other thresholds:

```ts
const LEVEL100_TIERS = [1, 10, 50] as const;
const SIX_IV_TIERS = [1, 10, 50] as const;
const MEGA_MASTER_TOTAL = 20;
const GMAX_MASTER_TOTAL = 10;
```

Add the collector block (place it after the rarity-class block, before form-fanatic — order: … rarity class → **collector** → forms):

```ts
  // collector-natures / collector-balls: own the whole canonical set (case-insensitive).
  {
    const naturesCurrent = NATURE_NAMES.reduce((n, name) => (summary.naturesOwned.has(name) ? n + 1 : n), 0);
    results.push({
      id: "collector-natures", name: "Nature Lover",
      description: "Own a Pokémon of all 25 natures.", category: "Collector",
      earned: naturesCurrent === NATURE_NAMES.length,
      progress: { current: naturesCurrent, total: NATURE_NAMES.length },
    });
    const ballsCurrent = BALL_TYPES.reduce((n, name) => (summary.ballsOwned.has(name) ? n + 1 : n), 0);
    results.push({
      id: "collector-balls", name: "Gotta Catch 'Em All",
      description: "Own a Pokémon caught in every kind of Poké Ball.", category: "Collector",
      earned: ballsCurrent === BALL_TYPES.length,
      progress: { current: ballsCurrent, total: BALL_TYPES.length },
    });
  }

  // collector-level100-{1,10,50}: level-100 milestones.
  for (const tier of LEVEL100_TIERS) {
    results.push(tieredResult(
      "collector-level100", "Level Cap",
      (t) => `Raise ${t} Pokémon to level 100.`, "Collector",
      summary.level100Count, tier,
    ));
  }

  // collector-6iv-{1,10,50}: flawless-IV milestones.
  for (const tier of SIX_IV_TIERS) {
    results.push(tieredResult(
      "collector-6iv", "Flawless",
      (t) => `Own ${t} Pokémon with perfect (6×31) IVs.`, "Collector",
      summary.sixIvCount, tier,
    ));
  }

  // collector-mega / collector-gmax: breadth of Mega / Gigantamax forms owned.
  results.push(tieredResult(
    "collector", "Mega Evolver",
    () => `Own ${MEGA_MASTER_TOTAL} different Mega forms.`, "Collector",
    summary.megaFormCount, MEGA_MASTER_TOTAL,
  ));
```

Note: `tieredResult` builds `id = ${prefix}-${tier}`. To get the exact ids `collector-mega` / `collector-gmax`, do **not** use `tieredResult` for these two — push them explicitly:

```ts
  results.push({
    id: "collector-mega", name: "Mega Evolver",
    description: `Own ${MEGA_MASTER_TOTAL} different Mega forms.`, category: "Collector",
    earned: summary.megaFormCount >= MEGA_MASTER_TOTAL,
    progress: { current: Math.min(summary.megaFormCount, MEGA_MASTER_TOTAL), total: MEGA_MASTER_TOTAL },
  });
  results.push({
    id: "collector-gmax", name: "Go Big",
    description: `Own ${GMAX_MASTER_TOTAL} different Gigantamax forms.`, category: "Collector",
    earned: summary.gmaxFormCount >= GMAX_MASTER_TOTAL,
    progress: { current: Math.min(summary.gmaxFormCount, GMAX_MASTER_TOTAL), total: GMAX_MASTER_TOTAL },
  });
```

(Remove the erroneous `tieredResult("collector", "Mega Evolver", …)` line shown above — the two explicit pushes replace it. `tieredResult` is still correct for the level100/6IV tiers because their ids are `collector-level100-{tier}` / `collector-6iv-{tier}`.)

- [ ] **Step 4: Expand the route aggregation test**

In `tests/worker/ribbons-route.test.ts`, replace the C1 placeholder test body to assert the collector ribbons advance after inserting a level-100, 6IV, Ultra-Ball, Adamant specimen:

```ts
    const body = (await res.json()) as any;
    const level1 = body.ribbons.find((r: any) => r.id === "collector-level100-1");
    expect(level1.earned).toBe(true);
    const sixiv1 = body.ribbons.find((r: any) => r.id === "collector-6iv-1");
    expect(sixiv1.earned).toBe(true);
    const natures = body.ribbons.find((r: any) => r.id === "collector-natures");
    expect(natures.progress.current).toBe(1);
    const balls = body.ribbons.find((r: any) => r.id === "collector-balls");
    expect(balls.progress.current).toBe(1);
```

- [ ] **Step 5: Verify + commit**

Run: `npx vitest run tests/worker/ribbons.test.ts tests/worker/ribbons-route.test.ts`
Expected: PASS.

```bash
git add src/worker/ribbons/catalog.ts tests/worker/ribbons.test.ts tests/worker/ribbons-route.test.ts
git commit -m "feat(flex-C): ten Collector ribbons (natures/balls/level100/6IV/mega/gmax)"
```

---

### Task C6: Type-master tiers + shiny deepening

**Files:**
- Modify: `src/worker/ribbons/catalog.ts`
- Test: `tests/worker/ribbons.test.ts`

**Interfaces:**
- Consumes: `ref.species` (types), `summary.speciesIds`, `summary.shinySpeciesIds`, `summary.shinyCount`, `summary.eventCount`.
- Produces: `typemaster-{slug}-{10|25|50}` (category `Type`, generated only where the type has ≥ tier species); `shiny-living-dex` and `shiny-rainbow` (category `Shiny`); extended tiers `shiny-{250,500}` and `event-{250,500}`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/worker/ribbons.test.ts`. Uses a synthetic ref so tier generation is deterministic:

```ts
  describe("Type deepening + shiny", () => {
    const bigRef: ReferenceData = {
      species: [
        ...Array.from({ length: 30 }, (_, i) => ({ id: 1000 + i, generation: 1, types: ["bug"] })),
        { id: 2000, generation: 1, types: ["ice"] }, // ice has only 1 species -> no ice tiers
      ],
      forms: [],
      speciesNames: new Map(),
    };

    it("generates type tiers only up to what a type can support", () => {
      const ids = computeRibbons(emptySummary, bigRef).map((r) => r.id);
      expect(ids).toContain("typemaster-bug-10");    // 30 bug species -> 10 & 25 exist
      expect(ids).toContain("typemaster-bug-25");
      expect(ids).not.toContain("typemaster-bug-50"); // only 30 < 50
      expect(ids).not.toContain("typemaster-ice-10"); // only 1 ice species
    });

    it("earns a type tier by distinct owned count of that type", () => {
      const owned = new Set(Array.from({ length: 12 }, (_, i) => 1000 + i));
      const t = byId(computeRibbons({ ...emptySummary, speciesIds: owned }, bigRef), "typemaster-bug-10");
      expect(t.category).toBe("Type");
      expect(t.earned).toBe(true);
      expect(t.progress).toEqual({ current: 10, total: 10 });
      expect(byId(computeRibbons({ ...emptySummary, speciesIds: owned }, bigRef), "typemaster-bug-25").earned).toBe(false);
    });

    it("earns shiny-living-dex only when a shiny of every species is owned", () => {
      const allShiny = new Set(ref.species.map((s) => s.id));
      const done = byId(computeRibbons({ ...emptySummary, shinySpeciesIds: allShiny }, ref), "shiny-living-dex");
      expect(done.category).toBe("Shiny");
      expect(done.earned).toBe(true);
    });

    it("earns shiny-rainbow when a shiny of every present type is owned", () => {
      // ref types present: grass, fire. Shiny species 1 (grass) + 2 (fire) covers both.
      const r = byId(computeRibbons({ ...emptySummary, shinySpeciesIds: new Set([1, 2]) }, ref), "shiny-rainbow");
      expect(r.earned).toBe(true);
      const partial = byId(computeRibbons({ ...emptySummary, shinySpeciesIds: new Set([1]) }, ref), "shiny-rainbow");
      expect(partial.earned).toBe(false);
    });

    it("adds extended shiny/event tiers at 250 and 500", () => {
      const r = computeRibbons({ ...emptySummary, shinyCount: 300, eventCount: 300 }, ref);
      expect(byId(r, "shiny-250").earned).toBe(true);
      expect(byId(r, "shiny-500").earned).toBe(false);
      expect(byId(r, "event-250").earned).toBe(true);
      expect(byId(r, "event-500").earned).toBe(false);
    });
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/worker/ribbons.test.ts`
Expected: FAIL — none of these ids exist yet.

- [ ] **Step 3: Implement**

Add consts to `catalog.ts`:

```ts
const TYPE_MASTER_TIERS = [10, 25, 50] as const;
const SHINY_EXTRA_TIERS = [250, 500] as const;
const EVENT_EXTRA_TIERS = [250, 500] as const;
```

Add the type-tier block right **after** the existing type loop (which produces the `type-{slug}` own-all ribbons). Reuse the per-type species arrays:

```ts
  // typemaster-{slug}-{tier}: own N distinct species of a type. Only emitted
  // when the type has at least `tier` species (never an impossible ribbon).
  for (const type of types) {
    const ids = ref.species.filter((s) => s.types.includes(type)).map((s) => s.id);
    const ownedCount = ids.reduce((n, id) => (summary.speciesIds.has(id) ? n + 1 : n), 0);
    for (const tier of TYPE_MASTER_TIERS) {
      if (ids.length < tier) continue;
      results.push({
        id: `typemaster-${type}-${tier}`,
        name: `${capitalize(type)} Specialist ${tier}`,
        description: `Own ${tier} different ${type}-type species.`,
        category: "Type",
        earned: ownedCount >= tier,
        progress: { current: Math.min(ownedCount, tier), total: tier },
      });
    }
  }
```

Add the shiny-deepening block near the existing shiny tier loop (after the `shiny-{10,50,100}` and `event-{10,50,100}` loops):

```ts
  // Extended shiny / event tiers.
  for (const tier of SHINY_EXTRA_TIERS) {
    results.push(tieredResult("shiny", "Shiny Hunter", (t) => `Catch ${t} shiny Pokémon.`, "Shiny", summary.shinyCount, tier));
  }
  for (const tier of EVENT_EXTRA_TIERS) {
    results.push(tieredResult("event", "Event Collector", (t) => `Collect ${t} event Pokémon.`, "Events", summary.eventCount, tier));
  }

  // shiny-rainbow: own a shiny of every type present in the reference data.
  {
    const shinyTypes = new Set<string>();
    for (const s of ref.species) {
      if (summary.shinySpeciesIds.has(s.id)) for (const t of s.types) shinyTypes.add(t);
    }
    const total = types.length;
    results.push({
      id: "shiny-rainbow", name: "Chromatic",
      description: "Own a shiny Pokémon of every type.", category: "Shiny",
      earned: total > 0 && shinyTypes.size >= total,
      progress: { current: Math.min(shinyTypes.size, total), total },
    });
  }

  // shiny-living-dex: own a shiny of every species.
  {
    const p = progressFor(summary.shinySpeciesIds, allSpeciesIds);
    results.push({
      id: "shiny-living-dex", name: "Shiny Living Dex",
      description: "Own a shiny of every species in the Pokédex.", category: "Shiny",
      earned: p.earned,
      progress: { current: p.current, total: p.total },
    });
  }
```

- [ ] **Step 4: Verify + commit**

Run: `npx vitest run tests/worker/ribbons.test.ts`
Expected: PASS.

```bash
git add src/worker/ribbons/catalog.ts tests/worker/ribbons.test.ts
git commit -m "feat(flex-C): type-master tiers + shiny deepening (rainbow, living-dex, 250/500 tiers)"
```

---

### Task C7: More easter eggs (10 new secret Fun ribbons)

**Files:**
- Modify: `src/worker/ribbons/catalog.ts` (extend `SPECIES_FUN_RIBBONS`)
- Test: `tests/worker/ribbons.test.ts`

**Interfaces:**
- Consumes: `summary.speciesIds` (all ten are single-species owns, reusing the existing `SPECIES_FUN_RIBBONS` mechanism).
- Produces: ten new `fun-*` ribbons (category `Fun`, all `secret: true`).

- [ ] **Step 1: Write the failing test**

Append to `tests/worker/ribbons.test.ts` (inside the existing `describe("Fun ribbons", …)`):

```ts
    it("adds ten new secret species easter eggs, hidden until earned", () => {
      const newFun = [
        "fun-mimikyu", "fun-sudowoodo", "fun-luvdisc", "fun-stunfisk", "fun-feebas",
        "fun-spinda", "fun-shuckle", "fun-delibird", "fun-dunsparce", "fun-bidoof",
      ];
      const results = computeRibbons(emptySummary, ref);
      for (const id of newFun) {
        const r = results.find((x) => x.id === id)!;
        expect(r, id).toBeTruthy();
        expect(r.category).toBe("Fun");
        expect(r.secret).toBe(true);
        expect(r.earned).toBe(false);
      }
    });

    it("earns fun-bidoof once Bidoof (399) is owned", () => {
      const r = byId(computeRibbons({ ...emptySummary, speciesIds: new Set([399]) }, ref), "fun-bidoof");
      expect(r.earned).toBe(true);
      expect(r.progress).toEqual({ current: 1, total: 1 });
    });
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/worker/ribbons.test.ts`
Expected: FAIL — the ten ids don't exist yet.

- [ ] **Step 3: Implement**

Extend the `SPECIES_FUN_RIBBONS` array in `catalog.ts` with these ten entries (append after `fun-metapod`). Dex ids verified: Mimikyu 778, Sudowoodo 185, Luvdisc 370, Stunfisk 618, Feebas 349, Spinda 327, Shuckle 213, Delibird 225, Dunsparce 206, Bidoof 399.

```ts
  { id: "fun-mimikyu", name: "Costume Party", description: "Own a Mimikyu.", speciesId: 778, secret: true },
  { id: "fun-sudowoodo", name: "Not a Tree", description: "Own a Sudowoodo.", speciesId: 185, secret: true },
  { id: "fun-luvdisc", name: "Lucky in Love", description: "Own a Luvdisc.", speciesId: 370, secret: true },
  { id: "fun-stunfisk", name: "Flat Out", description: "Own a Stunfisk.", speciesId: 618, secret: true },
  { id: "fun-feebas", name: "Diamond in the Rough", description: "Own a Feebas.", speciesId: 349, secret: true },
  { id: "fun-spinda", name: "Spot the Difference", description: "Own a Spinda.", speciesId: 327, secret: true },
  { id: "fun-shuckle", name: "Juice Box", description: "Own a Shuckle.", speciesId: 213, secret: true },
  { id: "fun-delibird", name: "Seasonal Worker", description: "Own a Delibird.", speciesId: 225, secret: true },
  { id: "fun-dunsparce", name: "Underrated", description: "Own a Dunsparce.", speciesId: 206, secret: true },
  { id: "fun-bidoof", name: "Positive Outlook", description: "Own a Bidoof.", speciesId: 399, secret: true },
```

- [ ] **Step 4: Verify + commit**

Run: `npx vitest run tests/worker/ribbons.test.ts`
Expected: PASS.

```bash
git add src/worker/ribbons/catalog.ts tests/worker/ribbons.test.ts
git commit -m "feat(flex-C): ten more secret Fun easter-egg ribbons"
```

---

### Task C8: Client resolver rules + `CATEGORY_ORDER` for the new categories

**Files:**
- Modify: `src/react-app/ribbons/ribbonIconResolver.ts` (rules for `Completion`, `Regional`, `Rarity Class`, `Collector`; assign `coin` + `heart`)
- Modify: `src/react-app/pages/Ribbons.tsx` (`CATEGORY_ORDER`; `CATEGORY_ACCENT_TYPE`)
- Test: `tests/react-app/ribbonIcon.test.ts`

**Interfaces:**
- Consumes: `typeColor` (`../theme`); ribbon `{ id, category }` from the API.
- Produces: `resolveRibbonIcon` handles every new category; the two still-free pieces are assigned — `coin` → `national-dex-100`, `heart` → `shiny-living-dex`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/react-app/ribbonIcon.test.ts`:

```ts
  it("assigns the free pieces to the two new marquee ribbons", () => {
    expect(resolveRibbonIcon({ id: "national-dex-100", category: "Completion" })).toEqual({ kind: "piece", piece: "coin" });
    expect(resolveRibbonIcon({ id: "shiny-living-dex", category: "Shiny" })).toEqual({ kind: "piece", piece: "heart" });
  });
  it("regional ribbons keep the roman-numeral rosette (id-keyed on gen-N)", () => {
    const v = resolveRibbonIcon({ id: "gen-3", category: "Regional" });
    expect(v.kind).toBe("rosette");
    if (v.kind === "rosette") expect(v.glyph).toEqual({ kind: "text", text: "III" });
  });
  it("lower national-dex tiers use a rosette with a % text glyph", () => {
    const v = resolveRibbonIcon({ id: "national-dex-25", category: "Completion" });
    expect(v.kind).toBe("rosette");
    if (v.kind === "rosette") expect(v.glyph).toEqual({ kind: "text", text: "25%" });
  });
  it("rarity-class ribbons use a metallic rosette + diamond emoji glyph", () => {
    const v = resolveRibbonIcon({ id: "rarity-legendaries", category: "Rarity Class" });
    expect(v.kind).toBe("rosette");
    if (v.kind === "rosette") expect(v.glyph.kind).toBe("emoji");
  });
  it("collector ribbons resolve to a rosette (no crash on new ids)", () => {
    expect(resolveRibbonIcon({ id: "collector-natures", category: "Collector" }).kind).toBe("rosette");
    expect(resolveRibbonIcon({ id: "typemaster-bug-25", category: "Type" }).kind).toBe("rosette");
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/react-app/ribbonIcon.test.ts`
Expected: FAIL — new categories fall through to the letter fallback.

- [ ] **Step 3: Implement resolver rules**

In `src/react-app/ribbons/ribbonIconResolver.ts`, add region colors and new branches. Insert the marquee-piece checks near the top (before the family branches) and the category branches before the final fallback:

```ts
// Per-generation base hues reused for Regional ribbons (region == generation).
const REGION_COLORS: Record<number, string> = GEN_COLORS;

// Metallic tone for rarity-class ribbons.
const RARITY_METAL = "#C0A062";
```

Add the marquee pieces (top, alongside the living-dex / complete-dex-forms checks):

```ts
	if (id === "national-dex-100") return { kind: "piece", piece: "coin" };
	if (id === "shiny-living-dex") return { kind: "piece", piece: "heart" };
```

Change the generation branch to also match `Regional` (both categories key on `gen-` ids):

```ts
	if ((category === "Generation" || category === "Regional") && id.startsWith("gen-")) {
		const n = Number(id.slice("gen-".length));
		return {
			kind: "rosette",
			baseColor: REGION_COLORS[n] ?? "#7E8AA2",
			glyph: { kind: "text", text: ROMAN[n] ?? String(n) },
		};
	}
```

Add these branches before the `Grand` / fallback:

```ts
	if (category === "Completion" && id.startsWith("national-dex-")) {
		const pct = id.slice("national-dex-".length);
		return { kind: "rosette", baseColor: typeColor("electric"), glyph: { kind: "text", text: `${pct}%` } };
	}

	if (category === "Rarity Class") {
		return { kind: "rosette", baseColor: RARITY_METAL, glyph: { kind: "emoji", emoji: "💎" } };
	}

	if (category === "Collector") {
		const emoji =
			id === "collector-natures" ? "🌿" :
			id === "collector-balls" ? "🔴" :
			id.startsWith("collector-level100") ? "💯" :
			id.startsWith("collector-6iv") ? "⭐" :
			id === "collector-mega" ? "🧬" :
			id === "collector-gmax" ? "🔺" : "📦";
		return { kind: "rosette", baseColor: typeColor("steel"), glyph: { kind: "emoji", emoji } };
	}
```

Also handle the new **type tiers** in the existing `Type` branch so `typemaster-*` ids don't try to parse a type slug from `type-`. Update the Type branch guard:

```ts
	if (category === "Type" && id.startsWith("type-")) {
		const type = id.slice("type-".length);
		return { kind: "rosette", baseColor: typeColor(type), glyph: { kind: "type", type } };
	}
	if (category === "Type" && id.startsWith("typemaster-")) {
		// typemaster-<slug>-<tier>
		const rest = id.slice("typemaster-".length);
		const slug = rest.slice(0, rest.lastIndexOf("-"));
		return { kind: "rosette", baseColor: typeColor(slug), glyph: { kind: "type", type: slug } };
	}
```

- [ ] **Step 4: Update `CATEGORY_ORDER` + accents in `Ribbons.tsx`**

In `src/react-app/pages/Ribbons.tsx`, replace `CATEGORY_ORDER`:

```ts
const CATEGORY_ORDER = [
	"Grand", "Completion", "Regional", "Type", "Rarity Class",
	"Collector", "Forms", "Form Sets", "Shiny", "Events", "Fun",
];
```

Extend `CATEGORY_ACCENT_TYPE` so the new categories get a coherent accent (note `Generation` is gone; add `Regional`/`Completion`/`Rarity Class`/`Collector`):

```ts
const CATEGORY_ACCENT_TYPE: Record<string, string> = {
	Grand: "electric",
	Completion: "electric",
	Regional: "dragon",
	"Rarity Class": "ghost",
	Collector: "steel",
	Forms: "psychic",
	"Form Sets": "ice",
	Shiny: "fairy",
	Events: "grass",
	Fun: "poison",
};
```

(The `grouped` memo already appends any category not in `CATEGORY_ORDER` alphabetically, so nothing is dropped even if a category is missed — but all five are covered here.)

- [ ] **Step 5: Verify + commit**

Run: `npx vitest run tests/react-app/ribbonIcon.test.ts && npx tsc -b && npm run build`
Expected: resolver tests pass; typecheck + build succeed.

- [ ] **Step 6: Visual verification (controller, browser preview)**

On the Ribbons page confirm the new category sections render in order (Grand, Completion, Regional, Type, Rarity Class, Collector, …); `national-dex-100` shows the coin piece; `shiny-living-dex` shows the heart piece; regional ribbons show roman numerals; rarity-class show a diamond rosette; collector ribbons show their emoji rosettes; type-master tiers show the type icon. No console errors.

```bash
git add src/react-app/ribbons/ribbonIconResolver.ts src/react-app/pages/Ribbons.tsx tests/react-app/ribbonIcon.test.ts
git commit -m "feat(flex-C): resolver rules + CATEGORY_ORDER for Completion/Regional/Rarity Class/Collector"
```

---

## Self-Review

**Spec coverage (Section 3 of the design spec):**

| Spec item | Family | Task | Status |
| --- | --- | --- | --- |
| Regional living dexes I–IX | 9 regional (re-themed `gen-{N}`) | C3 | ✓ |
| National Dex % tiers 25/50/75/100 | 4 completion | C3 | ✓ |
| Rarity-class sets (Starters, Legendaries, Mythicals, Pseudo, Fossils, Babies, UB, Paradox) | 8 | C2 (sets) + C4 (ribbons) | ✓ |
| Specimen-detail collector (natures, balls, level-100, 6IV, gmax/mega) | 10 | C1 (aggregation) + C5 | ✓ |
| Type-master tiers (10/25/50 distinct) | ~40 type tiers | C6 | ✓ |
| Shiny-of-every-type + shiny living-dex + extended event tiers | shiny-rainbow, shiny-living-dex, shiny/event 250/500 | C6 | ✓ |
| More easter eggs (~10 secret) | 10 fun-* | C7 | ✓ |
| Client resolution renders new families; CATEGORY_ORDER updated | — | C8 | ✓ |
| Extend `CollectionSummary` + aggregation + curated sets | — | C1, C2 | ✓ |

**Ribbon count added (by family):**
- Regional / Completion (C3): 4 net-new (`national-dex-*`) + 9 re-themed `gen-{N}` (id-stable, count unchanged) = **13 in family, 4 net-new**.
- Rarity Class (C4): **8**.
- Collector (C5): **10**.
- Type & Shiny deepening (C6): **~40** type-master tiers (3 per type × ~18 types, minus tiers a type can't reach — data-dependent, ~40 with the full National Dex; capped structurally at 54) + **6** fixed (`shiny-rainbow`, `shiny-living-dex`, `shiny-250/500`, `event-250/500`).
- Fun (C7): **10**.

Net-new total ≈ 4 + 8 + 10 + 46 + 10 = **~78 net-new** (**~87 catalog entries in the new families**), landing on the spec's "~75–90" / "~85" target.

**Verified ID-set sizes (source in each set's code comment):**
- Legendaries proper = 71, Mythicals = 23, Fossils = 25, Babies = 19, Ultra Beasts = 11, Paradox = 20 (excludes box legendaries Koraidon/Miraidon, which are counted as Legendaries). Reused from `priors.ts`: Starters = 27, Pseudo = 10. Natures = 25, Balls = 27. Every one is guarded by an exact `toHaveLength` assertion in `tests/worker/species-sets.test.ts`, plus mutual-exclusivity and range checks.

**Placeholder scan:** none — every step carries complete code + exact commands + expected output. The one intentional correction (the erroneous `tieredResult("collector", "Mega Evolver", …)` line in C5 Step 3) is explicitly called out and replaced with two explicit pushes in the same step.

**Type consistency:**
- `CollectionSummary` widened once (C1); both constructors (route `emptySummary`, pure-test `emptySummary`) updated in C1 so `tsc -b` stays green.
- `isSixIv(string | null): boolean` (C1, pure in `catalog.ts`) consumed only by the route (C1) — parsing stays out of the engine's evaluation path.
- Curated sets are `readonly number[]`; `progressFor` takes `number[]`, so C4 spreads (`[...set.ids]`) / passes arrays — matches the existing signature. `STARTER_FINAL_IDS`/`PSEUDO_IDS` are `Set<number>` in `priors.ts`, spread to arrays in C4.
- Resolver (`RibbonVisual`) unchanged in shape; only new branches added (C8). All new `{id,category}` pairs resolve to a defined `RibbonVisual` (no fallthrough for the new families).
- `tieredResult` reused for `collector-level100-*`, `collector-6iv-*`, `shiny-250/500`, `event-250/500` (ids follow `${prefix}-${tier}`); `collector-mega`/`collector-gmax` are pushed explicitly because their ids don't carry a numeric tier suffix.

**Determinism / ordering:** New blocks are inserted at fixed positions — regional (existing gen loop) → national% → types → type-master tiers → rarity class → collector → form-fanatic → form-sets → shiny (+extended) → shiny-rainbow → shiny-living-dex → event (+extended) → Fun. Existing index-based ordering tests key on `gen-*`/`type-*`/`formset-*`/`shiny-10`/`event-10`, all of which keep their relative order.

**Risks / open questions:**
1. **Stored `nature` / `ball` format.** `collector-natures` / `collector-balls` match `summary.naturesOwned` / `ballsOwned` (lowercased) against canonical names. USUM save import stores `nature` as a numeric index (`src/worker/import/pk7.ts`) and the manual editor stores free text, so real-world matches depend on a normalization step that does not yet exist. These two ribbons may under-count until nature/ball values are normalized to canonical names on import. Flagged for the controller — may warrant a small mapping in a follow-up.
2. **Type-tier count is data-dependent** (a type only gets a tier it can reach), so the exact catalog size varies with the seeded reference dataset (~40 with the full dex). Tests assert the *rule* with a synthetic ref rather than an absolute live count.
3. **Koraidon/Miraidon dual classification.** Placed in Legendaries, excluded from Paradox, to keep sets mutually exclusive (enforced by a test). If the controller prefers them in Paradox, move the two ids and adjust the two count assertions (Legendaries 69 / Paradox 22).
4. **Fossils include the Gen 8 Galar chimeras** (Dracozolt/Arctozolt/Dracovish/Arctovish), giving 25. If "fossil" should mean pre-Gen-8 only, drop those four → 21 and update the assertion.
5. **6IV cost.** The route fetches all non-null `ivs` strings for the user to compute `sixIvCount` in JS (D1 can't query inside JSON). Fine for hobby-scale collections; if a user has tens of thousands of specimens this is one extra full-column scan per ribbon fetch — acceptable for now, notable if collections grow.

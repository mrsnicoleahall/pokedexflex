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

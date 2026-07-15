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

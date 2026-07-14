import { describe, it, expect } from "vitest";
import { LEGENDARY_IDS, PSEUDO_IDS, STARTER_FINAL_IDS, priorRate } from "../../src/worker/rarity/priors";
import { RARITY_WEIGHT, RARITY_ORDER, computeRarity } from "../../src/worker/rarity/compute";

describe("priors", () => {
  it("assigns a low prior rate to legendaries", () => {
    const legendaryId = [...LEGENDARY_IDS][0];
    expect(priorRate(legendaryId)).toBe(0.02);
  });

  it("assigns a low prior rate to pseudo-legendaries", () => {
    expect(priorRate(149)).toBe(0.08); // Dragonite
  });

  it("assigns a mid prior rate to final-stage starters", () => {
    expect(priorRate(6)).toBe(0.3); // Charizard
  });

  it("assigns a high prior rate to a plain species", () => {
    expect(priorRate(10)).toBe(0.75); // Caterpie: not legendary, pseudo, or starter
  });

  it("has the expected pseudo-legendary ids", () => {
    expect(PSEUDO_IDS).toEqual(new Set([149, 248, 373, 376, 445, 635, 706, 784, 887, 998]));
  });

  it("does not overlap PSEUDO_IDS / STARTER_FINAL_IDS with LEGENDARY_IDS", () => {
    for (const id of PSEUDO_IDS) expect(LEGENDARY_IDS.has(id)).toBe(false);
    for (const id of STARTER_FINAL_IDS) expect(LEGENDARY_IDS.has(id)).toBe(false);
  });
});

describe("computeRarity", () => {
  it("with no ownership data, falls back to prior: legendary id -> legendary/epic", () => {
    const legendaryId = [...LEGENDARY_IDS][0];
    const result = computeRarity({
      speciesIds: [legendaryId],
      ownershipCounts: new Map(),
      totalUsers: 0,
    });
    expect(["legendary", "epic"]).toContain(result.get(legendaryId));
  });

  it("with no ownership data, a plain species falls back to prior: common", () => {
    const result = computeRarity({
      speciesIds: [10],
      ownershipCounts: new Map(),
      totalUsers: 0,
    });
    expect(result.get(10)).toBe("common");
  });

  it("scarcity dominates: a plain species owned by only 2 of 100 users becomes rarer than its prior (common)", () => {
    // rate=2/100=0.02, w=100/125=0.8, blended=0.8*0.02+0.2*0.75=0.166 -> "rare"
    // (below the 0.15 epic cutoff it would be "epic"; either way, well above
    // the "common"/"uncommon" tiers the prior alone would give this id).
    const result = computeRarity({
      speciesIds: [10],
      ownershipCounts: new Map([[10, 2]]),
      totalUsers: 100,
    });
    expect(["legendary", "epic", "rare"]).toContain(result.get(10));
  });

  it("a species owned by every user becomes common", () => {
    const result = computeRarity({
      speciesIds: [10],
      ownershipCounts: new Map([[10, 100]]),
      totalUsers: 100,
    });
    expect(result.get(10)).toBe("common");
  });

  it("exposes RARITY_WEIGHT and RARITY_ORDER", () => {
    expect(RARITY_WEIGHT.legendary).toBe(100);
    expect(RARITY_ORDER.length).toBe(5);
    expect(RARITY_ORDER).toEqual(["common", "uncommon", "rare", "epic", "legendary"]);
  });
});

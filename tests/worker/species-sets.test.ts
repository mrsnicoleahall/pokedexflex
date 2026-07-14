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

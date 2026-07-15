import { describe, expect, it } from "vitest";
import { buildOwnedBreakdown, buildReferenceTotals } from "../../src/worker/ribbons/breakdown";
import type { ReferenceData } from "../../src/worker/ribbons/catalog";

// Pure fixture — no DB. Four reference species across two gens and several types.
const ref: ReferenceData = {
  species: [
    { id: 1, generation: 1, types: ["fire"] },
    { id: 2, generation: 1, types: ["water", "flying"] },
    { id: 3, generation: 2, types: ["grass"] },
    { id: 4, generation: 2, types: ["fire", "flying"] },
  ],
  forms: [],
  speciesNames: new Map(),
};

describe("buildOwnedBreakdown", () => {
  it("counts owned distinct species per lowercase type and per generation (sparse)", () => {
    const { byType, byGen } = buildOwnedBreakdown([1, 2], ref);
    expect(byType).toEqual({ fire: 1, water: 1, flying: 1 });
    expect(byGen).toEqual({ "1": 2 });
  });

  it("ignores owned ids missing from the reference", () => {
    const { byType, byGen } = buildOwnedBreakdown([1, 999], ref);
    expect(byType).toEqual({ fire: 1 });
    expect(byGen).toEqual({ "1": 1 });
  });

  it("accepts a Set (Iterable) of owned ids", () => {
    const { byGen } = buildOwnedBreakdown(new Set([3, 4]), ref);
    expect(byGen).toEqual({ "2": 2 });
  });
});

describe("buildReferenceTotals", () => {
  it("counts every reference species per type and per generation", () => {
    const { totalByType, totalByGen } = buildReferenceTotals(ref);
    expect(totalByType).toEqual({ fire: 2, water: 1, flying: 2, grass: 1 });
    expect(totalByGen).toEqual({ "1": 2, "2": 2 });
  });
});

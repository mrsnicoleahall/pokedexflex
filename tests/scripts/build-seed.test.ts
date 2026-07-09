import { describe, it, expect } from "vitest";
import { classifyForm } from "../../scripts/fetch-pokeapi";
import { snapshotToSql } from "../../scripts/build-seed";

describe("classifyForm", () => {
  it("classifies known form-name patterns", () => {
    expect(classifyForm("charizard-mega-x")).toBe("mega");
    expect(classifyForm("charizard-gmax")).toBe("gigantamax");
    expect(classifyForm("raichu-alola")).toBe("regional");
    expect(classifyForm("darmanitan-galar")).toBe("regional");
    expect(classifyForm("deoxys-attack")).toBe("alternate");
  });

  it("classifies gender forms via the anchored -male/-female suffix", () => {
    expect(classifyForm("meowstic-female")).toBe("gender");
  });
});

describe("snapshotToSql", () => {
  it("emits INSERT OR REPLACE for species and forms", () => {
    const sql = snapshotToSql({
      species: [{ id: 6, name: "charizard", generation: 1, types: ["fire","flying"], spriteUrl: null }],
      forms: [{ speciesId: 6, name: "charizard-mega-x", formType: "mega", spriteUrl: null }],
    });
    expect(sql).toContain("INSERT OR REPLACE INTO species");
    expect(sql).toContain("charizard");
    expect(sql).toContain("INSERT OR REPLACE INTO forms");
    expect(sql).toContain("mega");
  });
});

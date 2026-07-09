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

  it("escapes single quotes in text values (SQL-safe)", () => {
    const sql = snapshotToSql({
      species: [],
      forms: [{ speciesId: 83, name: "farfetch'd-test", formType: "other", spriteUrl: null }],
    });
    // A literal apostrophe must be doubled so the statement stays valid SQL.
    expect(sql).toContain("farfetch''d-test");
    expect(sql).not.toContain("farfetch'd-test'"); // unescaped form must not appear
  });

  it("emits null sprite URLs as a bare NULL literal, not the string 'null'", () => {
    const sql = snapshotToSql({
      species: [{ id: 1, name: "bulbasaur", generation: 1, types: ["grass"], spriteUrl: null }],
      forms: [],
    });
    expect(sql).toMatch(/,NULL\);/);      // trailing NULL column emitted as a literal
    expect(sql).not.toContain("'null'");  // never the quoted string
  });
});

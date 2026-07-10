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
      species: [{ id: 6, name: "charizard", generation: 1, types: ["fire","flying"], spriteUrl: null, homeId: 6 }],
      forms: [{ speciesId: 6, name: "charizard-mega-x", formType: "mega", spriteUrl: null, homeId: 10034 }],
    });
    expect(sql).toContain("INSERT OR REPLACE INTO species");
    expect(sql).toContain("charizard");
    expect(sql).toContain("INSERT OR REPLACE INTO forms");
    expect(sql).toContain("mega");
  });

  it("escapes single quotes in text values (SQL-safe)", () => {
    const sql = snapshotToSql({
      species: [],
      forms: [{ speciesId: 83, name: "farfetch'd-test", formType: "other", spriteUrl: null, homeId: 83 }],
    });
    // A literal apostrophe must be doubled so the statement stays valid SQL.
    expect(sql).toContain("farfetch''d-test");
    expect(sql).not.toContain("farfetch'd-test'"); // unescaped form must not appear
  });

  it("emits null sprite URLs as a bare NULL literal, not the string 'null'", () => {
    const sql = snapshotToSql({
      species: [{ id: 1, name: "bulbasaur", generation: 1, types: ["grass"], spriteUrl: null, homeId: null }],
      forms: [],
    });
    expect(sql).toMatch(/,NULL,NULL\);/); // sprite_url AND trailing home_id both bare NULL literals
    expect(sql).not.toContain("'null'");  // never the quoted string
  });

  it("emits home_id column for species and forms, with a bare NULL when homeId is null", () => {
    const sql = snapshotToSql({
      species: [{ id: 6, name: "charizard", generation: 1, types: ["fire","flying"], spriteUrl: null, homeId: 6 }],
      forms: [{ speciesId: 6, name: "charizard-mega-x", formType: "mega", spriteUrl: null, homeId: null }],
    });
    expect(sql).toContain("INSERT OR REPLACE INTO species (id,name,generation,types,sprite_url,home_id)");
    expect(sql).toContain("INSERT OR REPLACE INTO forms (species_id,name,form_type,sprite_url,home_id)");
    expect(sql).toMatch(/\(6,'charizard',1,'\["fire","flying"\]',NULL,6\);/);
    // The form's null homeId must be a bare NULL literal, never the string 'null'.
    expect(sql).toMatch(/,NULL,NULL\);/);
    expect(sql).not.toContain("'null'");
  });
});

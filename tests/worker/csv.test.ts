import { describe, it, expect } from "vitest";
import { parseCsv } from "../../src/worker/import/csv";
import { autoDetectMapping, rowToInput } from "../../src/worker/import/map";

describe("parseCsv", () => {
  it("parses simple comma-separated rows", () => {
    expect(parseCsv("a,b\nc,d\n")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("handles quoted fields with embedded commas and escaped quotes", () => {
    expect(parseCsv('a,b\n"x,y","he said ""hi"""\n')).toEqual([
      ["a", "b"],
      ["x,y", 'he said "hi"'],
    ]);
  });

  it("handles a newline embedded inside a quoted field", () => {
    expect(parseCsv('a,b\n"line1\nline2",c\n')).toEqual([
      ["a", "b"],
      ["line1\nline2", "c"],
    ]);
  });

  it("handles CRLF row separators", () => {
    expect(parseCsv("a,b\r\nc,d\r\n")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("ignores a trailing blank line but keeps interior blank rows out of scope", () => {
    expect(parseCsv("a,b\nc,d")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });
});

describe("autoDetectMapping", () => {
  it("maps common headers to specimen fields", () => {
    const mapping = autoDetectMapping(["Species", "Nickname", "Level", "Shiny", "HP IV"]);
    expect(mapping["Species"]).toBe("species");
    expect(mapping["Nickname"]).toBe("nickname");
    expect(mapping["Level"]).toBe("level");
    expect(mapping["Shiny"]).toBe("isShiny");
    expect(mapping["HP IV"]).toBe("ivs.hp");
  });

  it("is case-insensitive and space-insensitive", () => {
    const mapping = autoDetectMapping(["pokemon", "HELD ITEM", "otid", "AtkEv"]);
    expect(mapping["pokemon"]).toBe("species");
    expect(mapping["HELD ITEM"]).toBe("heldItem");
    expect(mapping["otid"]).toBe("otId");
    expect(mapping["AtkEv"]).toBe("evs.atk");
  });

  it("maps unrecognized headers to null", () => {
    const mapping = autoDetectMapping(["Species", "Some Random Column"]);
    expect(mapping["Some Random Column"]).toBeNull();
  });

  it("does NOT map a bare 'box' column (physical box number, not the app's box UUID)", () => {
    // Third-party catalogs put a 1/2/3 box number in `box`; mapping it to boxId
    // made every row fail the box-ownership check on commit. Only "boxId" maps.
    const mapping = autoDetectMapping(["species", "box", "boxId"]);
    expect(mapping["box"]).toBeNull();
    expect(mapping["boxId"]).toBe("boxId");
  });
});

describe("rowToInput", () => {
  const resolveSpecies = (nameOrDex: string): number | null => {
    const key = nameOrDex.trim().toLowerCase();
    if (key === "charizard") return 6;
    if (key === "6") return 6;
    return null;
  };

  it("builds a SpecimenInput for a known species", () => {
    const headers = ["Species", "Nickname", "Level", "Shiny", "HP IV"];
    const mapping = autoDetectMapping(headers);
    const row = ["Charizard", "Charla", "50", "yes", "31"];
    const { input, errors } = rowToInput(headers, row, mapping, resolveSpecies);
    expect(errors).toEqual([]);
    expect(input).not.toBeNull();
    expect(input?.speciesId).toBe(6);
    expect(input?.nickname).toBe("Charla");
    expect(input?.level).toBe(50);
    expect(input?.isShiny).toBe(1);
    expect(input?.ivs?.hp).toBe(31);
  });

  it("flags an unknown species and leaves input null", () => {
    const headers = ["Species", "Nickname"];
    const mapping = autoDetectMapping(headers);
    const row = ["NotAMon", "Whoops"];
    const { input, errors } = rowToInput(headers, row, mapping, resolveSpecies);
    expect(input).toBeNull();
    expect(errors.some((e) => e.includes("unknown species"))).toBe(true);
  });

  it("flags a non-numeric level as an error", () => {
    const headers = ["Species", "Level"];
    const mapping = autoDetectMapping(headers);
    const row = ["Charizard", "fifty"];
    const { input, errors } = rowToInput(headers, row, mapping, resolveSpecies);
    expect(errors.some((e) => e.toLowerCase().includes("level"))).toBe(true);
    expect(input).toBeNull();
  });

  it("splits moves on pipes too (common export delimiter)", () => {
    const headers = ["Species", "Moves"];
    const mapping: Record<string, string | null> = { Species: "species", Moves: "moves" };
    const row = ["Charizard", "assurance|super-fang|double-edge|endeavor"];
    const { input } = rowToInput(headers, row, mapping, resolveSpecies);
    expect(input?.moves).toEqual(["assurance", "super-fang", "double-edge", "endeavor"]);
  });

  it("splits moves and ribbons on commas or slashes", () => {
    const headers = ["Species", "Moves", "Ribbons"];
    const mapping: Record<string, string | null> = { Species: "species", Moves: "moves", Ribbons: "ribbons" };
    const row = ["Charizard", "Flamethrower/Dragon Claw,Roost", "Champion,Effort"];
    const { input, errors } = rowToInput(headers, row, mapping, resolveSpecies);
    expect(errors).toEqual([]);
    expect(input?.moves).toEqual(["Flamethrower", "Dragon Claw", "Roost"]);
    expect(input?.ribbons).toEqual(["Champion", "Effort"]);
  });
});

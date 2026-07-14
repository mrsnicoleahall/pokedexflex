import { describe, expect, it } from "vitest";
import { getContrastText, typeColor, TYPE_COLORS } from "../../src/react-app/theme";

describe("type palette (documented duiker101 colors)", () => {
  it("has all 18 canonical types", () => {
    expect(Object.keys(TYPE_COLORS).sort()).toEqual(
      [
        "bug", "dark", "dragon", "electric", "fairy", "fighting", "fire",
        "flying", "ghost", "grass", "ground", "ice", "normal", "poison",
        "psychic", "rock", "steel", "water",
      ].sort(),
    );
  });

  it("uses the documented hexes", () => {
    expect(typeColor("dragon")).toBe("#0C69C8"); // was purple, now blue
    expect(typeColor("fire")).toBe("#FBA54C");
    expect(typeColor("water")).toBe("#539DDF");
    expect(typeColor("electric")).toBe("#F2D94E");
    expect(typeColor("dark")).toBe("#595761");
  });

  it("picks dark contrast text for pale types, light for deep types", () => {
    expect(getContrastText(typeColor("electric"))).toBe("#14171F"); // pale yellow → dark glyph
    expect(getContrastText(typeColor("ice"))).toBe("#14171F");
    expect(getContrastText(typeColor("dragon"))).toBe("#FFFFFF"); // deep blue → light glyph
    expect(getContrastText(typeColor("dark"))).toBe("#FFFFFF");
  });
});

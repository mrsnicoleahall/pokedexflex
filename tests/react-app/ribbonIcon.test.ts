import { describe, expect, it } from "vitest";
import { resolveRibbonIcon } from "../../src/react-app/ribbons/ribbonIconResolver";
import { typeColor } from "../../src/react-app/theme";

describe("resolveRibbonIcon", () => {
  it("marquee Grand ribbons use reserved pieces", () => {
    expect(resolveRibbonIcon({ id: "living-dex", category: "Grand" })).toEqual({ kind: "piece", piece: "trophy" });
    expect(resolveRibbonIcon({ id: "complete-dex-forms", category: "Grand" })).toEqual({ kind: "piece", piece: "diamond" });
  });
  it("type ribbons: rosette in the type color with the type glyph", () => {
    expect(resolveRibbonIcon({ id: "type-fire", category: "Type" })).toEqual({
      kind: "rosette", baseColor: typeColor("fire"), glyph: { kind: "type", type: "fire" },
    });
  });
  it("generation ribbons: ramp color + roman numeral", () => {
    const v = resolveRibbonIcon({ id: "gen-3", category: "Generation" });
    expect(v.kind).toBe("rosette");
    if (v.kind === "rosette") expect(v.glyph).toEqual({ kind: "text", text: "III" });
  });
  it("top shiny/event tiers use reserved pieces, lower tiers use rosettes", () => {
    expect(resolveRibbonIcon({ id: "shiny-100", category: "Shiny" })).toEqual({ kind: "piece", piece: "starribbon" });
    expect(resolveRibbonIcon({ id: "event-100", category: "Events" })).toEqual({ kind: "piece", piece: "gift" });
    expect(resolveRibbonIcon({ id: "shiny-10", category: "Shiny" }).kind).toBe("rosette");
  });
  it("form sets get a per-species hue so they stay distinct", () => {
    const a = resolveRibbonIcon({ id: "formset-25", category: "Form Sets" });
    const b = resolveRibbonIcon({ id: "formset-201", category: "Form Sets" });
    expect(a).not.toEqual(b);
    expect(a.kind).toBe("rosette");
  });
  it("unknown ids fall back to a normal-color rosette with a letter", () => {
    expect(resolveRibbonIcon({ id: "xyz", category: "Whatever" })).toEqual({
      kind: "rosette", baseColor: typeColor("normal"), glyph: { kind: "text", text: "X" },
    });
  });
  it("assigns the free pieces to the two new marquee ribbons", () => {
    expect(resolveRibbonIcon({ id: "national-dex-100", category: "Completion" })).toEqual({ kind: "piece", piece: "coin" });
    expect(resolveRibbonIcon({ id: "shiny-living-dex", category: "Shiny" })).toEqual({ kind: "piece", piece: "heart" });
  });
  it("regional ribbons keep the roman-numeral rosette (id-keyed on gen-N)", () => {
    const v = resolveRibbonIcon({ id: "gen-3", category: "Regional" });
    expect(v.kind).toBe("rosette");
    if (v.kind === "rosette") expect(v.glyph).toEqual({ kind: "text", text: "III" });
  });
  it("lower national-dex tiers use a rosette with a % text glyph", () => {
    const v = resolveRibbonIcon({ id: "national-dex-25", category: "Completion" });
    expect(v.kind).toBe("rosette");
    if (v.kind === "rosette") expect(v.glyph).toEqual({ kind: "text", text: "25%" });
  });
  it("rarity-class ribbons use a metallic rosette + diamond emoji glyph", () => {
    const v = resolveRibbonIcon({ id: "rarity-legendaries", category: "Rarity Class" });
    expect(v.kind).toBe("rosette");
    if (v.kind === "rosette") expect(v.glyph.kind).toBe("emoji");
  });
  it("collector ribbons resolve to a rosette (no crash on new ids)", () => {
    expect(resolveRibbonIcon({ id: "collector-natures", category: "Collector" }).kind).toBe("rosette");
    expect(resolveRibbonIcon({ id: "typemaster-bug-25", category: "Type" }).kind).toBe("rosette");
  });
});

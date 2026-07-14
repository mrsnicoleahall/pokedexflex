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
});

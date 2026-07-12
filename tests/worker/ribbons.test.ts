import { describe, it, expect } from "vitest";
import { computeRibbons, type CollectionSummary, type ReferenceData } from "../../src/worker/ribbons/catalog";

// Small fixture: species across 2 generations / types, one species with 4
// forms (a form-set), and a couple of mega forms.
const ref: ReferenceData = {
  species: [
    { id: 1, generation: 1, types: ["grass"] },
    { id: 2, generation: 1, types: ["fire"] },
    { id: 3, generation: 2, types: ["grass"] },
  ],
  forms: [
    { id: 101, speciesId: 1, formType: "alternate" },
    { id: 102, speciesId: 1, formType: "alternate" },
    { id: 103, speciesId: 1, formType: "alternate" },
    { id: 104, speciesId: 1, formType: "alternate" },
    { id: 201, speciesId: 2, formType: "mega" },
    { id: 202, speciesId: 3, formType: "mega" },
  ],
  speciesNames: new Map([
    [1, "Bulbasaur"],
    [2, "Charizard"],
    [3, "Chikorita"],
  ]),
};

const emptySummary: CollectionSummary = {
  speciesIds: new Set(),
  formIds: new Set(),
  shinyCount: 0,
  eventCount: 0,
};

const byId = (results: ReturnType<typeof computeRibbons>, id: string) => {
  const r = results.find((r) => r.id === id);
  if (!r) throw new Error(`no ribbon with id ${id}`);
  return r;
};

describe("computeRibbons", () => {
  it("returns every ribbon unearned with zero progress for an empty summary", () => {
    const results = computeRibbons(emptySummary, ref);
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(r.earned).toBe(false);
      expect(r.progress.current).toBe(0);
    }
  });

  it("is deterministic and stably ordered across calls", () => {
    const a = computeRibbons(emptySummary, ref);
    const b = computeRibbons(emptySummary, ref);
    expect(a.map((r) => r.id)).toEqual(b.map((r) => r.id));
    // living-dex and complete-dex-forms lead, followed by gens, types,
    // form-fanatic, form-sets, shiny, event.
    expect(a[0].id).toBe("living-dex");
    expect(a[1].id).toBe("complete-dex-forms");
    const gen1Index = a.findIndex((r) => r.id === "gen-1");
    const gen2Index = a.findIndex((r) => r.id === "gen-2");
    const typeIndex = a.findIndex((r) => r.id.startsWith("type-"));
    const formFanaticIndex = a.findIndex((r) => r.id.startsWith("form-fanatic-"));
    const formSetIndex = a.findIndex((r) => r.id.startsWith("formset-"));
    const shinyIndex = a.findIndex((r) => r.id === "shiny-10");
    const eventIndex = a.findIndex((r) => r.id === "event-10");
    expect(gen1Index).toBeLessThan(gen2Index);
    expect(gen2Index).toBeLessThan(typeIndex);
    expect(typeIndex).toBeLessThan(formFanaticIndex);
    expect(formFanaticIndex).toBeLessThan(formSetIndex);
    expect(formSetIndex).toBeLessThan(shinyIndex);
    expect(shinyIndex).toBeLessThan(eventIndex);
  });

  it("marks gen-1 earned once all Generation 1 species are owned, but not gen-2", () => {
    const summary: CollectionSummary = { ...emptySummary, speciesIds: new Set([1, 2]) };
    const results = computeRibbons(summary, ref);
    const gen1 = byId(results, "gen-1");
    expect(gen1.earned).toBe(true);
    expect(gen1.progress).toEqual({ current: 2, total: 2 });
    const gen2 = byId(results, "gen-2");
    expect(gen2.earned).toBe(false);
    expect(gen2.progress).toEqual({ current: 0, total: 1 });
  });

  it("marks the 4-form species' form-set ribbon earned when all its forms are owned", () => {
    const summary: CollectionSummary = { ...emptySummary, formIds: new Set([101, 102, 103, 104]) };
    const results = computeRibbons(summary, ref);
    const formset = byId(results, "formset-1");
    expect(formset.name).toBe("Complete Bulbasaur Forms");
    expect(formset.earned).toBe(true);
    expect(formset.progress).toEqual({ current: 4, total: 4 });
  });

  it("leaves the form-set ribbon unearned with correct partial progress", () => {
    const summary: CollectionSummary = { ...emptySummary, formIds: new Set([101, 102]) };
    const results = computeRibbons(summary, ref);
    const formset = byId(results, "formset-1");
    expect(formset.earned).toBe(false);
    expect(formset.progress).toEqual({ current: 2, total: 4 });
  });

  it("does not create a form-set ribbon for species with fewer than 4 forms", () => {
    const results = computeRibbons(emptySummary, ref);
    expect(results.some((r) => r.id === "formset-2")).toBe(false);
    expect(results.some((r) => r.id === "formset-3")).toBe(false);
  });

  it("earns Shiny Hunter (10) but not (50) at shinyCount 10", () => {
    const summary: CollectionSummary = { ...emptySummary, shinyCount: 10 };
    const results = computeRibbons(summary, ref);
    const shiny10 = byId(results, "shiny-10");
    expect(shiny10.earned).toBe(true);
    expect(shiny10.progress).toEqual({ current: 10, total: 10 });
    const shiny50 = byId(results, "shiny-50");
    expect(shiny50.earned).toBe(false);
    expect(shiny50.progress).toEqual({ current: 10, total: 50 });
  });

  it("earns Event Collector tiers by threshold and caps current at the tier", () => {
    const summary: CollectionSummary = { ...emptySummary, eventCount: 75 };
    const results = computeRibbons(summary, ref);
    expect(byId(results, "event-10").earned).toBe(true);
    expect(byId(results, "event-50").earned).toBe(true);
    const event100 = byId(results, "event-100");
    expect(event100.earned).toBe(false);
    expect(event100.progress).toEqual({ current: 75, total: 100 });
  });

  it("marks a type ribbon earned once every species of that type is owned", () => {
    const summary: CollectionSummary = { ...emptySummary, speciesIds: new Set([1, 3]) };
    const results = computeRibbons(summary, ref);
    const grass = byId(results, "type-grass");
    expect(grass.earned).toBe(true);
    expect(grass.progress).toEqual({ current: 2, total: 2 });
    const fire = byId(results, "type-fire");
    expect(fire.earned).toBe(false);
    expect(fire.progress).toEqual({ current: 0, total: 1 });
  });

  it("marks form-fanatic-mega earned once every mega form is owned", () => {
    const summary: CollectionSummary = { ...emptySummary, formIds: new Set([201, 202]) };
    const results = computeRibbons(summary, ref);
    const mega = byId(results, "form-fanatic-mega");
    expect(mega.earned).toBe(true);
    expect(mega.progress).toEqual({ current: 2, total: 2 });
    // No regional/gigantamax forms in this fixture: zero-total, never earned.
    const regional = byId(results, "form-fanatic-regional");
    expect(regional.earned).toBe(false);
    expect(regional.progress).toEqual({ current: 0, total: 0 });
  });

  it("earns living-dex and complete-dex-forms only once everything is owned", () => {
    const partial = computeRibbons(
      { ...emptySummary, speciesIds: new Set([1, 2, 3]) },
      ref,
    );
    expect(byId(partial, "living-dex").earned).toBe(true);
    expect(byId(partial, "complete-dex-forms").earned).toBe(false);

    const complete = computeRibbons(
      {
        ...emptySummary,
        speciesIds: new Set([1, 2, 3]),
        formIds: new Set([101, 102, 103, 104, 201, 202]),
      },
      ref,
    );
    const grand = byId(complete, "complete-dex-forms");
    expect(grand.earned).toBe(true);
    expect(grand.progress).toEqual({ current: 9, total: 9 });
  });

  it("handles an empty ReferenceData without dividing by zero", () => {
    const results = computeRibbons(emptySummary, { species: [], forms: [], speciesNames: new Map() });
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(r.earned).toBe(false);
      expect(Number.isFinite(r.progress.current)).toBe(true);
      expect(Number.isFinite(r.progress.total)).toBe(true);
    }
    expect(byId(results, "living-dex").progress).toEqual({ current: 0, total: 0 });
  });
});

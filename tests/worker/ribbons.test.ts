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
  specimenCount: 0,
  boxCount: 0,
  naturesOwned: new Set(),
  ballsOwned: new Set(),
  level100Count: 0,
  sixIvCount: 0,
  megaFormCount: 0,
  gmaxFormCount: 0,
  shinySpeciesIds: new Set(),
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

  describe("Fun ribbons", () => {
    it("earns the secret Magikarp ribbon once Magikarp (129) is owned, and hides it via the secret flag otherwise", () => {
      const unowned = byId(computeRibbons(emptySummary, ref), "fun-magikarp");
      expect(unowned.earned).toBe(false);
      expect(unowned.secret).toBe(true);
      expect(unowned.category).toBe("Fun");

      const owned = byId(
        computeRibbons({ ...emptySummary, speciesIds: new Set([129]) }, ref),
        "fun-magikarp",
      );
      expect(owned.earned).toBe(true);
      expect(owned.progress).toEqual({ current: 1, total: 1 });
    });

    it("does not mark non-secret Fun ribbons (e.g. fun-pikachu) as secret", () => {
      const pikachu = byId(computeRibbons(emptySummary, ref), "fun-pikachu");
      expect(pikachu.secret).toBeFalsy();
      const owned = byId(computeRibbons({ ...emptySummary, speciesIds: new Set([25]) }, ref), "fun-pikachu");
      expect(owned.earned).toBe(true);
    });

    it("tracks Eeveelutionary progress across Eevee + its 8 evolutions, earning only when all 9 are owned", () => {
      const partial = byId(
        computeRibbons({ ...emptySummary, speciesIds: new Set([133, 134, 135]) }, ref),
        "fun-eeveelution",
      );
      expect(partial.earned).toBe(false);
      expect(partial.progress).toEqual({ current: 3, total: 9 });

      const complete = byId(
        computeRibbons(
          { ...emptySummary, speciesIds: new Set([133, 134, 135, 136, 196, 197, 470, 471, 700]) },
          ref,
        ),
        "fun-eeveelution",
      );
      expect(complete.earned).toBe(true);
      expect(complete.progress).toEqual({ current: 9, total: 9 });
    });

    it("earns fun-first-shiny once shinyCount reaches 1, and is not secret", () => {
      const none = byId(computeRibbons(emptySummary, ref), "fun-first-shiny");
      expect(none.earned).toBe(false);
      expect(none.secret).toBeFalsy();
      const one = byId(computeRibbons({ ...emptySummary, shinyCount: 1 }, ref), "fun-first-shiny");
      expect(one.earned).toBe(true);
    });

    it("earns the secret fun-nice ribbon only at exactly 69 specimens, not 68 or 70", () => {
      const at68 = byId(computeRibbons({ ...emptySummary, specimenCount: 68 }, ref), "fun-nice");
      expect(at68.earned).toBe(false);
      expect(at68.progress).toEqual({ current: 68, total: 69 });

      const at69 = byId(computeRibbons({ ...emptySummary, specimenCount: 69 }, ref), "fun-nice");
      expect(at69.earned).toBe(true);
      expect(at69.secret).toBe(true);
      expect(at69.progress).toEqual({ current: 69, total: 69 });

      const at70 = byId(computeRibbons({ ...emptySummary, specimenCount: 70 }, ref), "fun-nice");
      expect(at70.earned).toBe(false);
    });

    it("earns the secret fun-blaze ribbon at 420+ specimens", () => {
      const under = byId(computeRibbons({ ...emptySummary, specimenCount: 419 }, ref), "fun-blaze");
      expect(under.earned).toBe(false);
      const over = byId(computeRibbons({ ...emptySummary, specimenCount: 420 }, ref), "fun-blaze");
      expect(over.earned).toBe(true);
      expect(over.secret).toBe(true);
    });

    it("earns the non-secret welcome ribbon (fun-first-catch) once specimenCount >= 1", () => {
      const none = byId(computeRibbons(emptySummary, ref), "fun-first-catch");
      expect(none.earned).toBe(false);
      expect(none.secret).toBeFalsy();
      const one = byId(computeRibbons({ ...emptySummary, specimenCount: 1 }, ref), "fun-first-catch");
      expect(one.earned).toBe(true);
    });

    it("earns the secret fun-box-hoarder ribbon once boxCount reaches 10", () => {
      const under = byId(computeRibbons({ ...emptySummary, boxCount: 9 }, ref), "fun-box-hoarder");
      expect(under.earned).toBe(false);
      expect(under.progress).toEqual({ current: 9, total: 10 });
      const over = byId(computeRibbons({ ...emptySummary, boxCount: 10 }, ref), "fun-box-hoarder");
      expect(over.earned).toBe(true);
      expect(over.secret).toBe(true);
    });

    it("counts owned bug-type species for fun-bug-collector, capping progress at the total", () => {
      const bugRef: ReferenceData = {
        species: Array.from({ length: 25 }, (_, i) => ({ id: 900 + i, generation: 1, types: ["bug"] })),
        forms: [],
        speciesNames: new Map(),
      };
      const ownedTen = new Set(Array.from({ length: 10 }, (_, i) => 900 + i));
      const partial = byId(computeRibbons({ ...emptySummary, speciesIds: ownedTen }, bugRef), "fun-bug-collector");
      expect(partial.earned).toBe(false);
      expect(partial.progress).toEqual({ current: 10, total: 20 });
      expect(partial.secret).toBeFalsy();

      const ownedAll = new Set(Array.from({ length: 25 }, (_, i) => 900 + i));
      const complete = byId(computeRibbons({ ...emptySummary, speciesIds: ownedAll }, bugRef), "fun-bug-collector");
      expect(complete.earned).toBe(true);
      // 25 owned bug species but progress caps display at the 20 total.
      expect(complete.progress).toEqual({ current: 20, total: 20 });
    });
  });

  it("re-themes gen ribbons as Regional dexes (id + earn logic unchanged)", () => {
    const summary: CollectionSummary = { ...emptySummary, speciesIds: new Set([1, 2]) };
    const gen1 = byId(computeRibbons(summary, ref), "gen-1");
    expect(gen1.category).toBe("Regional");
    expect(gen1.name).toBe("Kanto Regional Dex");
    expect(gen1.earned).toBe(true); // still: own all gen-1 species
  });

  it("adds National Dex % completion tiers (Completion category) earned by ratio", () => {
    // ref has 3 species total; owning 2 of 3 = 66% -> clears 25 and 50, not 75/100.
    const summary: CollectionSummary = { ...emptySummary, speciesIds: new Set([1, 2]) };
    const results = computeRibbons(summary, ref);
    const t25 = byId(results, "national-dex-25");
    expect(t25.category).toBe("Completion");
    expect(t25.earned).toBe(true);
    expect(byId(results, "national-dex-50").earned).toBe(true);
    expect(byId(results, "national-dex-75").earned).toBe(false);
    expect(byId(results, "national-dex-100").earned).toBe(false);
  });

  it("adds eight Rarity Class ribbons, each earned only when the whole set is owned", () => {
    const results = computeRibbons(emptySummary, ref);
    const ids = results.filter((r) => r.category === "Rarity Class").map((r) => r.id);
    expect(ids).toEqual([
      "rarity-starters", "rarity-legendaries", "rarity-mythicals", "rarity-pseudo",
      "rarity-fossils", "rarity-babies", "rarity-ultra-beasts", "rarity-paradox",
    ]);
    // total reflects the curated set size regardless of ref contents.
    const ub = results.find((r) => r.id === "rarity-ultra-beasts")!;
    expect(ub.progress.total).toBe(11);
    expect(ub.earned).toBe(false);
  });

  it("earns rarity-babies once every baby species id is owned", () => {
    const babyIds = [172, 173, 174, 175, 236, 238, 239, 240, 298, 360, 406, 433, 438, 439, 440, 446, 447, 458, 848];
    const results = computeRibbons({ ...emptySummary, speciesIds: new Set(babyIds) }, ref);
    const babies = results.find((r) => r.id === "rarity-babies")!;
    expect(babies.earned).toBe(true);
    expect(babies.progress).toEqual({ current: 19, total: 19 });
  });

  describe("Collector ribbons", () => {
    it("earns collector-natures only when all 25 natures are owned", () => {
      const all = new Set([
        "hardy","lonely","brave","adamant","naughty","bold","docile","relaxed","impish","lax",
        "timid","hasty","serious","jolly","naive","modest","mild","quiet","bashful","rash",
        "calm","gentle","sassy","careful","quirky",
      ]);
      const done = byId(computeRibbons({ ...emptySummary, naturesOwned: all }, ref), "collector-natures");
      expect(done.category).toBe("Collector");
      expect(done.earned).toBe(true);
      expect(done.progress).toEqual({ current: 25, total: 25 });

      const partial = byId(computeRibbons({ ...emptySummary, naturesOwned: new Set(["adamant", "bogus"]) }, ref), "collector-natures");
      expect(partial.earned).toBe(false);
      expect(partial.progress).toEqual({ current: 1, total: 25 }); // "bogus" isn't canonical
    });

    it("earns collector-balls only when all 27 canonical balls are owned", () => {
      const partial = byId(computeRibbons({ ...emptySummary, ballsOwned: new Set(["ultra ball", "great ball"]) }, ref), "collector-balls");
      expect(partial.progress).toEqual({ current: 2, total: 27 });
      expect(partial.earned).toBe(false);
    });

    it("earns level-100 and 6IV tiers by count", () => {
      const r = computeRibbons({ ...emptySummary, level100Count: 12, sixIvCount: 1 }, ref);
      expect(byId(r, "collector-level100-1").earned).toBe(true);
      expect(byId(r, "collector-level100-10").earned).toBe(true);
      expect(byId(r, "collector-level100-50").earned).toBe(false);
      expect(byId(r, "collector-6iv-1").earned).toBe(true);
      expect(byId(r, "collector-6iv-10").earned).toBe(false);
    });

    it("earns mega / gmax breadth milestones by owned-form count", () => {
      const r = computeRibbons({ ...emptySummary, megaFormCount: 20, gmaxFormCount: 3 }, ref);
      expect(byId(r, "collector-mega").earned).toBe(true);
      expect(byId(r, "collector-gmax").earned).toBe(false);
      expect(byId(r, "collector-gmax").progress).toEqual({ current: 3, total: 10 });
    });
  });

  describe("Type deepening + shiny", () => {
    const bigRef: ReferenceData = {
      species: [
        ...Array.from({ length: 30 }, (_, i) => ({ id: 1000 + i, generation: 1, types: ["bug"] })),
        { id: 2000, generation: 1, types: ["ice"] }, // ice has only 1 species -> no ice tiers
      ],
      forms: [],
      speciesNames: new Map(),
    };

    it("generates type tiers only up to what a type can support", () => {
      const ids = computeRibbons(emptySummary, bigRef).map((r) => r.id);
      expect(ids).toContain("typemaster-bug-10");    // 30 bug species -> 10 & 25 exist
      expect(ids).toContain("typemaster-bug-25");
      expect(ids).not.toContain("typemaster-bug-50"); // only 30 < 50
      expect(ids).not.toContain("typemaster-ice-10"); // only 1 ice species
    });

    it("earns a type tier by distinct owned count of that type", () => {
      const owned = new Set(Array.from({ length: 12 }, (_, i) => 1000 + i));
      const t = byId(computeRibbons({ ...emptySummary, speciesIds: owned }, bigRef), "typemaster-bug-10");
      expect(t.category).toBe("Type");
      expect(t.earned).toBe(true);
      expect(t.progress).toEqual({ current: 10, total: 10 });
      expect(byId(computeRibbons({ ...emptySummary, speciesIds: owned }, bigRef), "typemaster-bug-25").earned).toBe(false);
    });

    it("earns shiny-living-dex only when a shiny of every species is owned", () => {
      const allShiny = new Set(ref.species.map((s) => s.id));
      const done = byId(computeRibbons({ ...emptySummary, shinySpeciesIds: allShiny }, ref), "shiny-living-dex");
      expect(done.category).toBe("Shiny");
      expect(done.earned).toBe(true);
    });

    it("earns shiny-rainbow when a shiny of every present type is owned", () => {
      // ref types present: grass, fire. Shiny species 1 (grass) + 2 (fire) covers both.
      const r = byId(computeRibbons({ ...emptySummary, shinySpeciesIds: new Set([1, 2]) }, ref), "shiny-rainbow");
      expect(r.earned).toBe(true);
      const partial = byId(computeRibbons({ ...emptySummary, shinySpeciesIds: new Set([1]) }, ref), "shiny-rainbow");
      expect(partial.earned).toBe(false);
    });

    it("adds extended shiny/event tiers at 250 and 500", () => {
      const r = computeRibbons({ ...emptySummary, shinyCount: 300, eventCount: 300 }, ref);
      expect(byId(r, "shiny-250").earned).toBe(true);
      expect(byId(r, "shiny-500").earned).toBe(false);
      expect(byId(r, "event-250").earned).toBe(true);
      expect(byId(r, "event-500").earned).toBe(false);
    });
  });
});

/**
 * Achievement-ribbon catalog + pure compute engine.
 *
 * `computeRibbons` builds the full ribbon catalog from reference data (species,
 * forms, species names) and evaluates it against a collection summary. It is a
 * pure function — no I/O, no DB, no fetch — so it's trivially unit-testable and
 * reusable from the route layer (see Task 2).
 */

export type CollectionSummary = {
  speciesIds: Set<number>;
  formIds: Set<number>;
  shinyCount: number;
  eventCount: number;
};

export type ReferenceData = {
  species: { id: number; generation: number; types: string[] }[];
  forms: { id: number; speciesId: number; formType: string }[];
  speciesNames: Map<number, string>;
};

export type RibbonResult = {
  id: string;
  name: string;
  description: string;
  category: string;
  earned: boolean;
  progress: { current: number; total: number };
};

const MIN_FORM_SET_SIZE = 4;
const TIERED_THRESHOLDS = [10, 50, 100] as const;

const FORM_FANATIC_TYPES = [
  { key: "mega", label: "Mega" },
  { key: "regional", label: "Regional" },
  { key: "gigantamax", label: "Gigantamax" },
] as const;

const capitalize = (s: string): string => (s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1));

/**
 * Evaluates an "own all of set S" ribbon: current = |ownedIds ∩ setIds|,
 * total = |setIds|, earned = current === total && total > 0 (never divides by
 * zero, never reports an empty set as earned).
 */
const progressFor = (
  ownedIds: Set<number>,
  setIds: number[],
): { current: number; total: number; earned: boolean } => {
  const total = setIds.length;
  if (total === 0) return { current: 0, total: 0, earned: false };
  let current = 0;
  for (const id of setIds) {
    if (ownedIds.has(id)) current++;
  }
  return { current, total, earned: current === total };
};

/** Evaluates a tiered counter ribbon (e.g. shiny/event) against a fixed threshold. */
const tieredResult = (
  idPrefix: string,
  name: string,
  descriptionFor: (tier: number) => string,
  category: string,
  count: number,
  tier: number,
): RibbonResult => ({
  id: `${idPrefix}-${tier}`,
  name,
  description: descriptionFor(tier),
  category,
  earned: count >= tier,
  progress: { current: Math.min(count, tier), total: tier },
});

/**
 * Builds and evaluates the full ribbon catalog for a collection.
 *
 * Order (stable, deterministic): living-dex, complete-dex-forms, gens (1..9,
 * ascending, only generations present in ref.species), types (alphabetical,
 * only types present in ref.species), form-fanatic (mega, regional,
 * gigantamax), form-sets (species with >=4 forms, sorted by speciesId),
 * shiny (10/50/100), event (10/50/100).
 */
export function computeRibbons(summary: CollectionSummary, ref: ReferenceData): RibbonResult[] {
  const results: RibbonResult[] = [];

  const allSpeciesIds = ref.species.map((s) => s.id);
  const allFormIds = ref.forms.map((f) => f.id);

  // living-dex: own every species.
  {
    const p = progressFor(summary.speciesIds, allSpeciesIds);
    results.push({
      id: "living-dex",
      name: "Living Dex Master",
      description: "Own at least one of every species in the Pokédex.",
      category: "Grand",
      earned: p.earned,
      progress: { current: p.current, total: p.total },
    });
  }

  // complete-dex-forms: own every species AND every form.
  {
    const speciesP = progressFor(summary.speciesIds, allSpeciesIds);
    const formsP = progressFor(summary.formIds, allFormIds);
    const total = allSpeciesIds.length + allFormIds.length;
    const current = speciesP.current + formsP.current;
    results.push({
      id: "complete-dex-forms",
      name: "Complete Dex + Forms",
      description: "Own every species and every known form.",
      category: "Grand",
      earned: total > 0 && current === total,
      progress: { current, total },
    });
  }

  // gen-{N}: own every species of a generation, for each generation present.
  const generations = Array.from(new Set(ref.species.map((s) => s.generation))).sort((a, b) => a - b);
  for (const gen of generations) {
    const ids = ref.species.filter((s) => s.generation === gen).map((s) => s.id);
    const p = progressFor(summary.speciesIds, ids);
    results.push({
      id: `gen-${gen}`,
      name: `Generation ${gen} Cleared`,
      description: `Own every species introduced in Generation ${gen}.`,
      category: "Generation",
      earned: p.earned,
      progress: { current: p.current, total: p.total },
    });
  }

  // type-{t}: own every species of a type, for each distinct type present.
  const types = Array.from(new Set(ref.species.flatMap((s) => s.types))).sort();
  for (const type of types) {
    const ids = ref.species.filter((s) => s.types.includes(type)).map((s) => s.id);
    const p = progressFor(summary.speciesIds, ids);
    results.push({
      id: `type-${type}`,
      name: `${capitalize(type)} Type Master`,
      description: `Own every ${type}-type species.`,
      category: "Type",
      earned: p.earned,
      progress: { current: p.current, total: p.total },
    });
  }

  // form-fanatic-{mega,regional,gigantamax}: own every form of a form type.
  for (const { key, label } of FORM_FANATIC_TYPES) {
    const ids = ref.forms.filter((f) => f.formType === key).map((f) => f.id);
    const p = progressFor(summary.formIds, ids);
    results.push({
      id: `form-fanatic-${key}`,
      name: `${label} Form Fanatic`,
      description: `Own every ${label} form.`,
      category: "Forms",
      earned: p.earned,
      progress: { current: p.current, total: p.total },
    });
  }

  // formset-{speciesId}: own every form of a species that has >= 4 forms
  // (auto-covers Vivillon, Furfrou, Unown, Alcremie, etc.).
  const formIdsBySpecies = new Map<number, number[]>();
  for (const f of ref.forms) {
    const arr = formIdsBySpecies.get(f.speciesId);
    if (arr) arr.push(f.id);
    else formIdsBySpecies.set(f.speciesId, [f.id]);
  }
  const formSetSpeciesIds = Array.from(formIdsBySpecies.entries())
    .filter(([, ids]) => ids.length >= MIN_FORM_SET_SIZE)
    .map(([speciesId]) => speciesId)
    .sort((a, b) => a - b);
  for (const speciesId of formSetSpeciesIds) {
    const ids = formIdsBySpecies.get(speciesId) ?? [];
    const p = progressFor(summary.formIds, ids);
    const speciesName = ref.speciesNames.get(speciesId) ?? `Species #${speciesId}`;
    results.push({
      id: `formset-${speciesId}`,
      name: `Complete ${speciesName} Forms`,
      description: `Own every form of ${speciesName}.`,
      category: "Form Sets",
      earned: p.earned,
      progress: { current: p.current, total: p.total },
    });
  }

  // shiny-{10,50,100}: Shiny Hunter tiers.
  for (const tier of TIERED_THRESHOLDS) {
    results.push(
      tieredResult(
        "shiny",
        "Shiny Hunter",
        (t) => `Catch ${t} shiny Pokémon.`,
        "Shiny",
        summary.shinyCount,
        tier,
      ),
    );
  }

  // event-{10,50,100}: Event Collector tiers.
  for (const tier of TIERED_THRESHOLDS) {
    results.push(
      tieredResult(
        "event",
        "Event Collector",
        (t) => `Collect ${t} event Pokémon.`,
        "Events",
        summary.eventCount,
        tier,
      ),
    );
  }

  return results;
}

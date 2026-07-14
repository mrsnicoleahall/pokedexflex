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
  /** Total specimens the user owns (all boxes, all species). */
  specimenCount: number;
  /** Total boxes the user has created. */
  boxCount: number;
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
  /** Marks a ribbon as a hidden easter egg: the UI must not reveal its name/description until earned. Omitted/false for regular ribbons. */
  secret?: boolean;
};

/** Turn a PokéAPI slug ("mr-mime") into a display name ("Mr Mime"). */
function prettyName(slug: string): string {
  return slug
    .split("-")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

const MIN_FORM_SET_SIZE = 4;
const TIERED_THRESHOLDS = [10, 50, 100] as const;

const FORM_FANATIC_TYPES = [
  { key: "mega", label: "Mega" },
  { key: "regional", label: "Regional" },
  { key: "gigantamax", label: "Gigantamax" },
] as const;

/**
 * "Own this one specific species" Fun ribbons — mostly tongue-in-cheek
 * easter eggs (`secret: true`), a couple left visible as gentle nudges.
 * Order here is the order they appear in the catalog.
 */
const SPECIES_FUN_RIBBONS = [
  { id: "fun-pikachu", name: "I Choose You", description: "Own a Pikachu.", speciesId: 25, secret: false },
  { id: "fun-magikarp", name: "Splash Damage", description: "Own a Magikarp.", speciesId: 129, secret: true },
  { id: "fun-ditto", name: "Imposter Syndrome", description: "Own a Ditto.", speciesId: 132, secret: true },
  { id: "fun-farfetchd", name: "Fetch Quest", description: "Own a Farfetch'd.", speciesId: 83, secret: true },
  { id: "fun-snorlax", name: "Naptime", description: "Own a Snorlax.", speciesId: 143, secret: true },
  { id: "fun-wobbuffet", name: "Counterculture", description: "Own a Wobbuffet.", speciesId: 202, secret: true },
  { id: "fun-diglett", name: "Just a Head", description: "Own a Diglett.", speciesId: 50, secret: true },
  { id: "fun-garbodor", name: "One Man's Trash", description: "Own a Garbodor.", speciesId: 569, secret: true },
  { id: "fun-zubat", name: "Zubat Zone", description: "Own a Zubat.", speciesId: 41, secret: true },
  { id: "fun-slowpoke", name: "Slow and Steady", description: "Own a Slowpoke.", speciesId: 79, secret: true },
  { id: "fun-metapod", name: "Harden", description: "Own a Metapod.", speciesId: 11, secret: true },
] as const;

/** Eevee and its eight evolutions, for the "Eeveelutionary" Fun ribbon. */
const EEVEE_ID = 133;
const EEVEELUTION_IDS = [134, 135, 136, 196, 197, 470, 471, 700] as const;

/** How many distinct Bug-type species must be owned for the "Bug Out" Fun ribbon. */
const BUG_COLLECTOR_TOTAL = 20;

/** Specimen-count milestones for the "It's Dangerous to Go Alone" / "Blaze It" Fun ribbons. */
const FIRST_CATCH_TOTAL = 1;
const NICE_SPECIMEN_COUNT = 69;
const BLAZE_SPECIMEN_COUNT = 420;

/** Box-count milestone for the "Box Architect" Fun ribbon. */
const BOX_HOARDER_TOTAL = 10;

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
 * shiny (10/50/100), event (10/50/100), Fun (funny/easter-egg ribbons,
 * appended last; most are `secret: true` and should render hidden as "???"
 * in the UI until earned).
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
    const speciesName = prettyName(ref.speciesNames.get(speciesId) ?? `Species #${speciesId}`);
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

  // fun-{species}: own one specific (usually meme-worthy) species.
  for (const spec of SPECIES_FUN_RIBBONS) {
    const earned = summary.speciesIds.has(spec.speciesId);
    results.push({
      id: spec.id,
      name: spec.name,
      description: spec.description,
      category: "Fun",
      earned,
      progress: { current: earned ? 1 : 0, total: 1 },
      ...(spec.secret ? { secret: true } : {}),
    });
  }

  // fun-eeveelution: own Eevee and all eight of its evolutions.
  {
    const p = progressFor(summary.speciesIds, [EEVEE_ID, ...EEVEELUTION_IDS]);
    results.push({
      id: "fun-eeveelution",
      name: "Eeveelutionary",
      description: "Own Eevee and every one of its evolutions.",
      category: "Fun",
      earned: p.earned,
      progress: { current: p.current, total: p.total },
    });
  }

  // fun-first-shiny: catch a single shiny, ever.
  {
    const earned = summary.shinyCount >= FIRST_CATCH_TOTAL;
    results.push({
      id: "fun-first-shiny",
      name: "Shiny? In This Economy?",
      description: "Catch your first shiny Pokémon.",
      category: "Fun",
      earned,
      progress: { current: Math.min(summary.shinyCount, FIRST_CATCH_TOTAL), total: FIRST_CATCH_TOTAL },
    });
  }

  // fun-nice: own exactly 69 specimens (an exact-match milestone, not a threshold).
  {
    const earned = summary.specimenCount === NICE_SPECIMEN_COUNT;
    results.push({
      id: "fun-nice",
      name: "Nice.",
      description: `Own exactly ${NICE_SPECIMEN_COUNT} specimens. Nice.`,
      category: "Fun",
      earned,
      progress: { current: Math.min(summary.specimenCount, NICE_SPECIMEN_COUNT), total: NICE_SPECIMEN_COUNT },
      secret: true,
    });
  }

  // fun-blaze: own 420+ specimens.
  {
    const earned = summary.specimenCount >= BLAZE_SPECIMEN_COUNT;
    results.push({
      id: "fun-blaze",
      name: "Blaze It",
      description: `Own ${BLAZE_SPECIMEN_COUNT} specimens.`,
      category: "Fun",
      earned,
      progress: { current: Math.min(summary.specimenCount, BLAZE_SPECIMEN_COUNT), total: BLAZE_SPECIMEN_COUNT },
      secret: true,
    });
  }

  // fun-first-catch: the welcome ribbon, earned on your very first specimen.
  {
    const earned = summary.specimenCount >= FIRST_CATCH_TOTAL;
    results.push({
      id: "fun-first-catch",
      name: "It's Dangerous to Go Alone",
      description: "Add your first specimen to the collection.",
      category: "Fun",
      earned,
      progress: { current: Math.min(summary.specimenCount, FIRST_CATCH_TOTAL), total: FIRST_CATCH_TOTAL },
    });
  }

  // fun-box-hoarder: create 10+ boxes.
  {
    const earned = summary.boxCount >= BOX_HOARDER_TOTAL;
    results.push({
      id: "fun-box-hoarder",
      name: "Box Architect",
      description: `Create ${BOX_HOARDER_TOTAL} boxes.`,
      category: "Fun",
      earned,
      progress: { current: Math.min(summary.boxCount, BOX_HOARDER_TOTAL), total: BOX_HOARDER_TOTAL },
      secret: true,
    });
  }

  // fun-bug-collector: own 20+ distinct Bug-type species.
  {
    const bugSpeciesIds = ref.species.filter((s) => s.types.includes("bug")).map((s) => s.id);
    let current = 0;
    for (const id of bugSpeciesIds) {
      if (summary.speciesIds.has(id)) current++;
    }
    results.push({
      id: "fun-bug-collector",
      name: "Bug Out",
      description: `Own ${BUG_COLLECTOR_TOTAL} different Bug-type species.`,
      category: "Fun",
      earned: current >= BUG_COLLECTOR_TOTAL,
      progress: { current: Math.min(current, BUG_COLLECTOR_TOTAL), total: BUG_COLLECTOR_TOTAL },
    });
  }

  return results;
}

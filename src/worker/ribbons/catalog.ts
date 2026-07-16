/**
 * Achievement-ribbon catalog + pure compute engine.
 *
 * `computeRibbons` builds the full ribbon catalog from reference data (species,
 * forms, species names) and evaluates it against a collection summary. It is a
 * pure function — no I/O, no DB, no fetch — so it's trivially unit-testable and
 * reusable from the route layer (see Task 2).
 */

import {
  LEGENDARY_PROPER_IDS, MYTHICAL_IDS, FOSSIL_IDS, BABY_IDS, ULTRA_BEAST_IDS, PARADOX_IDS,
  NATURE_NAMES, BALL_TYPES,
} from "./species-sets";
import { STARTER_FINAL_IDS, PSEUDO_IDS } from "../rarity/priors";

export type CollectionSummary = {
  speciesIds: Set<number>;
  formIds: Set<number>;
  shinyCount: number;
  eventCount: number;
  /** Total specimens the user owns (all boxes, all species). */
  specimenCount: number;
  /** Total boxes the user has created. */
  boxCount: number;
  /** Distinct nature names owned, lowercased (e.g. "adamant"). */
  naturesOwned: Set<string>;
  /** Distinct Poké Ball names owned, lowercased (e.g. "ultra ball"). */
  ballsOwned: Set<string>;
  /** Specimens at level 100. */
  level100Count: number;
  /** Specimens with a flawless (all-31) IV spread. */
  sixIvCount: number;
  /** Distinct owned form ids whose formType is "mega". */
  megaFormCount: number;
  /** Distinct owned form ids whose formType is "gigantamax". */
  gmaxFormCount: number;
  /** Species ids for which the user owns at least one shiny. */
  shinySpeciesIds: Set<number>;
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

const SIX_IV_STATS = ["hp", "atk", "def", "spa", "spd", "spe"] as const;

/**
 * Pure test for a flawless (6×31) IV spread from the raw JSON `ivs` column.
 * Returns false for null / empty / malformed / partial input — never throws.
 */
export function isSixIv(ivsJson: string | null): boolean {
  if (!ivsJson) return false;
  let parsed: unknown;
  try {
    parsed = JSON.parse(ivsJson);
  } catch {
    return false;
  }
  if (typeof parsed !== "object" || parsed === null) return false;
  const obj = parsed as Record<string, unknown>;
  return SIX_IV_STATS.every((k) => obj[k] === 31);
}

const MIN_FORM_SET_SIZE = 4;
const TIERED_THRESHOLDS = [10, 50, 100] as const;
const TYPE_MASTER_TIERS = [10, 25, 50] as const;
const SHINY_EXTRA_TIERS = [250, 500] as const;
const EVENT_EXTRA_TIERS = [250, 500] as const;
const LEVEL100_TIERS = [1, 10, 50] as const;
const SIX_IV_TIERS = [1, 10, 50] as const;
const MEGA_MASTER_TOTAL = 20;
const GMAX_MASTER_TOTAL = 10;

/** Generation → region label, for Regional-dex ribbon flavor (dex still defined by the `generation` field). */
const REGION_NAMES: Record<number, string> = {
  1: "Kanto", 2: "Johto", 3: "Hoenn", 4: "Sinnoh", 5: "Unova",
  6: "Kalos", 7: "Alola", 8: "Galar", 9: "Paldea",
};

/** National Dex completion percentage tiers. */
const NATIONAL_DEX_TIERS = [25, 50, 75, 100] as const;

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
  { id: "fun-mimikyu", name: "Costume Party", description: "Own a Mimikyu.", speciesId: 778, secret: true },
  { id: "fun-sudowoodo", name: "Not a Tree", description: "Own a Sudowoodo.", speciesId: 185, secret: true },
  { id: "fun-luvdisc", name: "Lucky in Love", description: "Own a Luvdisc.", speciesId: 370, secret: true },
  { id: "fun-stunfisk", name: "Flat Out", description: "Own a Stunfisk.", speciesId: 618, secret: true },
  { id: "fun-feebas", name: "Diamond in the Rough", description: "Own a Feebas.", speciesId: 349, secret: true },
  { id: "fun-spinda", name: "Spot the Difference", description: "Own a Spinda.", speciesId: 327, secret: true },
  { id: "fun-shuckle", name: "Juice Box", description: "Own a Shuckle.", speciesId: 213, secret: true },
  { id: "fun-delibird", name: "Seasonal Worker", description: "Own a Delibird.", speciesId: 225, secret: true },
  { id: "fun-dunsparce", name: "Underrated", description: "Own a Dunsparce.", speciesId: 206, secret: true },
  { id: "fun-bidoof", name: "Positive Outlook", description: "Own a Bidoof.", speciesId: 399, secret: true },
] as const;

/**
 * Species that get a dedicated, themed form ribbon instead of the generic
 * auto-generated "Complete {Species} Forms" one (so they're not duplicated).
 */
const FURFROU_ID = 676;
const FLOETTE_ID = 670;
const DEDICATED_FORM_SPECIES = new Set<number>([FURFROU_ID, FLOETTE_ID]);

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
 * Order (stable, deterministic): living-dex, complete-dex-forms, regional
 * gens (1..9, ascending, only generations present in ref.species), national
 * dex % tiers (25/50/75/100), types (alphabetical, only types present in
 * ref.species) followed immediately by that type's typemaster-{10,25,50}
 * tiers (only tiers the type has enough species to support), rarity class
 * (starters, legendaries, mythicals, pseudo, fossils, babies, ultra beasts,
 * paradox — fixed order), collector (natures, balls, level100 tiers, 6IV
 * tiers, mega, gmax), form-fanatic (mega, regional, gigantamax), form-sets
 * (species with >=4 forms, sorted by speciesId), shiny (10/50/100), event
 * (10/50/100), extended shiny/event tiers (250/500), shiny-rainbow (shiny of
 * every present type), shiny-living-dex (shiny of every species), Fun
 * (funny/easter-egg ribbons, appended last; most are `secret: true` and
 * should render hidden as "???" in the UI until earned).
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

  // grand-mythicals: own every Mythical Pokémon — the end-game collector flex.
  {
    const p = progressFor(summary.speciesIds, [...MYTHICAL_IDS]);
    results.push({
      id: "grand-mythicals",
      name: "Mythical Master",
      description: "Own every Mythical Pokémon — the end-game legend's collection.",
      category: "Grand",
      earned: p.earned,
      progress: { current: p.current, total: p.total },
    });
  }

  // gen-{N}: own every species of a generation, for each generation present.
  const generations = Array.from(new Set(ref.species.map((s) => s.generation))).sort((a, b) => a - b);
  for (const gen of generations) {
    const ids = ref.species.filter((s) => s.generation === gen).map((s) => s.id);
    const p = progressFor(summary.speciesIds, ids);
    const region = REGION_NAMES[gen] ?? `Generation ${gen}`;
    results.push({
      id: `gen-${gen}`,
      name: `${region} Regional Dex`,
      description: `Own every species introduced in Generation ${gen} (the ${region} regional dex).`,
      category: "Regional",
      earned: p.earned,
      progress: { current: p.current, total: p.total },
    });
  }

  // national-dex-{25,50,75,100}: own at least N% of all species.
  {
    const totalSpecies = allSpeciesIds.length;
    const owned = allSpeciesIds.reduce((n, id) => (summary.speciesIds.has(id) ? n + 1 : n), 0);
    for (const tier of NATIONAL_DEX_TIERS) {
      const threshold = Math.ceil((totalSpecies * tier) / 100);
      results.push({
        id: `national-dex-${tier}`,
        name: `National Dex ${tier}%`,
        description: `Register ${tier}% of the National Pokédex.`,
        category: "Completion",
        earned: totalSpecies > 0 && owned >= threshold,
        progress: { current: Math.min(owned, threshold), total: threshold },
      });
    }
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

  // typemaster-{slug}-{tier}: own N distinct species of a type. Only emitted
  // when the type has at least `tier` species (never an impossible ribbon).
  for (const type of types) {
    const ids = ref.species.filter((s) => s.types.includes(type)).map((s) => s.id);
    const ownedCount = ids.reduce((n, id) => (summary.speciesIds.has(id) ? n + 1 : n), 0);
    for (const tier of TYPE_MASTER_TIERS) {
      if (ids.length < tier) continue;
      results.push({
        id: `typemaster-${type}-${tier}`,
        name: `${capitalize(type)} Specialist ${tier}`,
        description: `Own ${tier} different ${type}-type species.`,
        category: "Type",
        earned: ownedCount >= tier,
        progress: { current: Math.min(ownedCount, tier), total: tier },
      });
    }
  }

  // rarity-{class}: own every member of a curated rarity-class set.
  const RARITY_SETS: { id: string; name: string; label: string; ids: readonly number[] }[] = [
    { id: "rarity-starters", name: "Starter Squad", label: "final-stage starter", ids: [...STARTER_FINAL_IDS] },
    { id: "rarity-legendaries", name: "Legendary Keeper", label: "Legendary", ids: LEGENDARY_PROPER_IDS },
    { id: "rarity-mythicals", name: "Mythic Hoard", label: "Mythical", ids: MYTHICAL_IDS },
    { id: "rarity-pseudo", name: "Pseudo Powerhouse", label: "pseudo-legendary", ids: [...PSEUDO_IDS] },
    { id: "rarity-fossils", name: "Fossil Restorer", label: "Fossil", ids: FOSSIL_IDS },
    { id: "rarity-babies", name: "Baby Boom", label: "Baby", ids: BABY_IDS },
    { id: "rarity-ultra-beasts", name: "Beyond the Wormhole", label: "Ultra Beast", ids: ULTRA_BEAST_IDS },
    { id: "rarity-paradox", name: "Temporal Anomaly", label: "Paradox", ids: PARADOX_IDS },
  ];
  for (const set of RARITY_SETS) {
    const p = progressFor(summary.speciesIds, [...set.ids]);
    results.push({
      id: set.id,
      name: set.name,
      description: `Own every ${set.label} Pokémon.`,
      category: "Rarity Class",
      earned: p.earned,
      progress: { current: p.current, total: p.total },
    });
  }

  // collector-natures / collector-balls: own the whole canonical set (case-insensitive).
  {
    const naturesCurrent = NATURE_NAMES.reduce((n, name) => (summary.naturesOwned.has(name) ? n + 1 : n), 0);
    results.push({
      id: "collector-natures", name: "Nature Lover",
      description: "Own a Pokémon of all 25 natures.", category: "Collector",
      earned: naturesCurrent === NATURE_NAMES.length,
      progress: { current: naturesCurrent, total: NATURE_NAMES.length },
    });
    const ballsCurrent = BALL_TYPES.reduce((n, name) => (summary.ballsOwned.has(name) ? n + 1 : n), 0);
    results.push({
      id: "collector-balls", name: "Gotta Catch 'Em All",
      description: "Own a Pokémon caught in every kind of Poké Ball.", category: "Collector",
      earned: ballsCurrent === BALL_TYPES.length,
      progress: { current: ballsCurrent, total: BALL_TYPES.length },
    });
  }

  // collector-level100-{1,10,50}: level-100 milestones.
  for (const tier of LEVEL100_TIERS) {
    results.push(tieredResult(
      "collector-level100", "Level Cap",
      (t) => `Raise ${t} Pokémon to level 100.`, "Collector",
      summary.level100Count, tier,
    ));
  }

  // collector-6iv-{1,10,50}: flawless-IV milestones.
  for (const tier of SIX_IV_TIERS) {
    results.push(tieredResult(
      "collector-6iv", "Flawless",
      (t) => `Own ${t} Pokémon with perfect (6×31) IVs.`, "Collector",
      summary.sixIvCount, tier,
    ));
  }

  // collector-mega / collector-gmax: breadth of Mega / Gigantamax forms owned.
  results.push({
    id: "collector-mega", name: "Mega Evolver",
    description: `Own ${MEGA_MASTER_TOTAL} different Mega forms.`, category: "Collector",
    earned: summary.megaFormCount >= MEGA_MASTER_TOTAL,
    progress: { current: Math.min(summary.megaFormCount, MEGA_MASTER_TOTAL), total: MEGA_MASTER_TOTAL },
  });
  results.push({
    id: "collector-gmax", name: "Go Big",
    description: `Own ${GMAX_MASTER_TOTAL} different Gigantamax forms.`, category: "Collector",
    earned: summary.gmaxFormCount >= GMAX_MASTER_TOTAL,
    progress: { current: Math.min(summary.gmaxFormCount, GMAX_MASTER_TOTAL), total: GMAX_MASTER_TOTAL },
  });

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
    .filter(([speciesId, ids]) => ids.length >= MIN_FORM_SET_SIZE && !DEDICATED_FORM_SPECIES.has(speciesId))
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

  // Dedicated, themed form ribbons for a couple of fan-favourite cosmetic
  // families (kept out of the generic form-set loop above so they're not
  // duplicated). Own every form of the species.
  {
    const furfrouIds = ref.forms.filter((f) => f.speciesId === FURFROU_ID).map((f) => f.id);
    const p = progressFor(summary.formIds, furfrouIds);
    results.push({
      id: "furfrou-fashionista",
      name: "Furfrou Fashionista",
      description: "Own every Furfrou trim.",
      category: "Forms",
      earned: p.earned,
      progress: { current: p.current, total: p.total },
    });
  }
  {
    const floetteIds = ref.forms.filter((f) => f.speciesId === FLOETTE_ID).map((f) => f.id);
    const p = progressFor(summary.formIds, floetteIds);
    results.push({
      id: "floette-florist",
      name: "In Full Bloom",
      description: "Own every Floette flower.",
      category: "Forms",
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

  // Extended shiny / event tiers.
  for (const tier of SHINY_EXTRA_TIERS) {
    results.push(tieredResult("shiny", "Shiny Hunter", (t) => `Catch ${t} shiny Pokémon.`, "Shiny", summary.shinyCount, tier));
  }
  for (const tier of EVENT_EXTRA_TIERS) {
    results.push(tieredResult("event", "Event Collector", (t) => `Collect ${t} event Pokémon.`, "Events", summary.eventCount, tier));
  }

  // shiny-rainbow: own a shiny of every type present in the reference data.
  {
    const shinyTypes = new Set<string>();
    for (const s of ref.species) {
      if (summary.shinySpeciesIds.has(s.id)) for (const t of s.types) shinyTypes.add(t);
    }
    const total = types.length;
    results.push({
      id: "shiny-rainbow", name: "Chromatic",
      description: "Own a shiny Pokémon of every type.", category: "Shiny",
      earned: total > 0 && shinyTypes.size >= total,
      progress: { current: Math.min(shinyTypes.size, total), total },
    });
  }

  // shiny-living-dex: own a shiny of every species.
  {
    const p = progressFor(summary.shinySpeciesIds, allSpeciesIds);
    results.push({
      id: "shiny-living-dex", name: "Shiny Living Dex",
      description: "Own a shiny of every species in the Pokédex.", category: "Shiny",
      earned: p.earned,
      progress: { current: p.current, total: p.total },
    });
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

/**
 * Per-user collection aggregation for the ribbon engine (extracted from
 * `routes/ribbons.ts` in Flex Phase F so the public-profile endpoint can
 * reuse the exact same computation). `buildCollectionSummary` runs the
 * per-user D1 queries; `buildReferenceData` loads the global species/forms
 * reference. Phase G's `stats.ts` dashboard aggregator will build on these.
 */
import { and, count, countDistinct, eq, isNotNull } from "drizzle-orm";
import type { getDb } from "../db";
import { species, forms, specimens, boxes } from "../../db/schema";
import { computeRibbons as _computeRibbons, isSixIv, type CollectionSummary, type ReferenceData } from "./catalog";

type Db = ReturnType<typeof getDb>;

/** The summary for a user who owns nothing (also used for logged-out ribbon fetches). */
export const EMPTY_SUMMARY: CollectionSummary = {
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

/** Runs the per-user aggregation queries and assembles a `CollectionSummary`. */
export async function buildCollectionSummary(db: Db, userId: string): Promise<CollectionSummary> {
  const [
    speciesRows,
    formRows,
    [{ value: shinyCount }],
    [{ value: eventCount }],
    [{ value: specimenCount }],
    [{ value: boxCount }],
    natureRows,
    ballRows,
    [{ value: level100Count }],
    shinySpeciesRows,
    ownedFormTypeRows,
    ivsRows,
  ] = await Promise.all([
    db.selectDistinct({ speciesId: specimens.speciesId }).from(specimens).where(eq(specimens.userId, userId)),
    db
      .selectDistinct({ formId: specimens.formId })
      .from(specimens)
      .where(and(eq(specimens.userId, userId), isNotNull(specimens.formId))),
    db
      .select({ value: countDistinct(specimens.id) })
      .from(specimens)
      .where(and(eq(specimens.userId, userId), eq(specimens.isShiny, 1))),
    db
      .select({ value: countDistinct(specimens.eventName) })
      .from(specimens)
      .where(and(eq(specimens.userId, userId), eq(specimens.isEvent, 1), isNotNull(specimens.eventName))),
    db.select({ value: count(specimens.id) }).from(specimens).where(eq(specimens.userId, userId)),
    db.select({ value: count(boxes.id) }).from(boxes).where(eq(boxes.userId, userId)),
    db
      .selectDistinct({ nature: specimens.nature })
      .from(specimens)
      .where(and(eq(specimens.userId, userId), isNotNull(specimens.nature))),
    db
      .selectDistinct({ ball: specimens.ball })
      .from(specimens)
      .where(and(eq(specimens.userId, userId), isNotNull(specimens.ball))),
    db
      .select({ value: count(specimens.id) })
      .from(specimens)
      .where(and(eq(specimens.userId, userId), eq(specimens.level, 100))),
    db
      .selectDistinct({ speciesId: specimens.speciesId })
      .from(specimens)
      .where(and(eq(specimens.userId, userId), eq(specimens.isShiny, 1))),
    // Owned form ids joined to their formType, for mega / gmax breadth.
    db
      .selectDistinct({ formId: specimens.formId, formType: forms.formType })
      .from(specimens)
      .innerJoin(forms, eq(specimens.formId, forms.id))
      .where(eq(specimens.userId, userId)),
    // Raw ivs strings for 6IV detection (parsed in JS — cannot query JSON in D1).
    db
      .select({ ivs: specimens.ivs })
      .from(specimens)
      .where(and(eq(specimens.userId, userId), isNotNull(specimens.ivs))),
  ]);

  let megaFormCount = 0;
  let gmaxFormCount = 0;
  for (const r of ownedFormTypeRows) {
    if (r.formType === "mega") megaFormCount++;
    else if (r.formType === "gigantamax") gmaxFormCount++;
  }
  const sixIvCount = ivsRows.reduce((n, r) => (isSixIv(r.ivs) ? n + 1 : n), 0);

  return {
    speciesIds: new Set(speciesRows.map((r) => r.speciesId)),
    formIds: new Set(formRows.map((r) => r.formId).filter((id): id is number => id !== null)),
    shinyCount,
    eventCount,
    specimenCount,
    boxCount,
    naturesOwned: new Set(natureRows.map((r) => (r.nature ?? "").toLowerCase()).filter(Boolean)),
    ballsOwned: new Set(ballRows.map((r) => (r.ball ?? "").toLowerCase()).filter(Boolean)),
    level100Count,
    sixIvCount,
    megaFormCount,
    gmaxFormCount,
    shinySpeciesIds: new Set(shinySpeciesRows.map((r) => r.speciesId)),
  };
}

/** Loads the global species/forms reference data the ribbon engine needs. */
export async function buildReferenceData(db: Db): Promise<ReferenceData> {
  const [speciesRows, formRows] = await Promise.all([
    db.select({ id: species.id, name: species.name, generation: species.generation, types: species.types }).from(species),
    db.select({ id: forms.id, speciesId: forms.speciesId, formType: forms.formType }).from(forms),
  ]);
  return {
    species: speciesRows.map((s) => ({ id: s.id, generation: s.generation, types: JSON.parse(s.types) as string[] })),
    forms: formRows,
    speciesNames: new Map(speciesRows.map((s) => [s.id, s.name] as const)),
  };
}

/** Re-export so callers can import the engine + its inputs from one module. */
export { _computeRibbons as computeRibbons };

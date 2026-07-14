import { Hono } from "hono";
import { and, count, countDistinct, eq, isNotNull } from "drizzle-orm";
import { getDb } from "../db";
import { species, forms, specimens, boxes } from "../../db/schema";
import { getCurrentUser, requireUser } from "../auth/current-user";
import { computeRibbons, isSixIv, type CollectionSummary, type ReferenceData } from "../ribbons/catalog";
import {
  syncEarnedRibbons,
  loadUserRibbonRows,
  ribbonRarity,
  getShowcase,
  setShowcase,
  SHOWCASE_SLOTS,
  markRibbonsSeen,
} from "../ribbons/incentive-store";

export const ribbonRoutes = new Hono<{ Bindings: Env }>();

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

ribbonRoutes.get("/", async (c) => {
  const db = getDb(c.env.DB);
  const user = await getCurrentUser(c);

  let summary: CollectionSummary = emptySummary;
  if (user) {
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
      db.selectDistinct({ speciesId: specimens.speciesId }).from(specimens).where(eq(specimens.userId, user.id)),
      db
        .selectDistinct({ formId: specimens.formId })
        .from(specimens)
        .where(and(eq(specimens.userId, user.id), isNotNull(specimens.formId))),
      db
        .select({ value: countDistinct(specimens.id) })
        .from(specimens)
        .where(and(eq(specimens.userId, user.id), eq(specimens.isShiny, 1))),
      db
        .select({ value: countDistinct(specimens.eventName) })
        .from(specimens)
        .where(and(eq(specimens.userId, user.id), eq(specimens.isEvent, 1), isNotNull(specimens.eventName))),
      db.select({ value: count(specimens.id) }).from(specimens).where(eq(specimens.userId, user.id)),
      db.select({ value: count(boxes.id) }).from(boxes).where(eq(boxes.userId, user.id)),
      db
        .selectDistinct({ nature: specimens.nature })
        .from(specimens)
        .where(and(eq(specimens.userId, user.id), isNotNull(specimens.nature))),
      db
        .selectDistinct({ ball: specimens.ball })
        .from(specimens)
        .where(and(eq(specimens.userId, user.id), isNotNull(specimens.ball))),
      db
        .select({ value: count(specimens.id) })
        .from(specimens)
        .where(and(eq(specimens.userId, user.id), eq(specimens.level, 100))),
      db
        .selectDistinct({ speciesId: specimens.speciesId })
        .from(specimens)
        .where(and(eq(specimens.userId, user.id), eq(specimens.isShiny, 1))),
      // Owned form ids joined to their formType, for mega / gmax breadth.
      db
        .selectDistinct({ formId: specimens.formId, formType: forms.formType })
        .from(specimens)
        .innerJoin(forms, eq(specimens.formId, forms.id))
        .where(eq(specimens.userId, user.id)),
      // Raw ivs strings for 6IV detection (parsed in JS — cannot query JSON in D1).
      db
        .select({ ivs: specimens.ivs })
        .from(specimens)
        .where(and(eq(specimens.userId, user.id), isNotNull(specimens.ivs))),
    ]);

    let megaFormCount = 0;
    let gmaxFormCount = 0;
    for (const r of ownedFormTypeRows) {
      if (r.formType === "mega") megaFormCount++;
      else if (r.formType === "gigantamax") gmaxFormCount++;
    }
    const sixIvCount = ivsRows.reduce((n, r) => (isSixIv(r.ivs) ? n + 1 : n), 0);

    summary = {
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

  const [speciesRows, formRows] = await Promise.all([
    db.select({ id: species.id, name: species.name, generation: species.generation, types: species.types }).from(species),
    db.select({ id: forms.id, speciesId: forms.speciesId, formType: forms.formType }).from(forms),
  ]);

  const ref: ReferenceData = {
    species: speciesRows.map((s) => ({ id: s.id, generation: s.generation, types: JSON.parse(s.types) as string[] })),
    forms: formRows,
    speciesNames: new Map(speciesRows.map((s) => [s.id, s.name] as const)),
  };

  const ribbons = computeRibbons(summary, ref);

  const newlyEarnedIds = new Set<string>();
  if (user) {
    const now = Date.now();
    const earnedIds = ribbons.filter((r) => r.earned).map((r) => r.id);
    await syncEarnedRibbons(db, user.id, earnedIds, now);
    const userRibbonRows = await loadUserRibbonRows(db, user.id);
    for (const r of ribbons) {
      const row = userRibbonRows.get(r.id);
      if (r.earned && row && (row.seenAt === null || row.earnedAt > row.seenAt)) {
        newlyEarnedIds.add(r.id);
      }
    }
  }

  const rarity = await ribbonRarity(db);
  const showcase = user ? await getShowcase(db, user.id) : new Array(SHOWCASE_SLOTS).fill(null);
  const ribbonsOut = ribbons.map((r) => ({
    ...r,
    newlyEarned: newlyEarnedIds.has(r.id),
    rarityPct: rarity.totalUsers > 0 ? (rarity.counts.get(r.id) ?? 0) / rarity.totalUsers : 0,
  }));

  return c.json({
    ribbons: ribbonsOut,
    earnedCount: ribbons.filter((r) => r.earned).length,
    total: ribbons.length,
    showcase,
  });
});

ribbonRoutes.put("/showcase", async (c) => {
  const user = await requireUser(c);
  const db = getDb(c.env.DB);

  const body = await c.req.json().catch(() => null);
  const ribbonIds = Array.isArray(body?.ribbonIds) ? body.ribbonIds : null;
  if (!ribbonIds || !ribbonIds.every((id: unknown) => typeof id === "string")) {
    return c.json({ errors: ["ribbonIds must be an array of strings"] }, 400);
  }

  const result = await setShowcase(db, user.id, ribbonIds);
  if (!result.ok) return c.json({ errors: result.errors }, 400);

  return c.json({ showcase: await getShowcase(db, user.id) });
});

ribbonRoutes.post("/seen", async (c) => {
  const user = await requireUser(c);
  const db = getDb(c.env.DB);
  await markRibbonsSeen(db, user.id, Date.now());
  return c.json({ ok: true });
});

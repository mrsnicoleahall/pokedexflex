import { Hono } from "hono";
import { and, countDistinct, eq, isNotNull } from "drizzle-orm";
import { getDb } from "../db";
import { species, forms, specimens } from "../../db/schema";
import { getCurrentUser } from "../auth/current-user";
import { computeRibbons, type CollectionSummary, type ReferenceData } from "../ribbons/catalog";

export const ribbonRoutes = new Hono<{ Bindings: Env }>();

const emptySummary: CollectionSummary = {
  speciesIds: new Set(),
  formIds: new Set(),
  shinyCount: 0,
  eventCount: 0,
};

ribbonRoutes.get("/", async (c) => {
  const db = getDb(c.env.DB);
  const user = await getCurrentUser(c);

  let summary: CollectionSummary = emptySummary;
  if (user) {
    const [speciesRows, formRows, [{ value: shinyCount }], [{ value: eventCount }]] = await Promise.all([
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
    ]);

    summary = {
      speciesIds: new Set(speciesRows.map((r) => r.speciesId)),
      formIds: new Set(formRows.map((r) => r.formId).filter((id): id is number => id !== null)),
      shinyCount,
      eventCount,
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
  return c.json({ ribbons, earnedCount: ribbons.filter((r) => r.earned).length, total: ribbons.length });
});

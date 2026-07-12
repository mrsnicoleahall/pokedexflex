import { Hono } from "hono";
import { and, count, eq, like, or } from "drizzle-orm";
import { getDb } from "../db";
import { specimens, species, forms, boxes } from "../../db/schema";
import { requireUser } from "../auth/current-user";
import { validateSpecimen, type SpecimenInput } from "../collection/validate";

export const collectionRoutes = new Hono<{ Bindings: Env }>();

type Db = ReturnType<typeof getDb>;

/** Checks that a species row exists for the given id. */
const speciesExists = async (db: Db, speciesId: number): Promise<boolean> => {
  const [row] = await db.select({ id: species.id }).from(species).where(eq(species.id, speciesId)).limit(1);
  return !!row;
};

/** Checks that a form row exists for the given id. */
const formExists = async (db: Db, formId: number): Promise<boolean> => {
  const [row] = await db.select({ id: forms.id }).from(forms).where(eq(forms.id, formId)).limit(1);
  return !!row;
};

/** Checks that a box exists and belongs to the given user. */
const boxBelongsToUser = async (db: Db, boxId: string, userId: string): Promise<boolean> => {
  const [row] = await db
    .select({ id: boxes.id })
    .from(boxes)
    .where(and(eq(boxes.id, boxId), eq(boxes.userId, userId)))
    .limit(1);
  return !!row;
};

/**
 * Validates the referential integrity of a validated specimen input (species/form existence,
 * box ownership) before it is written. Returns a list of errors, empty if all references are valid.
 */
const validateReferences = async (db: Db, value: SpecimenInput, userId: string): Promise<string[]> => {
  const errors: string[] = [];
  if (!(await speciesExists(db, value.speciesId))) errors.push("speciesId does not exist");
  if (value.formId !== null && !(await formExists(db, value.formId))) errors.push("formId does not exist");
  if (value.boxId !== null && !(await boxBelongsToUser(db, value.boxId, userId))) errors.push("boxId not found");
  return errors;
};

/** Sentinel returned when `c.req.json()` fails to parse the request body. */
const INVALID_JSON = Symbol("invalid-json");

type SpecimenRow = typeof specimens.$inferSelect;

/** Converts a stored specimen row into a response DTO, parsing its JSON columns. */
const toDto = (row: SpecimenRow) => ({
  ...row,
  ivs: row.ivs ? JSON.parse(row.ivs) : null,
  evs: row.evs ? JSON.parse(row.evs) : null,
  moves: row.moves ? JSON.parse(row.moves) : [],
  ribbons: row.ribbons ? JSON.parse(row.ribbons) : [],
});

/** Converts a stored specimen row back into raw-input shape, for merging against a PATCH body. */
const rowToInput = (row: SpecimenRow): Record<string, unknown> => ({
  speciesId: row.speciesId,
  formId: row.formId,
  nickname: row.nickname,
  level: row.level,
  isShiny: row.isShiny,
  gender: row.gender,
  nature: row.nature,
  ability: row.ability,
  heldItem: row.heldItem,
  ball: row.ball,
  otName: row.otName,
  otId: row.otId,
  metLocation: row.metLocation,
  metDate: row.metDate,
  originGame: row.originGame,
  originEra: row.originEra,
  isEvent: row.isEvent,
  eventName: row.eventName,
  notes: row.notes,
  boxId: row.boxId,
  ivs: row.ivs ? JSON.parse(row.ivs) : null,
  evs: row.evs ? JSON.parse(row.evs) : null,
  moves: row.moves ? JSON.parse(row.moves) : [],
  ribbons: row.ribbons ? JSON.parse(row.ribbons) : [],
});

/** Maps a validated SpecimenInput onto the storage shape (JSON-encoded columns, bit flags). */
const toStorage = (value: SpecimenInput) => ({
  speciesId: value.speciesId,
  formId: value.formId,
  nickname: value.nickname,
  level: value.level,
  isShiny: value.isShiny,
  gender: value.gender,
  nature: value.nature,
  ability: value.ability,
  heldItem: value.heldItem,
  ball: value.ball,
  otName: value.otName,
  otId: value.otId,
  metLocation: value.metLocation,
  metDate: value.metDate,
  originGame: value.originGame,
  originEra: value.originEra,
  isEvent: value.isEvent,
  eventName: value.eventName,
  notes: value.notes,
  boxId: value.boxId,
  ivs: value.ivs ? JSON.stringify(value.ivs) : null,
  evs: value.evs ? JSON.stringify(value.evs) : null,
  moves: JSON.stringify(value.moves),
  ribbons: JSON.stringify(value.ribbons),
});

collectionRoutes.post("/", async (c) => {
  const user = await requireUser(c);
  const body = await c.req.json().catch(() => null);
  const result = validateSpecimen(body);
  if (!result.ok) return c.json({ errors: result.errors }, 400);

  const db = getDb(c.env.DB);
  const refErrors = await validateReferences(db, result.value, user.id);
  if (refErrors.length > 0) return c.json({ errors: refErrors }, 400);

  const now = Date.now();
  const row: SpecimenRow = {
    id: crypto.randomUUID(),
    userId: user.id,
    source: "manual",
    createdAt: now,
    updatedAt: now,
    ...toStorage(result.value),
  };
  await db.insert(specimens).values(row);
  return c.json(toDto(row));
});

collectionRoutes.get("/", async (c) => {
  const user = await requireUser(c);
  const db = getDb(c.env.DB);

  const q = c.req.query("q")?.trim();
  const box = c.req.query("box");
  const rawLimit = Number.parseInt(c.req.query("limit") ?? "", 10);
  const limit = Number.isFinite(rawLimit) && rawLimit >= 1 ? Math.min(rawLimit, 200) : 60;
  const rawOffset = Number.parseInt(c.req.query("offset") ?? "", 10);
  const offset = Number.isFinite(rawOffset) && rawOffset >= 0 ? rawOffset : 0;

  const conds = [eq(specimens.userId, user.id)];
  if (box) conds.push(eq(specimens.boxId, box));
  if (q) {
    const like_ = `%${q.toLowerCase()}%`;
    conds.push(or(like(specimens.nickname, like_), like(species.name, like_))!);
  }
  const where = and(...conds);

  const rows = await db
    .select({ specimen: specimens, speciesName: species.name, homeId: species.homeId, types: species.types })
    .from(specimens)
    .innerJoin(species, eq(specimens.speciesId, species.id))
    .where(where)
    .limit(limit)
    .offset(offset);

  const [{ value: total }] = await db
    .select({ value: count() })
    .from(specimens)
    .innerJoin(species, eq(specimens.speciesId, species.id))
    .where(where);

  const items = rows.map((r) => ({
    ...toDto(r.specimen),
    speciesName: r.speciesName,
    homeId: r.homeId,
    types: JSON.parse(r.types),
  }));

  return c.json({ items, total });
});

collectionRoutes.get("/:id", async (c) => {
  const user = await requireUser(c);
  const db = getDb(c.env.DB);
  const id = c.req.param("id");
  const [row] = await db
    .select()
    .from(specimens)
    .where(and(eq(specimens.id, id), eq(specimens.userId, user.id)))
    .limit(1);
  if (!row) return c.json({ error: "not_found" }, 404);
  return c.json(toDto(row));
});

collectionRoutes.patch("/:id", async (c) => {
  const user = await requireUser(c);
  const db = getDb(c.env.DB);
  const id = c.req.param("id");
  const [existing] = await db
    .select()
    .from(specimens)
    .where(and(eq(specimens.id, id), eq(specimens.userId, user.id)))
    .limit(1);
  if (!existing) return c.json({ error: "not_found" }, 404);

  const body = await c.req.json().catch(() => INVALID_JSON);
  if (body === INVALID_JSON) return c.json({ errors: ["invalid JSON body"] }, 400);
  const merged = { ...rowToInput(existing), ...(body as Record<string, unknown>) };
  const result = validateSpecimen(merged);
  if (!result.ok) return c.json({ errors: result.errors }, 400);

  const refErrors = await validateReferences(db, result.value, user.id);
  if (refErrors.length > 0) return c.json({ errors: refErrors }, 400);

  const updated: SpecimenRow = {
    ...existing,
    ...toStorage(result.value),
    updatedAt: Date.now(),
  };
  await db.update(specimens).set(updated).where(and(eq(specimens.id, id), eq(specimens.userId, user.id)));
  return c.json(toDto(updated));
});

collectionRoutes.delete("/:id", async (c) => {
  const user = await requireUser(c);
  const db = getDb(c.env.DB);
  const id = c.req.param("id");
  const [existing] = await db
    .select()
    .from(specimens)
    .where(and(eq(specimens.id, id), eq(specimens.userId, user.id)))
    .limit(1);
  if (!existing) return c.json({ error: "not_found" }, 404);

  await db.delete(specimens).where(and(eq(specimens.id, id), eq(specimens.userId, user.id)));
  return c.json({ ok: true });
});

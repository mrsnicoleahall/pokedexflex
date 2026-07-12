import { Hono } from "hono";
import { and, count, eq, like, or } from "drizzle-orm";
import { getDb } from "../db";
import { specimens, species } from "../../db/schema";
import { requireUser } from "../auth/current-user";
import { validateSpecimen, type SpecimenInput } from "../collection/validate";

export const collectionRoutes = new Hono<{ Bindings: Env }>();

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
  const limit = Math.min(Number(c.req.query("limit") ?? 60) || 60, 200);
  const offset = Number(c.req.query("offset") ?? 0) || 0;

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

  const body = await c.req.json().catch(() => ({}) as Record<string, unknown>);
  const merged = { ...rowToInput(existing), ...(body as Record<string, unknown>) };
  const result = validateSpecimen(merged);
  if (!result.ok) return c.json({ errors: result.errors }, 400);

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

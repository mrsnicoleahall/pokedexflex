import { Hono } from "hono";
import { eq, like, and, count, inArray } from "drizzle-orm";
import { getDb } from "../db";
import { species, forms, specimens } from "../../db/schema";
import { getCurrentUser } from "../auth/current-user";

export const speciesRoutes = new Hono<{ Bindings: Env }>();

const shape = (s: any, f: any[], owned: boolean) => ({
  id: s.id, name: s.name, generation: s.generation,
  types: JSON.parse(s.types), spriteUrl: s.spriteUrl, homeId: s.homeId,
  forms: f.map(x => ({ id: x.id, name: x.name, formType: x.formType, spriteUrl: x.spriteUrl, homeId: x.homeId })),
  owned,
});

/** Fetches the current user's owned species-id set, once per request. Empty set for logged-out users. */
const ownedSpeciesIds = async (c: any, db: ReturnType<typeof getDb>): Promise<Set<number>> => {
  const user = await getCurrentUser(c);
  if (!user) return new Set();
  const rows = await db
    .selectDistinct({ speciesId: specimens.speciesId })
    .from(specimens)
    .where(eq(specimens.userId, user.id));
  return new Set(rows.map((r) => r.speciesId));
};

speciesRoutes.get("/species", async (c) => {
  const db = getDb(c.env.DB);
  const q = c.req.query("q");
  const gen = c.req.query("gen");
  const limit = Math.min(Number(c.req.query("limit") ?? 60), 200);
  const offset = Number(c.req.query("offset") ?? 0);
  const conds = [];
  if (q) conds.push(like(species.name, `%${q.toLowerCase()}%`));
  if (gen) conds.push(eq(species.generation, Number(gen)));
  const where = conds.length ? and(...conds) : undefined;
  const rows = await db.select().from(species).where(where).limit(limit).offset(offset);
  const [{ value: total }] = await db.select({ value: count() }).from(species).where(where);
  const ids = rows.map(r => r.id);
  const allForms = ids.length ? await db.select().from(forms).where(inArray(forms.speciesId, ids)) : [];
  const owned = await ownedSpeciesIds(c, db);
  const items = rows.map(s => shape(s, allForms.filter(f => f.speciesId === s.id), owned.has(s.id)));
  return c.json({ items, total });
});

speciesRoutes.get("/species/:id", async (c) => {
  const db = getDb(c.env.DB);
  const id = Number(c.req.param("id"));
  const [s] = await db.select().from(species).where(eq(species.id, id));
  if (!s) return c.json({ error: "not_found" }, 404);
  const f = await db.select().from(forms).where(eq(forms.speciesId, id));
  const owned = await ownedSpeciesIds(c, db);
  return c.json(shape(s, f, owned.has(id)));
});

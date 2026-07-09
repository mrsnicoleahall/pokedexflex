import { Hono } from "hono";
import { eq, like, and, count, inArray } from "drizzle-orm";
import { getDb } from "../db";
import { species, forms } from "../../db/schema";

type Env = { Bindings: { DB: D1Database } };
export const speciesRoutes = new Hono<Env>();

const shape = (s: any, f: any[]) => ({
  id: s.id, name: s.name, generation: s.generation,
  types: JSON.parse(s.types), spriteUrl: s.spriteUrl,
  forms: f.map(x => ({ id: x.id, name: x.name, formType: x.formType, spriteUrl: x.spriteUrl })),
});

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
  const items = rows.map(s => shape(s, allForms.filter(f => f.speciesId === s.id)));
  return c.json({ items, total });
});

speciesRoutes.get("/species/:id", async (c) => {
  const db = getDb(c.env.DB);
  const id = Number(c.req.param("id"));
  const [s] = await db.select().from(species).where(eq(species.id, id));
  if (!s) return c.json({ error: "not_found" }, 404);
  const f = await db.select().from(forms).where(eq(forms.speciesId, id));
  return c.json(shape(s, f));
});

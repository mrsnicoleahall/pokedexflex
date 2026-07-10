import { Hono } from "hono";
import { and, count, desc, eq, like, or, sql } from "drizzle-orm";
import { getDb } from "../db";
import { events, species, specimens } from "../../db/schema";

export const eventRoutes = new Hono<{ Bindings: Env }>();

const shape = (row: { events: typeof events.$inferSelect; species: typeof species.$inferSelect }, ownedNames: Set<string>) => ({
  id: row.events.id,
  slug: row.events.slug,
  name: row.events.name,
  speciesId: row.events.speciesId,
  speciesName: row.species.name,
  speciesTypes: JSON.parse(row.species.types) as string[],
  homeId: row.species.homeId,
  year: row.events.year,
  games: row.events.games,
  region: row.events.region,
  method: row.events.method,
  otName: row.events.otName,
  otId: row.events.otId,
  ribbon: row.events.ribbon,
  isShiny: row.events.isShiny === 1,
  notes: row.events.notes,
  owned: ownedNames.has(row.events.name),
});

eventRoutes.get("/events", async (c) => {
  const db = getDb(c.env.DB);
  const q = c.req.query("q");
  const gen = c.req.query("gen");
  const owner = c.req.query("owner") ?? "demo";
  const limit = Math.min(Number(c.req.query("limit") ?? 60), 200);
  const offset = Number(c.req.query("offset") ?? 0);

  const conds = [];
  if (q) {
    const needle = `%${q.toLowerCase()}%`;
    conds.push(or(like(events.name, needle), like(species.name, needle)));
  }
  if (gen) conds.push(eq(species.generation, Number(gen)));
  const where = conds.length ? and(...conds) : undefined;

  const rows = await db
    .select()
    .from(events)
    .innerJoin(species, eq(events.speciesId, species.id))
    .where(where)
    .orderBy(sql`${events.year} is null`, desc(events.year), events.speciesId, events.id)
    .limit(limit)
    .offset(offset);

  const [{ value: total }] = await db
    .select({ value: count() })
    .from(events)
    .innerJoin(species, eq(events.speciesId, species.id))
    .where(where);

  const ownedRows = await db
    .select({ eventName: specimens.eventName })
    .from(specimens)
    .where(and(eq(specimens.userId, owner), eq(specimens.isEvent, 1)));
  const ownedNames = new Set(ownedRows.map((r) => r.eventName).filter((n): n is string => n !== null));

  const items = rows.map((r) => shape(r, ownedNames));
  return c.json({ items, total });
});

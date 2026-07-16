import { Hono } from "hono";
import { and, desc, eq } from "drizzle-orm";
import { species, userWanted } from "../../db/schema";
import { getDb } from "../db";
import { requireUser } from "../auth/current-user";

export const wantedRoutes = new Hono<{ Bindings: Env }>();

type Db = ReturnType<typeof getDb>;

const speciesExists = async (db: Db, speciesId: number): Promise<boolean> => {
  const [row] = await db.select({ id: species.id }).from(species).where(eq(species.id, speciesId)).limit(1);
  return !!row;
};

// GET /api/wanted — the signed-in trainer's chase list (most recently added
// first), joined to species for display.
wantedRoutes.get("/", async (c) => {
  const user = await requireUser(c);
  const db = getDb(c.env.DB);
  const rows = await db
    .select({
      speciesId: userWanted.speciesId,
      createdAt: userWanted.createdAt,
      name: species.name,
      generation: species.generation,
      types: species.types,
      homeId: species.homeId,
    })
    .from(userWanted)
    .innerJoin(species, eq(userWanted.speciesId, species.id))
    .where(eq(userWanted.userId, user.id))
    .orderBy(desc(userWanted.createdAt));
  const items = rows.map((r) => ({
    speciesId: r.speciesId,
    name: r.name,
    generation: r.generation,
    types: JSON.parse(r.types) as string[],
    homeId: r.homeId,
  }));
  return c.json({ items });
});

// POST /api/wanted { speciesId } — add a species to the chase list (idempotent).
wantedRoutes.post("/", async (c) => {
  const user = await requireUser(c);
  const body = await c.req.json<{ speciesId?: number }>().catch(() => ({}) as { speciesId?: number });
  const speciesId = body.speciesId;
  if (typeof speciesId !== "number" || !Number.isInteger(speciesId)) {
    return c.json({ error: "speciesId must be an integer" }, 400);
  }
  const db = getDb(c.env.DB);
  if (!(await speciesExists(db, speciesId))) return c.json({ error: "speciesId does not exist" }, 400);
  await db
    .insert(userWanted)
    .values({ id: crypto.randomUUID(), userId: user.id, speciesId, createdAt: Date.now() })
    .onConflictDoNothing({ target: [userWanted.userId, userWanted.speciesId] });
  return c.json({ ok: true });
});

// DELETE /api/wanted/:speciesId — remove a species from the chase list.
wantedRoutes.delete("/:speciesId", async (c) => {
  const user = await requireUser(c);
  const speciesId = Number(c.req.param("speciesId"));
  if (!Number.isInteger(speciesId)) return c.json({ error: "bad speciesId" }, 400);
  const db = getDb(c.env.DB);
  await db.delete(userWanted).where(and(eq(userWanted.userId, user.id), eq(userWanted.speciesId, speciesId)));
  return c.json({ ok: true });
});

import { Hono } from "hono";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "../db";
import { boxes, specimens } from "../../db/schema";
import { requireUser } from "../auth/current-user";

export const boxRoutes = new Hono<{ Bindings: Env }>();

boxRoutes.get("/", async (c) => {
  const user = await requireUser(c);
  const db = getDb(c.env.DB);

  const rows = await db
    .select({
      id: boxes.id,
      name: boxes.name,
      count: sql<number>`count(${specimens.id})`,
    })
    .from(boxes)
    .leftJoin(specimens, and(eq(specimens.boxId, boxes.id), eq(specimens.userId, user.id)))
    .where(eq(boxes.userId, user.id))
    .groupBy(boxes.id);

  return c.json({ boxes: rows.map((r) => ({ id: r.id, name: r.name, count: Number(r.count) })) });
});

boxRoutes.post("/", async (c) => {
  const user = await requireUser(c);
  const body = await c.req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) return c.json({ errors: ["name is required"] }, 400);

  const db = getDb(c.env.DB);
  const row = { id: crypto.randomUUID(), userId: user.id, name };
  await db.insert(boxes).values(row);
  return c.json({ id: row.id, name: row.name, count: 0 });
});

boxRoutes.patch("/:id", async (c) => {
  const user = await requireUser(c);
  const db = getDb(c.env.DB);
  const id = c.req.param("id");

  const [existing] = await db
    .select()
    .from(boxes)
    .where(and(eq(boxes.id, id), eq(boxes.userId, user.id)))
    .limit(1);
  if (!existing) return c.json({ error: "not_found" }, 404);

  const body = await c.req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) return c.json({ errors: ["name is required"] }, 400);

  await db.update(boxes).set({ name }).where(and(eq(boxes.id, id), eq(boxes.userId, user.id)));

  const [{ value: specimenCount }] = await db
    .select({ value: sql<number>`count(*)` })
    .from(specimens)
    .where(and(eq(specimens.boxId, id), eq(specimens.userId, user.id)));

  return c.json({ id, name, count: Number(specimenCount) });
});

boxRoutes.delete("/:id", async (c) => {
  const user = await requireUser(c);
  const db = getDb(c.env.DB);
  const id = c.req.param("id");

  const [existing] = await db
    .select()
    .from(boxes)
    .where(and(eq(boxes.id, id), eq(boxes.userId, user.id)))
    .limit(1);
  if (!existing) return c.json({ error: "not_found" }, 404);

  await db
    .update(specimens)
    .set({ boxId: null })
    .where(and(eq(specimens.boxId, id), eq(specimens.userId, user.id)));

  await db.delete(boxes).where(and(eq(boxes.id, id), eq(boxes.userId, user.id)));

  return c.json({ ok: true });
});

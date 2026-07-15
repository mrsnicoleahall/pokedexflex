import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { users } from "../../db/schema";
import { requireUser } from "../auth/current-user";
import { normalizeHandle } from "../profile/handle";
import { saveRivalry, listRivalries, deleteRivalry } from "../rivalries/rivalries-store";

export const rivalryRoutes = new Hono<{ Bindings: Env }>();

/** Lists the signed-in user's saved rivalries (newest first). */
rivalryRoutes.get("/", async (c) => {
  const user = await requireUser(c);
  const db = getDb(c.env.DB);
  return c.json({ rivalries: await listRivalries(db, user.id) });
});

/**
 * Saves a rivalry against a PUBLIC trainer identified by handle. Unknown or
 * private opponent → the same 404 the public profile uses (never reveals a
 * private profile exists). Rivaling yourself → 400. Returns the refreshed list.
 */
rivalryRoutes.post("/", async (c) => {
  const user = await requireUser(c);
  const body = await c.req.json().catch(() => null);
  const rawHandle = (body as { handle?: unknown } | null)?.handle;
  if (typeof rawHandle !== "string") return c.json({ errors: ["handle must be a string"] }, 400);

  const db = getDb(c.env.DB);
  const rows = await db.select().from(users).where(eq(users.handle, normalizeHandle(rawHandle))).limit(1);
  const opponent = rows[0];
  if (!opponent || opponent.isPublic !== 1) return c.json({ error: "not_found" }, 404);
  if (opponent.id === user.id) return c.json({ errors: ["you cannot rival yourself"] }, 400);

  await saveRivalry(db, user.id, opponent.id, Date.now());
  return c.json({ rivalries: await listRivalries(db, user.id) });
});

/** Deletes one of the caller's saved rivalries by id (idempotent). */
rivalryRoutes.delete("/:id", async (c) => {
  const user = await requireUser(c);
  const db = getDb(c.env.DB);
  await deleteRivalry(db, user.id, c.req.param("id"));
  return c.json({ ok: true });
});

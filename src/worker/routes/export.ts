import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { specimens } from "../../db/schema";
import { requireUser } from "../auth/current-user";
import { toDto } from "./collection";

export const exportRoutes = new Hono<{ Bindings: Env }>();

/**
 * Exports the signed-in user's whole collection as plain, re-importable objects
 * (JSON-encoded ivs/evs/moves/ribbons columns are decoded back to objects/arrays).
 * Feeding `specimens` from this response into `POST /api/import/preview` or
 * `/commit` with `format: "json"` round-trips cleanly.
 */
exportRoutes.get("/", async (c) => {
  const user = await requireUser(c);
  const db = getDb(c.env.DB);
  const rows = await db.select().from(specimens).where(eq(specimens.userId, user.id));
  const items = rows.map(toDto);
  return c.json({ exportedAt: Date.now(), count: items.length, specimens: items });
});

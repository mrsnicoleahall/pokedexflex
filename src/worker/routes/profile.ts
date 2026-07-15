import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { users } from "../../db/schema";
import { requireUser } from "../auth/current-user";
import { validateProfileInput } from "../profile/validate";

export const profileRoutes = new Hono<{ Bindings: Env }>();

profileRoutes.put("/", async (c) => {
  const user = await requireUser(c);
  const body = await c.req.json().catch(() => null);
  if (body === null) return c.json({ errors: ["body must be JSON"] }, 400);

  const result = validateProfileInput(body);
  if (!result.ok) return c.json({ errors: result.errors }, 400);
  if (Object.keys(result.value).length === 0) return c.json({ errors: ["nothing to update"] }, 400);

  const db = getDb(c.env.DB);
  await db.update(users).set(result.value).where(eq(users.id, user.id));

  const rows = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
  const updated = rows[0];
  return c.json({
    user: {
      id: updated.id,
      email: updated.email,
      displayName: updated.displayName,
      gender: updated.gender,
      hasAvatar: updated.avatarKey !== null,
    },
  });
});

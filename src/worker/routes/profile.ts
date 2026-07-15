import { Hono } from "hono";
import type { Context } from "hono";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { users } from "../../db/schema";
import { requireUser } from "../auth/current-user";
import { validateProfileInput } from "../profile/validate";
import { getFavoritesEnriched, setFavorites } from "../profile/favorites-store";

export const profileRoutes = new Hono<{ Bindings: Env }>();

const MAX_AVATAR_BYTES = 2 * 1024 * 1024; // 2 MiB — generous for a profile photo, small enough to stay cheap in R2.
const ALLOWED_AVATAR_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

/** Deterministic R2 key for a user's avatar — re-uploading overwrites this same object, never accumulates. */
export const avatarKeyFor = (userId: string) => `avatars/${userId}`;

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
      favorites: await getFavoritesEnriched(db, updated.id),
    },
  });
});

profileRoutes.post("/avatar", async (c: Context<{ Bindings: Env }>) => {
  const user = await requireUser(c);

  const contentType = c.req.header("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return c.json({ errors: ["expected multipart/form-data"] }, 400);
  }
  const form = await c.req.formData().catch(() => null);
  const file = form?.get("avatar");
  if (!(file instanceof Blob)) return c.json({ errors: ["missing avatar file"] }, 400);
  if (!ALLOWED_AVATAR_TYPES.has(file.type)) {
    return c.json({ errors: [`unsupported image type: ${file.type || "unknown"}`] }, 400);
  }
  if (file.size > MAX_AVATAR_BYTES) {
    return c.json({ errors: [`image too large (max ${MAX_AVATAR_BYTES / (1024 * 1024)}MB)`] }, 400);
  }

  const bytes = await file.arrayBuffer();
  const key = avatarKeyFor(user.id);
  await c.env.SPRITES.put(key, bytes, { httpMetadata: { contentType: file.type } });

  const db = getDb(c.env.DB);
  await db.update(users).set({ avatarKey: key }).where(eq(users.id, user.id));

  return c.json({ hasAvatar: true });
});

profileRoutes.put("/favorites", async (c) => {
  const user = await requireUser(c);
  const db = getDb(c.env.DB);

  const body = await c.req.json().catch(() => null);
  const speciesIds = Array.isArray(body?.speciesIds) ? body.speciesIds : null;
  if (!speciesIds || !speciesIds.every((id: unknown) => typeof id === "number" && Number.isInteger(id))) {
    return c.json({ errors: ["speciesIds must be an array of integers"] }, 400);
  }

  const result = await setFavorites(db, user.id, speciesIds);
  if (!result.ok) return c.json({ errors: result.errors }, 400);

  return c.json({ favorites: await getFavoritesEnriched(db, user.id) });
});

profileRoutes.get("/avatar/:userId", async (c) => {
  const userId = c.req.param("userId");
  const object = await c.env.SPRITES.get(avatarKeyFor(userId));
  if (!object) return c.json({ error: "not_found" }, 404);
  return new Response(object.body, {
    headers: {
      "content-type": object.httpMetadata?.contentType ?? "application/octet-stream",
      "cache-control": "public, max-age=60",
    },
  });
});

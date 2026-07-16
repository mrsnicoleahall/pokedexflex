import { Hono } from "hono";
import { desc, eq } from "drizzle-orm";
import { users, wallPosts } from "../../db/schema";
import { getDb } from "../db";
import { getCurrentUser, requireUser } from "../auth/current-user";
import { normalizeHandle } from "../profile/handle";

export const wallRoutes = new Hono<{ Bindings: Env }>();

const BODY_MAX = 500;

type Db = ReturnType<typeof getDb>;

/** Resolves a handle to a PUBLIC trainer, or null (same opacity as the profile route). */
const publicUserByHandle = async (db: Db, rawHandle: string) => {
  const [u] = await db.select().from(users).where(eq(users.handle, normalizeHandle(rawHandle))).limit(1);
  return u && u.isPublic === 1 ? u : null;
};

// GET /api/wall/:handle — public read of a trainer's wall (newest first). Each
// post carries the author's current display fields and a `canDelete` flag for
// the requesting user (the post's author or the wall's owner).
wallRoutes.get("/:handle", async (c) => {
  const db = getDb(c.env.DB);
  const wallUser = await publicUserByHandle(db, c.req.param("handle"));
  if (!wallUser) return c.json({ error: "not_found" }, 404);

  const viewer = await getCurrentUser(c);
  const author = { id: users.id, handle: users.handle, displayName: users.displayName, avatarKey: users.avatarKey };
  const rows = await db
    .select({
      id: wallPosts.id,
      body: wallPosts.body,
      createdAt: wallPosts.createdAt,
      authorUserId: wallPosts.authorUserId,
      authorHandle: author.handle,
      authorName: author.displayName,
      authorAvatarKey: author.avatarKey,
    })
    .from(wallPosts)
    .innerJoin(users, eq(wallPosts.authorUserId, users.id))
    .where(eq(wallPosts.wallUserId, wallUser.id))
    .orderBy(desc(wallPosts.createdAt));

  const posts = rows.map((r) => ({
    id: r.id,
    body: r.body,
    createdAt: r.createdAt,
    authorUserId: r.authorUserId,
    authorHandle: r.authorHandle,
    authorName: r.authorName,
    authorHasAvatar: r.authorAvatarKey !== null,
    canDelete: !!viewer && (viewer.id === r.authorUserId || viewer.id === wallUser.id),
  }));
  return c.json({ posts, isOwner: !!viewer && viewer.id === wallUser.id });
});

// POST /api/wall/:handle { body } — leave a post on a public trainer's wall.
wallRoutes.post("/:handle", async (c) => {
  const author = await requireUser(c);
  const db = getDb(c.env.DB);
  const wallUser = await publicUserByHandle(db, c.req.param("handle"));
  if (!wallUser) return c.json({ error: "not_found" }, 404);

  const parsed = await c.req.json<{ body?: string }>().catch(() => ({}) as { body?: string });
  const body = (parsed.body ?? "").trim();
  if (!body) return c.json({ error: "body_required" }, 400);
  if (body.length > BODY_MAX) return c.json({ error: "body_too_long" }, 400);

  await db.insert(wallPosts).values({
    id: crypto.randomUUID(),
    wallUserId: wallUser.id,
    authorUserId: author.id,
    body,
    createdAt: Date.now(),
  });
  return c.json({ ok: true });
});

// DELETE /api/wall/post/:postId — the post's author or the wall's owner can remove it.
wallRoutes.delete("/post/:postId", async (c) => {
  const user = await requireUser(c);
  const db = getDb(c.env.DB);
  const postId = c.req.param("postId");
  const [post] = await db.select().from(wallPosts).where(eq(wallPosts.id, postId)).limit(1);
  if (!post) return c.json({ error: "not_found" }, 404);
  if (post.authorUserId !== user.id && post.wallUserId !== user.id) {
    return c.json({ error: "forbidden" }, 403);
  }
  await db.delete(wallPosts).where(eq(wallPosts.id, postId));
  return c.json({ ok: true });
});

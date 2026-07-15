import { Hono } from "hono";
import { deleteCookie, getSignedCookie, setSignedCookie } from "hono/cookie";
import { and, eq, gt, isNull } from "drizzle-orm";
import { boxes, importJobs, loginTokens, specimens, sessions as sessionsTable, users } from "../../db/schema";
import { getDb } from "../db";
import { generateToken, hashToken } from "../auth/tokens";
import { createSession, deleteSession, SESSION_COOKIE } from "../auth/session";
import { getCurrentUser, requireUser } from "../auth/current-user";
import { getEmailSender } from "../auth/email";
import { avatarKeyFor } from "./profile";

export const authRoutes = new Hono<{ Bindings: Env }>();

authRoutes.post("/request-link", async (c) => {
  const body = await c.req.json<{ email?: string }>().catch(() => ({}) as { email?: string });
  const email = body.email?.trim().toLowerCase();
  if (!email) return c.json({ error: "email_required" }, 400);

  const db = getDb(c.env.DB);
  const raw = generateToken();
  await db.insert(loginTokens).values({
    id: generateToken(),
    tokenHash: await hashToken(raw),
    email,
    expiresAt: Date.now() + 15 * 60 * 1000,
    usedAt: null,
    createdAt: Date.now(),
  });

  const link = `${new URL(c.req.url).origin}/api/auth/verify?token=${raw}`;
  const { devLink } = await getEmailSender(c.env).sendLoginLink(email, link);
  return c.json({ ok: true, devLink });
});

authRoutes.get("/verify", async (c) => {
  const token = c.req.query("token");
  if (!token) return c.json({ error: "invalid_or_expired" }, 400);

  const db = getDb(c.env.DB);
  const tokenHash = await hashToken(token);
  const now = Date.now();
  const consumed = await db
    .update(loginTokens)
    .set({ usedAt: now })
    .where(and(eq(loginTokens.tokenHash, tokenHash), isNull(loginTokens.usedAt), gt(loginTokens.expiresAt, now)))
    .returning();
  const tokenRow = consumed[0];
  if (!tokenRow) return c.json({ error: "invalid_or_expired" }, 400);

  const existing = await db.select().from(users).where(eq(users.email, tokenRow.email)).limit(1);
  let user = existing[0];
  if (!user) {
    user = { id: generateToken(), email: tokenRow.email, displayName: null, gender: null, avatarKey: null, createdAt: now };
    await db.insert(users).values(user);
  }

  const sid = await createSession(db, user.id);
  await setSignedCookie(c, SESSION_COOKIE, sid, c.env.SESSION_SECRET, {
    httpOnly: true,
    sameSite: "Lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  return c.redirect("/", 302);
});

authRoutes.post("/logout", async (c) => {
  const sid = await getSignedCookie(c, c.env.SESSION_SECRET, SESSION_COOKIE);
  if (sid) {
    const db = getDb(c.env.DB);
    await deleteSession(db, sid);
  }
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.json({ ok: true });
});

authRoutes.get("/me", async (c) => {
  const user = await getCurrentUser(c);
  return c.json({ user });
});

authRoutes.delete("/account", async (c) => {
  const user = await requireUser(c);
  const db = getDb(c.env.DB);
  try {
    await c.env.SPRITES.delete(avatarKeyFor(user.id));
  } catch (err) {
    console.error("account deletion: failed to remove avatar from R2", err);
  }
  await db.batch([
    db.delete(specimens).where(eq(specimens.userId, user.id)),
    db.delete(importJobs).where(eq(importJobs.userId, user.id)),
    db.delete(boxes).where(eq(boxes.userId, user.id)),
    db.delete(sessionsTable).where(eq(sessionsTable.userId, user.id)),
    db.delete(loginTokens).where(eq(loginTokens.email, user.email)),
    db.delete(users).where(eq(users.id, user.id)),
  ]);
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.json({ ok: true });
});

import { Hono } from "hono";
import { deleteCookie, getSignedCookie, setSignedCookie } from "hono/cookie";
import { and, eq, gt, or } from "drizzle-orm";
import { boxes, importJobs, loginTokens, rivalries, specimens, sessions as sessionsTable, users } from "../../db/schema";
import { getDb } from "../db";
import { generateToken, hashToken } from "../auth/tokens";
import { createSession, deleteSession, SESSION_COOKIE } from "../auth/session";
import { getCurrentUser, requireUser } from "../auth/current-user";
import { getEmailSender } from "../auth/email";
import { avatarKeyFor } from "./profile";
import { getFavoritesEnriched } from "../profile/favorites-store";

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

  // Point at the client /signin page, NOT the API endpoint directly. Clicking a
  // magic link is a cross-site top-level navigation, and browsers do not
  // reliably persist the SameSite=Lax session cookie set on that navigation's
  // redirect. The /signin page instead completes sign-in with a SAME-ORIGIN
  // fetch to /api/auth/verify, which sets the cookie reliably.
  const link = `${new URL(c.req.url).origin}/signin?token=${raw}`;
  const { devLink } = await getEmailSender(c.env).sendLoginLink(email, link);
  return c.json({ ok: true, devLink });
});

authRoutes.get("/verify", async (c) => {
  const token = c.req.query("token");
  if (!token) return c.json({ error: "invalid_or_expired" }, 400);

  const db = getDb(c.env.DB);
  const tokenHash = await hashToken(token);
  const now = Date.now();
  // Match on hash + expiry only, NOT usedAt. Email security scanners (Microsoft
  // 365 Safe Links, Gmail, etc.) pre-fetch links to check them, which would
  // consume a strictly single-use token before the human ever clicks — leaving
  // them unable to sign in. The token still expires in 15 minutes, so allowing
  // reuse within that short window is the standard, safe trade-off.
  const [tokenRow] = await db
    .select()
    .from(loginTokens)
    .where(and(eq(loginTokens.tokenHash, tokenHash), gt(loginTokens.expiresAt, now)))
    .limit(1);
  if (!tokenRow) return c.json({ error: "invalid_or_expired" }, 400);
  if (tokenRow.usedAt === null) {
    await db.update(loginTokens).set({ usedAt: now }).where(eq(loginTokens.id, tokenRow.id));
  }

  const existing = await db.select().from(users).where(eq(users.email, tokenRow.email)).limit(1);
  let user = existing[0];
  if (!user) {
    user = { id: generateToken(), email: tokenRow.email, displayName: null, gender: null, avatarKey: null, handle: null, isPublic: 1, createdAt: now };
    await db.insert(users).values(user);
  }

  const sid = await createSession(db, user.id);
  // Secure only over HTTPS: production auth cookies must be Secure or Safari's
  // ITP (and some proxy/browser combos) drop a SameSite=Lax cookie set during
  // the cross-site email-link redirect. Kept off for http://localhost dev,
  // where Secure cookies aren't stored in every browser.
  const secure = new URL(c.req.url).protocol === "https:";
  await setSignedCookie(c, SESSION_COOKIE, sid, c.env.SESSION_SECRET, {
    httpOnly: true,
    secure,
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
  if (!user) return c.json({ user: null });
  const db = getDb(c.env.DB);
  const favorites = await getFavoritesEnriched(db, user.id);
  return c.json({ user: { ...user, favorites } });
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
    db.delete(rivalries).where(or(eq(rivalries.userId, user.id), eq(rivalries.opponentUserId, user.id))),
    db.delete(users).where(eq(users.id, user.id)),
  ]);
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.json({ ok: true });
});

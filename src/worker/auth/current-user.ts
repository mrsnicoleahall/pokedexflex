import type { Context } from "hono";
import { getSignedCookie } from "hono/cookie";
import { HTTPException } from "hono/http-exception";
import { eq } from "drizzle-orm";
import { users } from "../../db/schema";
import { getDb } from "../db";
import { getSession, SESSION_COOKIE } from "./session";

export interface CurrentUser {
  id: string;
  email: string;
  displayName: string | null;
}

type AppContext = Context<{ Bindings: Env }>;

/** Reads the signed session cookie and resolves the current user, or null if unauthenticated. */
export const getCurrentUser = async (c: AppContext): Promise<CurrentUser | null> => {
  const sid = await getSignedCookie(c, c.env.SESSION_SECRET, SESSION_COOKIE);
  if (!sid) return null;
  const db = getDb(c.env.DB);
  const session = await getSession(db, sid);
  if (!session) return null;
  const rows = await db.select().from(users).where(eq(users.id, session.userId)).limit(1);
  const user = rows[0];
  if (!user) return null;
  return { id: user.id, email: user.email, displayName: user.displayName };
};

/** Resolves the current user or throws a 401 HTTPException. */
export const requireUser = async (c: AppContext): Promise<CurrentUser> => {
  const user = await getCurrentUser(c);
  if (!user) throw new HTTPException(401, { message: "auth required" });
  return user;
};

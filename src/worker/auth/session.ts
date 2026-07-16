import { and, eq, gt } from "drizzle-orm";
import { sessions } from "../../db/schema";
import type { getDb } from "../db";
import { generateToken } from "./tokens";

export const SESSION_COOKIE = "pfd_session";

// Match the session cookie's lifetime (see auth.ts): 400 days, the max Max-Age
// browsers honor. Keeps the server-side session valid as long as the cookie is.
const SESSION_TTL_MS = 400 * 24 * 60 * 60 * 1000;

type Db = ReturnType<typeof getDb>;

export const createSession = async (
  db: Db,
  userId: string,
  nowMs: number = Date.now(),
): Promise<string> => {
  const id = generateToken();
  await db.insert(sessions).values({
    id,
    userId,
    createdAt: nowMs,
    expiresAt: nowMs + SESSION_TTL_MS,
  });
  return id;
};

export const getSession = async (
  db: Db,
  id: string,
  nowMs: number = Date.now(),
): Promise<{ userId: string } | null> => {
  const rows = await db
    .select({ userId: sessions.userId })
    .from(sessions)
    .where(and(eq(sessions.id, id), gt(sessions.expiresAt, nowMs)))
    .limit(1);
  const row = rows[0];
  return row ? { userId: row.userId } : null;
};

export const deleteSession = async (db: Db, id: string): Promise<void> => {
  await db.delete(sessions).where(eq(sessions.id, id));
};

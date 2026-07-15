/**
 * Data-access for saved rivalries (Flex Phase G). All D1 I/O for the
 * auth-scoped `POST/GET/DELETE /api/rivalries` endpoints lives here; the
 * opponent is keyed by the stable `opponentUserId`, and their CURRENT
 * handle/name is joined from `users` at read time (so a rename doesn't break
 * a saved rivalry). `routes/rivalries.ts` is the only caller.
 */
import { and, desc, eq } from "drizzle-orm";
import type { getDb } from "../db";
import { rivalries, users } from "../../db/schema";

type Db = ReturnType<typeof getDb>;

export type RivalryRow = {
  id: string;
  opponentUserId: string;
  handle: string | null;
  displayName: string | null;
  hasAvatar: boolean;
  isPublic: boolean;
  createdAt: number;
};

/** Saves a rivalry (idempotent — the `(userId, opponentUserId)` unique index makes a re-save a no-op). */
export async function saveRivalry(db: Db, userId: string, opponentUserId: string, now: number): Promise<void> {
  await db
    .insert(rivalries)
    .values({ id: crypto.randomUUID(), userId, opponentUserId, createdAt: now })
    .onConflictDoNothing({ target: [rivalries.userId, rivalries.opponentUserId] });
}

/** Lists a user's saved rivalries, newest first, joined to each opponent's current profile. */
export async function listRivalries(db: Db, userId: string): Promise<RivalryRow[]> {
  const rows = await db
    .select({
      id: rivalries.id,
      opponentUserId: rivalries.opponentUserId,
      handle: users.handle,
      displayName: users.displayName,
      avatarKey: users.avatarKey,
      isPublic: users.isPublic,
      createdAt: rivalries.createdAt,
    })
    .from(rivalries)
    .innerJoin(users, eq(rivalries.opponentUserId, users.id))
    .where(eq(rivalries.userId, userId))
    .orderBy(desc(rivalries.createdAt));
  return rows.map((r) => ({
    id: r.id,
    opponentUserId: r.opponentUserId,
    handle: r.handle,
    displayName: r.displayName,
    hasAvatar: r.avatarKey !== null,
    isPublic: r.isPublic === 1,
    createdAt: r.createdAt,
  }));
}

/** Deletes one of the caller's rivalries by id (scoped to `userId`). Returns whether a row was removed. */
export async function deleteRivalry(db: Db, userId: string, id: string): Promise<boolean> {
  const existing = await db
    .select({ id: rivalries.id })
    .from(rivalries)
    .where(and(eq(rivalries.id, id), eq(rivalries.userId, userId)))
    .limit(1);
  if (existing.length === 0) return false;
  await db.delete(rivalries).where(and(eq(rivalries.id, id), eq(rivalries.userId, userId)));
  return true;
}

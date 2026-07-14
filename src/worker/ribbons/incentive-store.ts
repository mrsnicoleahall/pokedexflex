/**
 * Data-access layer for the ribbon incentive backend (Flex Phase D). Every
 * function here does real D1 I/O and is intentionally kept out of the pure
 * engines (`catalog.ts`, `scoring.ts`) per the Global Constraints — the
 * route (`routes/ribbons.ts`) is the only caller. Extended across Tasks
 * D3–D6; this task adds the sync + read-back functions.
 */
import { eq, sql } from "drizzle-orm";
import type { getDb } from "../db";
import { userRibbons, users } from "../../db/schema";

type Db = ReturnType<typeof getDb>;

/**
 * Inserts a `user_ribbons` row (earnedAt = now, seenAt = null) for every
 * currently-earned ribbon id the user doesn't already have a row for.
 * Existing rows are left untouched — `onConflictDoNothing` on the
 * `(user_id, ribbon_id)` unique index is what keeps `earnedAt` fixed at
 * first-earn and preserves `seenAt` across repeated fetches.
 */
export async function syncEarnedRibbons(
  db: Db,
  userId: string,
  earnedIds: readonly string[],
  now: number,
): Promise<void> {
  if (earnedIds.length === 0) return;
  await db
    .insert(userRibbons)
    .values(earnedIds.map((ribbonId) => ({ id: crypto.randomUUID(), userId, ribbonId, earnedAt: now, seenAt: null })))
    .onConflictDoNothing({ target: [userRibbons.userId, userRibbons.ribbonId] });
}

/** Loads every `user_ribbons` row for a user, keyed by ribbonId. */
export async function loadUserRibbonRows(
  db: Db,
  userId: string,
): Promise<Map<string, { earnedAt: number; seenAt: number | null }>> {
  const rows = await db
    .select({ ribbonId: userRibbons.ribbonId, earnedAt: userRibbons.earnedAt, seenAt: userRibbons.seenAt })
    .from(userRibbons)
    .where(eq(userRibbons.userId, userId));
  return new Map(rows.map((r) => [r.ribbonId, { earnedAt: r.earnedAt, seenAt: r.seenAt }]));
}

/**
 * Ribbon rarity across the whole userbase: `earnedCount(ribbonId) /
 * totalUsers`. Independent of the requesting user — computed from ALL
 * users' `user_ribbons` rows, so it's safe to include in the response for
 * signed-in AND logged-out requests alike (it never touches per-user data).
 */
export async function ribbonRarity(db: Db): Promise<{ counts: Map<string, number>; totalUsers: number }> {
  const [countRows, [{ value: totalUsers }]] = await Promise.all([
    db
      .select({ ribbonId: userRibbons.ribbonId, value: sql<number>`count(*)` })
      .from(userRibbons)
      .groupBy(userRibbons.ribbonId),
    db.select({ value: sql<number>`count(*)` }).from(users),
  ]);
  return {
    counts: new Map(countRows.map((r) => [r.ribbonId, Number(r.value)])),
    totalUsers: Number(totalUsers),
  };
}

/**
 * Data-access layer for the ribbon incentive backend (Flex Phase D). Every
 * function here does real D1 I/O and is intentionally kept out of the pure
 * engines (`catalog.ts`, `scoring.ts`) per the Global Constraints — the
 * route (`routes/ribbons.ts`) is the only caller. Extended across Tasks
 * D3–D6; this task adds the sync + read-back functions.
 */
import { eq, sql } from "drizzle-orm";
import type { getDb } from "../db";
import { userRibbons, userShowcase, users } from "../../db/schema";

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

/** Fixed showcase size — the "trophy wall" holds up to this many pinned ribbons. */
export const SHOWCASE_SLOTS = 6;

/** Returns the user's showcase as a fixed 6-slot array (`null` for an empty slot), in slot order. */
export async function getShowcase(db: Db, userId: string): Promise<(string | null)[]> {
  const rows = await db
    .select({ ribbonId: userShowcase.ribbonId, slot: userShowcase.slot })
    .from(userShowcase)
    .where(eq(userShowcase.userId, userId));
  const out: (string | null)[] = new Array(SHOWCASE_SLOTS).fill(null);
  for (const r of rows) {
    if (r.slot >= 0 && r.slot < SHOWCASE_SLOTS) out[r.slot] = r.ribbonId;
  }
  return out;
}

/**
 * Replaces the user's showcase with `ribbonIds` (array index = slot). Every
 * id must be one the user has actually earned (checked against
 * `user_ribbons`, never trusted from the request) — the whole write is
 * rejected, with no partial update, if any id is unearned, the list is
 * longer than `SHOWCASE_SLOTS`, or it contains a duplicate.
 */
export async function setShowcase(
  db: Db,
  userId: string,
  ribbonIds: readonly string[],
): Promise<{ ok: true } | { ok: false; errors: string[] }> {
  const errors: string[] = [];
  if (ribbonIds.length > SHOWCASE_SLOTS) errors.push(`at most ${SHOWCASE_SLOTS} ribbons may be showcased`);
  if (new Set(ribbonIds).size !== ribbonIds.length) errors.push("duplicate ribbon ids");

  if (ribbonIds.length > 0) {
    const earned = await loadUserRibbonRows(db, userId);
    const unearned = ribbonIds.filter((id) => !earned.has(id));
    if (unearned.length > 0) errors.push(`not earned: ${unearned.join(", ")}`);
  }

  if (errors.length > 0) return { ok: false, errors };

  await db.delete(userShowcase).where(eq(userShowcase.userId, userId));
  if (ribbonIds.length > 0) {
    await db.insert(userShowcase).values(
      ribbonIds.map((ribbonId, slot) => ({ id: crypto.randomUUID(), userId, ribbonId, slot })),
    );
  }
  return { ok: true };
}

/** Acknowledges all outstanding earn moments for a user — bumps `seenAt` to `now` for every row they own. */
export async function markRibbonsSeen(db: Db, userId: string, now: number): Promise<void> {
  await db.update(userRibbons).set({ seenAt: now }).where(eq(userRibbons.userId, userId));
}

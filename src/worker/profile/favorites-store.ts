/**
 * Data-access layer for the Top-3 Favorite Species feature (Flex Phase P),
 * structurally identical to the ribbon showcase's `getShowcase`/`setShowcase`
 * in `src/worker/ribbons/incentive-store.ts` — see Task P4's write-up for
 * why this is a table rather than columns on `users`. All D1 I/O lives here;
 * `routes/profile.ts` is the only caller.
 */
import { eq, inArray } from "drizzle-orm";
import type { getDb } from "../db";
import { userFavorites, species } from "../../db/schema";

type Db = ReturnType<typeof getDb>;

/** Fixed favorites size — a "top 3", not a general watchlist. */
export const FAVORITE_SLOTS = 3;

/** Returns the user's favorites as a fixed 3-slot array (`null` for an empty slot), in slot order. */
export async function getFavorites(db: Db, userId: string): Promise<(number | null)[]> {
  const rows = await db
    .select({ speciesId: userFavorites.speciesId, slot: userFavorites.slot })
    .from(userFavorites)
    .where(eq(userFavorites.userId, userId));
  const out: (number | null)[] = new Array(FAVORITE_SLOTS).fill(null);
  for (const r of rows) {
    if (r.slot >= 0 && r.slot < FAVORITE_SLOTS) out[r.slot] = r.speciesId;
  }
  return out;
}

export type FavoriteSpecies = { speciesId: number; name: string; homeId: number | null };

/** Returns only the filled slots, joined against `species` for display, in slot order. */
export async function getFavoritesEnriched(db: Db, userId: string): Promise<FavoriteSpecies[]> {
  const slots = (await getFavorites(db, userId)).filter((id): id is number => id !== null);
  if (slots.length === 0) return [];
  const rows = await db
    .select({ id: species.id, name: species.name, homeId: species.homeId })
    .from(species)
    .where(inArray(species.id, slots));
  const byId = new Map(rows.map((r) => [r.id, r]));
  return slots.map((id) => {
    const row = byId.get(id);
    return { speciesId: id, name: row?.name ?? "unknown", homeId: row?.homeId ?? null };
  });
}

/**
 * Replaces the user's favorites with `speciesIds` (array index = slot).
 * Every id must exist in `species` (checked here, never trusted from the
 * request) — the whole write is rejected, with no partial update, if any id
 * is unknown, the list is longer than `FAVORITE_SLOTS`, or it contains a
 * duplicate.
 */
export async function setFavorites(
  db: Db,
  userId: string,
  speciesIds: readonly number[],
): Promise<{ ok: true } | { ok: false; errors: string[] }> {
  const errors: string[] = [];
  if (speciesIds.length > FAVORITE_SLOTS) errors.push(`at most ${FAVORITE_SLOTS} favorites allowed`);
  if (new Set(speciesIds).size !== speciesIds.length) errors.push("duplicate species ids");

  if (speciesIds.length > 0) {
    const rows = await db.select({ id: species.id }).from(species).where(inArray(species.id, speciesIds));
    const known = new Set(rows.map((r) => r.id));
    const unknown = speciesIds.filter((id) => !known.has(id));
    if (unknown.length > 0) errors.push(`unknown species: ${unknown.join(", ")}`);
  }

  if (errors.length > 0) return { ok: false, errors };

  await db.delete(userFavorites).where(eq(userFavorites.userId, userId));
  if (speciesIds.length > 0) {
    await db.insert(userFavorites).values(
      speciesIds.map((speciesId, slot) => ({ id: crypto.randomUUID(), userId, speciesId, slot })),
    );
  }
  return { ok: true };
}

// Shared rarity-map loader: pulls ownership counts + total users + species
// ids from D1 and hands them to the pure `computeRarity` engine. Caches the
// resulting Map in-module with a short TTL, since it's the same expensive
// aggregate for every request in the isolate's lifetime.

import { count, countDistinct } from "drizzle-orm";
import type { getDb } from "../db";
import { species, specimens, users } from "../../db/schema";
import { computeRarity } from "./compute";
import type { RarityTier } from "./priors";

const TTL_MS = 60_000;

let cachedMap: Map<number, RarityTier> | null = null;
let cachedAt = 0;

/**
 * Returns a Map of speciesId -> RarityTier for every known species, backed
 * by a short-lived in-memory cache (fine for a Worker isolate — each isolate
 * gets its own cache, and it self-expires after ~60s).
 */
export async function getRarityMap(db: ReturnType<typeof getDb>): Promise<Map<number, RarityTier>> {
  const now = Date.now();
  if (cachedMap && now - cachedAt < TTL_MS) return cachedMap;

  const ownershipRows = await db
    .select({ speciesId: specimens.speciesId, c: countDistinct(specimens.userId) })
    .from(specimens)
    .groupBy(specimens.speciesId);
  const ownershipCounts = new Map(ownershipRows.map((r) => [r.speciesId, Number(r.c)]));

  const [{ value: totalUsers }] = await db.select({ value: count() }).from(users);

  const speciesRows = await db.select({ id: species.id }).from(species);
  const speciesIds = speciesRows.map((r) => r.id);

  const map = computeRarity({ speciesIds, ownershipCounts, totalUsers });
  cachedMap = map;
  cachedAt = now;
  return map;
}

/** Test-only escape hatch: forces the next call to recompute. */
export function _resetRarityCacheForTests(): void {
  cachedMap = null;
  cachedAt = 0;
}

/**
 * Pure per-type / per-generation species counting for the flex layer (Flex
 * Phase H). Extracted from `versus/stats.ts` so Versus and the Progress stats
 * endpoint share ONE implementation of "count distinct species by type / by
 * generation" (no duplicated counting). No I/O — takes plain data, returns
 * plain sparse maps. Keyed by lowercase type name and by generation number as
 * a string, matching what the client `versusDisplay.ts`/`statsDisplay.ts`
 * order helpers expect.
 */
import type { ReferenceData } from "./catalog";

/**
 * Owned distinct-species counts, per lowercase type and per generation, over a
 * set/iterable of owned species ids resolved against the reference dex. Sparse
 * — only keys the user actually owns appear. Owned ids not present in the
 * reference are ignored.
 */
export function buildOwnedBreakdown(
  ownedSpeciesIds: Iterable<number>,
  ref: ReferenceData,
): { byType: Record<string, number>; byGen: Record<string, number> } {
  const speciesById = new Map(ref.species.map((s) => [s.id, s] as const));
  const byType: Record<string, number> = {};
  const byGen: Record<string, number> = {};
  for (const speciesId of ownedSpeciesIds) {
    const meta = speciesById.get(speciesId);
    if (!meta) continue;
    const genKey = String(meta.generation);
    byGen[genKey] = (byGen[genKey] ?? 0) + 1;
    for (const type of meta.types) {
      const key = type.toLowerCase();
      byType[key] = (byType[key] ?? 0) + 1;
    }
  }
  return { byType, byGen };
}

/**
 * Total distinct-species counts across the ENTIRE reference dex — the
 * denominators for completion percentages. Same shape/keys as
 * `buildOwnedBreakdown`.
 */
export function buildReferenceTotals(
  ref: ReferenceData,
): { totalByType: Record<string, number>; totalByGen: Record<string, number> } {
  const totalByType: Record<string, number> = {};
  const totalByGen: Record<string, number> = {};
  for (const s of ref.species) {
    const genKey = String(s.generation);
    totalByGen[genKey] = (totalByGen[genKey] ?? 0) + 1;
    for (const type of s.types) {
      const key = type.toLowerCase();
      totalByType[key] = (totalByType[key] ?? 0) + 1;
    }
  }
  return { totalByType, totalByGen };
}

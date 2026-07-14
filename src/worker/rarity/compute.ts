// Pure scarcity compute engine: blends observed ownership rates with the
// curated priors from priors.ts using a simple shrinkage estimator, then
// buckets the blended rate into a RarityTier. No I/O; deterministic.

import { type RarityTier, priorRate } from "./priors";

export const RARITY_WEIGHT: Record<RarityTier, number> = {
  legendary: 100,
  epic: 40,
  rare: 15,
  uncommon: 5,
  common: 1,
};

export const RARITY_ORDER: RarityTier[] = ["common", "uncommon", "rare", "epic", "legendary"];

function tierForBlendedRate(blended: number): RarityTier {
  if (blended < 0.05) return "legendary";
  if (blended < 0.15) return "epic";
  if (blended < 0.35) return "rare";
  if (blended < 0.6) return "uncommon";
  return "common";
}

export function computeRarity(args: {
  speciesIds: number[];
  ownershipCounts: Map<number, number>;
  totalUsers: number;
}): Map<number, RarityTier> {
  const { speciesIds, ownershipCounts, totalUsers } = args;
  const result = new Map<number, RarityTier>();
  for (const id of speciesIds) {
    const rate = totalUsers > 0 ? (ownershipCounts.get(id) ?? 0) / totalUsers : 0;
    const w = totalUsers / (totalUsers + 25);
    const blended = w * rate + (1 - w) * priorRate(id);
    result.set(id, tierForBlendedRate(blended));
  }
  return result;
}

/**
 * Per-user aggregator for Versus (Flex Phase G). Turns a user's collection
 * (via F3's `buildCollectionSummary`) + computed ribbons into the six round
 * metrics `versus/rounds.ts` compares, plus a per-type / per-generation
 * breakdown for the diverging bars. Reuses the exact scoring the public
 * profile uses (`trainerScoreFor`/`rankFor`/`pointsForRibbon`) — no duplicated
 * scoring. The caller (`routes/versus.ts`, and reusable elsewhere) builds
 * `ReferenceData` ONCE and passes it in, so a two-sided versus loads the
 * global species/forms reference a single time. NEVER reads or returns email.
 */
import { buildCollectionSummary, computeRibbons } from "../ribbons/collection-summary";
import { trainerScoreFor, rankFor, pointsForRibbon } from "../ribbons/scoring";
import { getShowcase } from "../ribbons/incentive-store";
import { getFavoritesEnriched } from "../profile/favorites-store";
import type { getDb } from "../db";
import type { ReferenceData } from "../ribbons/catalog";
import type { RoundValues } from "./rounds";

type Db = ReturnType<typeof getDb>;

/** Ribbon categories that count toward the "Rarity Crown" round (the rare flexes). */
export const RARITY_FLEX_CATEGORIES: ReadonlySet<string> = new Set(["Rarity Class", "Grand", "Collector"]);

/** The identity fields safe to echo publicly (never email). */
export type VersusStatsUser = {
  userId: string;
  handle: string;
  displayName: string | null;
  gender: string | null;
  hasAvatar: boolean;
};

export type VersusStats = VersusStatsUser & {
  trainerScore: number;
  rank: string;
  favorites: Awaited<ReturnType<typeof getFavoritesEnriched>>;
  showcase: { id: string; name: string; category: string }[];
  stats: { dexCount: number; shinySpeciesCount: number; specimenCount: number; ribbonCount: number };
  rounds: RoundValues;
  /** Owned distinct-species count per lowercase type (sparse — only present types). */
  byType: Record<string, number>;
  /** Owned distinct-species count per generation, keyed by the number as a string (sparse). */
  byGen: Record<string, number>;
};

/**
 * Builds one side of a versus. `user` is the resolved `users` row subset
 * (never carrying email into this function). `ref` is shared across both
 * sides by the caller.
 */
export async function buildVersusStats(
  db: Db,
  user: { id: string; handle: string; displayName: string | null; gender: string | null; avatarKey: string | null },
  ref: ReferenceData,
): Promise<VersusStats> {
  const summary = await buildCollectionSummary(db, user.id);
  const ribbons = computeRibbons(summary, ref);
  const earned = ribbons.filter((r) => r.earned);
  const trainerScore = trainerScoreFor(earned);
  const rank = rankFor(trainerScore);

  const rarity = earned.reduce(
    (sum, r) => (RARITY_FLEX_CATEGORIES.has(r.category) ? sum + pointsForRibbon(r) : sum),
    0,
  );

  // Per-type / per-generation breakdown over the user's OWNED species,
  // resolved against the shared reference data.
  const speciesById = new Map(ref.species.map((s) => [s.id, s] as const));
  const byType: Record<string, number> = {};
  const byGen: Record<string, number> = {};
  for (const speciesId of summary.speciesIds) {
    const meta = speciesById.get(speciesId);
    if (!meta) continue;
    const genKey = String(meta.generation);
    byGen[genKey] = (byGen[genKey] ?? 0) + 1;
    for (const type of meta.types) {
      const key = type.toLowerCase();
      byType[key] = (byType[key] ?? 0) + 1;
    }
  }
  const distinctTypes = Object.keys(byType).length;
  const distinctGens = Object.keys(byGen).length;
  const totalSpecies = ref.species.length;

  const byId = new Map(ribbons.map((r) => [r.id, r] as const));
  const showcaseSlots = await getShowcase(db, user.id);
  const showcase = showcaseSlots
    .filter((id): id is string => id !== null)
    .map((id) => byId.get(id))
    .filter((r): r is NonNullable<typeof r> => r !== undefined)
    .map((r) => ({ id: r.id, name: r.name, category: r.category }));

  const favorites = await getFavoritesEnriched(db, user.id);

  const rounds: RoundValues = {
    strength: 3 * summary.sixIvCount + 2 * summary.level100Count + summary.megaFormCount + summary.gmaxFormCount,
    diversity: distinctTypes + distinctGens,
    completion: totalSpecies > 0 ? summary.speciesIds.size / totalSpecies : 0,
    shiny: summary.shinySpeciesIds.size,
    ribbons: trainerScore,
    rarity,
  };

  return {
    userId: user.id,
    handle: user.handle,
    displayName: user.displayName,
    gender: user.gender,
    hasAvatar: user.avatarKey !== null,
    trainerScore,
    rank,
    favorites,
    showcase,
    stats: {
      dexCount: summary.speciesIds.size,
      shinySpeciesCount: summary.shinySpeciesIds.size,
      specimenCount: summary.specimenCount,
      ribbonCount: earned.length,
    },
    rounds,
    byType,
    byGen,
  };
}

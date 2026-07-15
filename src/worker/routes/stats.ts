import { Hono } from "hono";
import { getDb } from "../db";
import { requireUser } from "../auth/current-user";
import { computeRibbons, buildCollectionSummary, buildReferenceData } from "../ribbons/collection-summary";
import { trainerScoreFor, rankFor, pointsForRibbon } from "../ribbons/scoring";
import { buildOwnedBreakdown, buildReferenceTotals } from "../ribbons/breakdown";
import { RARITY_FLEX_CATEGORIES } from "../versus/stats";

export const statsRoutes = new Hono<{ Bindings: Env }>();

/**
 * Auth-scoped progress dashboard for the signed-in user (Flex Phase H). Reuses
 * the SAME per-user aggregation the ribbons page and public profile use
 * (`buildCollectionSummary`/`computeRibbons`/`trainerScoreFor`/`rankFor`) and
 * the shared per-type/per-gen counting (`buildOwnedBreakdown`), builds
 * `ReferenceData` ONCE, and returns ONLY the stat fields below — never email or
 * any other `users` column.
 */
statsRoutes.get("/", async (c) => {
  const user = await requireUser(c);
  const db = getDb(c.env.DB);

  const summary = await buildCollectionSummary(db, user.id);
  const ref = await buildReferenceData(db);
  const ribbons = computeRibbons(summary, ref);
  const earned = ribbons.filter((r) => r.earned);
  const trainerScore = trainerScoreFor(earned);
  const rank = rankFor(trainerScore);
  const rarityScore = earned.reduce(
    (sum, r) => (RARITY_FLEX_CATEGORIES.has(r.category) ? sum + pointsForRibbon(r) : sum),
    0,
  );

  const { byType, byGen } = buildOwnedBreakdown(summary.speciesIds, ref);
  const { totalByType, totalByGen } = buildReferenceTotals(ref);

  const owned = summary.speciesIds.size;
  const total = ref.species.length;

  return c.json({
    stats: {
      completion: { owned, total, pct: total > 0 ? owned / total : 0 },
      byType,
      totalByType,
      byGen,
      totalByGen,
      shinySpeciesCount: summary.shinySpeciesIds.size,
      eventCount: summary.eventCount,
      specimenCount: summary.specimenCount,
      boxCount: summary.boxCount,
      megaFormCount: summary.megaFormCount,
      gmaxFormCount: summary.gmaxFormCount,
      ribbonCount: earned.length,
      trainerScore,
      rank,
      rarityScore,
    },
  });
});

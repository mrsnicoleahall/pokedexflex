import { Hono } from "hono";
import { and, eq, isNotNull, countDistinct } from "drizzle-orm";
import { getDb } from "../db";
import { users, userRibbons, specimens } from "../../db/schema";
import { buildReferenceData, computeRibbons, EMPTY_SUMMARY } from "../ribbons/collection-summary";
import { pointsForRibbon, rankFor } from "../ribbons/scoring";
import { RARITY_FLEX_CATEGORIES } from "../versus/stats";
import { parseMetric, rankLeaderboard, LEADERBOARD_LIMIT, type LeaderboardCandidate } from "../leaderboard/ranking";

export const leaderboardRoutes = new Hono<{ Bindings: Env }>();

/**
 * Public, unauthenticated leaderboard of PUBLIC trainers (`isPublic = 1` AND a
 * non-null handle) — Flex Phase J. Ranks by `?metric=score|completion|shiny|
 * rarity|ribbons` (default score) and returns the top `LEADERBOARD_LIMIT`,
 * never email or any private field.
 *
 * EFFICIENCY: a fixed, small number of queries regardless of user count — NO
 * per-user recompute. `computeRibbons` runs EXACTLY ONCE (with EMPTY_SUMMARY)
 * only to enumerate the catalog for the `ribbonId → category` map;
 * `buildCollectionSummary` is never called here. Trainer Score + Rarity +
 * ribbonCount all come from the SAME ONE `user_ribbons` scan (points derived
 * per row via `pointsForRibbon`, since points are NOT a stored column;
 * ribbonCount is simply the row count per user — no extra query); Completion +
 * Shiny come from ONE `GROUP BY user_id` aggregate over `specimens` each.
 *
 * STALENESS CAVEAT: Trainer Score / Rarity / rank are derived from persisted
 * `user_ribbons`, which is only synced when a user loads GET /api/ribbons and
 * is additive-only — so they reflect each user's LAST ribbons-page sync and may
 * lag the live score their profile shows. Completion + Shiny are live
 * aggregates and carry no such caveat. Accepted launch tradeoff (the
 * alternative is a forbidden per-user recompute).
 */
leaderboardRoutes.get("/", async (c) => {
  const metric = parseMetric(c.req.query("metric"));
  const db = getDb(c.env.DB);

  // 1. PUBLIC trainers only (public AND has a handle).
  const publicUsers = await db
    .select({ id: users.id, handle: users.handle, displayName: users.displayName, avatarKey: users.avatarKey })
    .from(users)
    .where(and(eq(users.isPublic, 1), isNotNull(users.handle)));

  if (publicUsers.length === 0) {
    return c.json({ metric, limit: LEADERBOARD_LIMIT, total: 0, entries: [] });
  }
  const publicIds = new Set(publicUsers.map((u) => u.id));

  // 2. Reference ONCE — completion denominator + a static ribbonId → category map.
  const ref = await buildReferenceData(db);
  const totalSpecies = ref.species.length;
  const categoryById = new Map(computeRibbons(EMPTY_SUMMARY, ref).map((r) => [r.id, r.category] as const));

  // 3. Trainer Score + Rarity + ribbonCount from ONE user_ribbons scan (points derived per row).
  const ribbonRows = await db
    .select({ userId: userRibbons.userId, ribbonId: userRibbons.ribbonId })
    .from(userRibbons);
  const scoreByUser = new Map<string, number>();
  const rarityByUser = new Map<string, number>();
  const ribbonCountByUser = new Map<string, number>();
  for (const row of ribbonRows) {
    if (!publicIds.has(row.userId)) continue;
    const category = categoryById.get(row.ribbonId) ?? "";
    const points = pointsForRibbon({ id: row.ribbonId, category });
    scoreByUser.set(row.userId, (scoreByUser.get(row.userId) ?? 0) + points);
    if (RARITY_FLEX_CATEGORIES.has(category)) {
      rarityByUser.set(row.userId, (rarityByUser.get(row.userId) ?? 0) + points);
    }
    ribbonCountByUser.set(row.userId, (ribbonCountByUser.get(row.userId) ?? 0) + 1);
  }

  // 4. Completion (distinct owned species) — ONE grouped aggregate.
  const completionRows = await db
    .select({ userId: specimens.userId, value: countDistinct(specimens.speciesId) })
    .from(specimens)
    .groupBy(specimens.userId);
  const ownedByUser = new Map(completionRows.map((r) => [r.userId, Number(r.value)]));

  // 5. Shiny (distinct shiny species) — ONE grouped aggregate.
  const shinyRows = await db
    .select({ userId: specimens.userId, value: countDistinct(specimens.speciesId) })
    .from(specimens)
    .where(eq(specimens.isShiny, 1))
    .groupBy(specimens.userId);
  const shinyByUser = new Map(shinyRows.map((r) => [r.userId, Number(r.value)]));

  // 6. Assemble candidates (one per public trainer), then rank + cap.
  const candidates: LeaderboardCandidate[] = publicUsers.map((u) => {
    const trainerScore = scoreByUser.get(u.id) ?? 0;
    const owned = ownedByUser.get(u.id) ?? 0;
    return {
      userId: u.id,
      handle: u.handle as string,
      displayName: u.displayName,
      hasAvatar: u.avatarKey !== null,
      trainerScore,
      rank: rankFor(trainerScore),
      completionOwned: owned,
      completionTotal: totalSpecies,
      completionPct: totalSpecies > 0 ? owned / totalSpecies : 0,
      shinySpeciesCount: shinyByUser.get(u.id) ?? 0,
      rarityScore: rarityByUser.get(u.id) ?? 0,
      ribbonCount: ribbonCountByUser.get(u.id) ?? 0,
    };
  });

  const entries = rankLeaderboard(candidates, metric, LEADERBOARD_LIMIT);
  return c.json({ metric, limit: LEADERBOARD_LIMIT, total: candidates.length, entries });
});

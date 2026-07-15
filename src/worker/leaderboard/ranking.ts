/**
 * Pure leaderboard ranking for the flex layer (Flex Phase J). Turns a flat list
 * of candidate rows (one per PUBLIC trainer, already carrying every metric
 * value) into a ranked, position-numbered, top-N-capped list for the chosen
 * metric. No I/O — takes plain data, returns plain data — so the route can stay
 * a thin data-assembler and this stays trivially unit-testable. Rank order is
 * fully deterministic: chosen metric desc, then trainerScore desc, then userId
 * asc, so ties never depend on DB row order.
 */

/** The metrics the public leaderboard can be ranked by. Trainer Score is primary/default. */
export type LeaderboardMetric = "score" | "completion" | "shiny" | "rarity" | "ribbons";

export const LEADERBOARD_METRICS: readonly LeaderboardMetric[] = [
  "score",
  "completion",
  "shiny",
  "rarity",
  "ribbons",
];

export const DEFAULT_METRIC: LeaderboardMetric = "score";

/** Max ranked rows returned. Pagination/caching beyond this is a documented follow-up. */
export const LEADERBOARD_LIMIT = 100;

/** Coerces a raw query-string metric to a known value, defaulting unknown/missing to Trainer Score. */
export function parseMetric(raw: string | undefined | null): LeaderboardMetric {
  return LEADERBOARD_METRICS.includes(raw as LeaderboardMetric) ? (raw as LeaderboardMetric) : DEFAULT_METRIC;
}

/** One public trainer's metric values, before ranking. */
export type LeaderboardCandidate = {
  userId: string;
  handle: string;
  displayName: string | null;
  hasAvatar: boolean;
  trainerScore: number;
  rank: string;
  /** Distinct owned species. */
  completionOwned: number;
  /** Total species in the reference dex (the completion denominator; same for every row). */
  completionTotal: number;
  /** completionOwned / completionTotal, 0..1. */
  completionPct: number;
  /** Distinct species for which the user owns at least one shiny. */
  shinySpeciesCount: number;
  /** Sum of points from earned rare-flex ribbons (Rarity Class / Grand / Collector). */
  rarityScore: number;
  /** Count of distinct EARNED ribbons (rows in `user_ribbons`) for this user. */
  ribbonCount: number;
};

/** A ranked candidate: its 1-based `position` and the `value` of the metric it was ranked by. */
export type LeaderboardEntry = LeaderboardCandidate & { position: number; value: number };

/** The numeric value a candidate is ranked by for a metric (completion ranks by owned count). */
export function metricValue(c: LeaderboardCandidate, metric: LeaderboardMetric): number {
  switch (metric) {
    case "completion":
      return c.completionOwned;
    case "shiny":
      return c.shinySpeciesCount;
    case "rarity":
      return c.rarityScore;
    case "ribbons":
      return c.ribbonCount;
    case "score":
    default:
      return c.trainerScore;
  }
}

/**
 * Ranks candidates by the chosen metric (desc), tie-broken by trainerScore
 * (desc) then userId (asc), assigns sequential 1-based positions, and caps at
 * `limit`. Pure: does not mutate `candidates`.
 */
export function rankLeaderboard(
  candidates: readonly LeaderboardCandidate[],
  metric: LeaderboardMetric,
  limit = LEADERBOARD_LIMIT,
): LeaderboardEntry[] {
  return [...candidates]
    .sort(
      (a, b) =>
        metricValue(b, metric) - metricValue(a, metric) ||
        b.trainerScore - a.trainerScore ||
        a.userId.localeCompare(b.userId),
    )
    .slice(0, limit)
    .map((c, i) => ({ ...c, position: i + 1, value: metricValue(c, metric) }));
}

/**
 * Pure Trainer Score engine: ribbon points, rank titles, and "closest to
 * earning" nudge selection. No I/O — takes plain data, returns plain data.
 * Consumed by `routes/ribbons.ts`; unit-tested directly here.
 */

import type { RibbonResult } from "./catalog";

const CATEGORY_POINTS: Record<string, number> = {
  Fun: 5,
  Type: 15,
  Shiny: 15,
  Events: 15,
  Regional: 20,
  Forms: 20,
  "Form Sets": 20,
  Completion: 30,
  "Rarity Class": 40,
  Collector: 40,
  Grand: 100,
};

/** Defensive fallback for any category not in `CATEGORY_POINTS` — should never trigger against the real catalog. */
const DEFAULT_POINTS = 10;

/**
 * Ribbons that are exactly as hard as a `Grand` ribbon but are filed under a
 * different category for Ribbons-page grouping (see Phase C). Overriding
 * here keeps Trainer Score honest without reshuffling that UI grouping.
 */
const GRAND_OVERRIDE_IDS = new Set<string>(["shiny-living-dex"]);

/** Points a single ribbon contributes to Trainer Score once earned. */
export function pointsForRibbon(ribbon: { id: string; category: string }): number {
  if (GRAND_OVERRIDE_IDS.has(ribbon.id)) return CATEGORY_POINTS.Grand;
  return CATEGORY_POINTS[ribbon.category] ?? DEFAULT_POINTS;
}

/** Sum of `pointsForRibbon` across every earned ribbon — a user's Trainer Score. */
export function trainerScoreFor(earned: readonly { id: string; category: string }[]): number {
  return earned.reduce((sum, r) => sum + pointsForRibbon(r), 0);
}

/**
 * Rank titles by cumulative Trainer Score, ascending. See the Task D2
 * write-up above for the threshold rationale.
 */
export const RANKS: readonly { title: string; minScore: number }[] = [
  { title: "Novice", minScore: 0 },
  { title: "Collector", minScore: 100 },
  { title: "Ace", minScore: 300 },
  { title: "Elite", minScore: 600 },
  { title: "Champion", minScore: 1000 },
  { title: "Master", minScore: 1600 },
  { title: "Living Legend", minScore: 2400 },
];

/** The highest rank title whose `minScore` is <= `score`. */
export function rankFor(score: number): string {
  let title = RANKS[0].title;
  for (const r of RANKS) {
    if (score >= r.minScore) title = r.title;
    else break;
  }
  return title;
}

/**
 * "Closest to earning" nudges: the top `limit` locked, non-secret ribbons by
 * progress ratio (current/total), highest first. Secret (`Fun` easter-egg)
 * ribbons are excluded so a nudge never spoils a hidden achievement's
 * existence; ribbons with `total === 0` (degenerate/empty sets) are excluded
 * since they have no meaningful ratio. Ties break by id for determinism.
 */
export function nearestRibbons(results: readonly RibbonResult[], limit = 5): RibbonResult[] {
  return results
    .filter((r) => !r.earned && !r.secret && r.progress.total > 0)
    .map((r) => ({ ribbon: r, ratio: r.progress.current / r.progress.total }))
    .sort((a, b) => b.ratio - a.ratio || a.ribbon.id.localeCompare(b.ribbon.id))
    .slice(0, limit)
    .map((x) => x.ribbon);
}

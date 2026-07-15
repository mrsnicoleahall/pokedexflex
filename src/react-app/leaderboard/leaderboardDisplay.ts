// src/react-app/leaderboard/leaderboardDisplay.ts
//
// DOM-free display metadata + formatting for the public Leaderboard page (Flex
// Phase J). Kept free of React/DOM/api.ts imports so it's unit-testable the
// same way statsDisplay.ts / versusDisplay.ts are (tests import this, never a
// component). OWNS the `LeaderboardMetric` union for the client — api.ts
// imports the type from here. (The worker keeps its own identical union in
// leaderboard/ranking.ts; it cannot import across the worker/client boundary.)

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

export type LeaderboardTab = { metric: LeaderboardMetric; label: string };

/** Metric switcher tabs, in metric order (Trainer Score first). */
export const LEADERBOARD_TABS: readonly LeaderboardTab[] = [
	{ metric: "score", label: "Trainer Score" },
	{ metric: "completion", label: "Completion" },
	{ metric: "shiny", label: "Shiny" },
	{ metric: "rarity", label: "Rarity" },
	{ metric: "ribbons", label: "Ribbons" },
];

/** Coerces a raw string to a known metric, defaulting unknown/missing to Trainer Score. */
export function parseLeaderboardMetric(raw: string | null | undefined): LeaderboardMetric {
	return LEADERBOARD_METRICS.includes(raw as LeaderboardMetric) ? (raw as LeaderboardMetric) : DEFAULT_METRIC;
}

/**
 * The subset of a leaderboard row `formatMetricValue` reads (a leaderboard
 * entry satisfies this structurally). `ribbonCount` is optional: it backs the
 * "ribbons" metric tab (present on `LeaderboardEntryDto` via api.ts) but isn't
 * part of the display contract this module's own tests exercise.
 */
export type MetricValues = {
	trainerScore: number;
	completionOwned: number;
	completionTotal: number;
	completionPct: number;
	shinySpeciesCount: number;
	rarityScore: number;
	ribbonCount?: number;
};

/** The primary display string for a row under the chosen metric. */
export function formatMetricValue(v: MetricValues, metric: LeaderboardMetric): string {
	switch (metric) {
		case "completion":
			return `${v.completionOwned} (${Math.round(v.completionPct * 100)}%)`;
		case "shiny":
			return `${v.shinySpeciesCount}`;
		case "rarity":
			return `${v.rarityScore}`;
		case "ribbons":
			return `${v.ribbonCount ?? 0}`;
		case "score":
		default:
			return `${v.trainerScore} pts`;
	}
}

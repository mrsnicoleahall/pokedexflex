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

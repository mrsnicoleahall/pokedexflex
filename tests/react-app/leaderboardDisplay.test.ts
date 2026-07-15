import { describe, expect, it } from "vitest";
import {
  LEADERBOARD_TABS,
  LEADERBOARD_METRICS,
  DEFAULT_METRIC,
  parseLeaderboardMetric,
  formatMetricValue,
  type MetricValues,
} from "../../src/react-app/leaderboard/leaderboardDisplay";

const v: MetricValues = {
  trainerScore: 140,
  completionOwned: 30,
  completionTotal: 120,
  completionPct: 0.25,
  shinySpeciesCount: 7,
  rarityScore: 40,
};

describe("LEADERBOARD_TABS", () => {
  it("has a labeled tab for every metric, in metric order, score first", () => {
    expect(LEADERBOARD_TABS.map((t) => t.metric)).toEqual([...LEADERBOARD_METRICS]);
    expect(LEADERBOARD_TABS[0].metric).toBe("score");
    for (const t of LEADERBOARD_TABS) expect(t.label.length).toBeGreaterThan(0);
  });
});

describe("parseLeaderboardMetric", () => {
  it("passes known metrics through and defaults everything else", () => {
    expect(parseLeaderboardMetric("shiny")).toBe("shiny");
    expect(parseLeaderboardMetric(null)).toBe(DEFAULT_METRIC);
    expect(parseLeaderboardMetric("nope")).toBe(DEFAULT_METRIC);
  });
});

describe("formatMetricValue", () => {
  it("formats each metric for display", () => {
    expect(formatMetricValue(v, "score")).toBe("140 pts");
    expect(formatMetricValue(v, "completion")).toBe("30 (25%)");
    expect(formatMetricValue(v, "shiny")).toBe("7");
    expect(formatMetricValue(v, "rarity")).toBe("40");
  });
});

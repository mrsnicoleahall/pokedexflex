import { describe, expect, it } from "vitest";
import {
  parseMetric,
  metricValue,
  rankLeaderboard,
  LEADERBOARD_METRICS,
  DEFAULT_METRIC,
  LEADERBOARD_LIMIT,
  type LeaderboardCandidate,
} from "../../src/worker/leaderboard/ranking";

const cand = (over: Partial<LeaderboardCandidate>): LeaderboardCandidate => ({
  userId: "u",
  handle: "h",
  displayName: null,
  hasAvatar: false,
  trainerScore: 0,
  rank: "Novice",
  completionOwned: 0,
  completionTotal: 100,
  completionPct: 0,
  shinySpeciesCount: 0,
  rarityScore: 0,
  ...over,
});

describe("parseMetric", () => {
  it("accepts every known metric", () => {
    for (const m of LEADERBOARD_METRICS) expect(parseMetric(m)).toBe(m);
  });
  it("falls back to the default for missing/unknown values", () => {
    expect(parseMetric(undefined)).toBe(DEFAULT_METRIC);
    expect(parseMetric(null)).toBe(DEFAULT_METRIC);
    expect(parseMetric("garbage")).toBe(DEFAULT_METRIC);
    expect(DEFAULT_METRIC).toBe("score");
  });
});

describe("metricValue", () => {
  const c = cand({ trainerScore: 140, completionOwned: 30, shinySpeciesCount: 7, rarityScore: 40 });
  it("selects the field the metric ranks by", () => {
    expect(metricValue(c, "score")).toBe(140);
    expect(metricValue(c, "completion")).toBe(30); // owned count, not pct
    expect(metricValue(c, "shiny")).toBe(7);
    expect(metricValue(c, "rarity")).toBe(40);
  });
});

describe("rankLeaderboard", () => {
  it("ranks by the chosen metric descending and assigns 1-based positions + value", () => {
    const rows = rankLeaderboard(
      [
        cand({ userId: "a", trainerScore: 5 }),
        cand({ userId: "b", trainerScore: 140 }),
        cand({ userId: "c", trainerScore: 60 }),
      ],
      "score",
    );
    expect(rows.map((r) => r.userId)).toEqual(["b", "c", "a"]);
    expect(rows.map((r) => r.position)).toEqual([1, 2, 3]);
    expect(rows.map((r) => r.value)).toEqual([140, 60, 5]);
  });

  it("re-ranks when the metric changes", () => {
    const input = [
      cand({ userId: "a", trainerScore: 200, shinySpeciesCount: 1 }),
      cand({ userId: "b", trainerScore: 10, shinySpeciesCount: 50 }),
    ];
    expect(rankLeaderboard(input, "score").map((r) => r.userId)).toEqual(["a", "b"]);
    expect(rankLeaderboard(input, "shiny").map((r) => r.userId)).toEqual(["b", "a"]);
  });

  it("breaks ties by trainerScore then userId (deterministic)", () => {
    const rows = rankLeaderboard(
      [
        cand({ userId: "zzz", shinySpeciesCount: 5, trainerScore: 10 }),
        cand({ userId: "aaa", shinySpeciesCount: 5, trainerScore: 10 }),
        cand({ userId: "mmm", shinySpeciesCount: 5, trainerScore: 99 }),
      ],
      "shiny",
    );
    // equal shiny → higher trainerScore first, then userId ascending
    expect(rows.map((r) => r.userId)).toEqual(["mmm", "aaa", "zzz"]);
  });

  it("caps at the limit without mutating the input", () => {
    const input = Array.from({ length: 5 }, (_, i) => cand({ userId: `u${i}`, trainerScore: i }));
    const rows = rankLeaderboard(input, "score", 2);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.userId)).toEqual(["u4", "u3"]);
    expect(input).toHaveLength(5); // pure — original untouched
  });

  it("defaults the cap to LEADERBOARD_LIMIT (100)", () => {
    const input = Array.from({ length: 150 }, (_, i) => cand({ userId: `u${i}`, trainerScore: i }));
    expect(rankLeaderboard(input, "score")).toHaveLength(LEADERBOARD_LIMIT);
  });
});

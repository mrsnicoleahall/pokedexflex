import { describe, expect, it } from "vitest";
import {
  ROUND_DEFS,
  winnerOf,
  computeRounds,
  overallOutcome,
  type RoundValues,
} from "../../src/worker/versus/rounds";

const A: RoundValues = { strength: 30, diversity: 20, completion: 0.5, shiny: 40, ribbons: 800, rarity: 120 };
const B: RoundValues = { strength: 10, diversity: 25, completion: 0.5, shiny: 12, ribbons: 300, rarity: 40 };

describe("ROUND_DEFS", () => {
  it("defines exactly the six rounds in display order", () => {
    expect(ROUND_DEFS.map((r) => r.key)).toEqual([
      "strength",
      "diversity",
      "completion",
      "shiny",
      "ribbons",
      "rarity",
    ]);
  });

  it("marks completion as a percentage and the rest as integers", () => {
    const byKey = Object.fromEntries(ROUND_DEFS.map((r) => [r.key, r.format]));
    expect(byKey.completion).toBe("percent");
    expect(byKey.strength).toBe("int");
    expect(byKey.rarity).toBe("int");
  });
});

describe("winnerOf", () => {
  it("higher value wins", () => {
    expect(winnerOf(5, 3)).toBe("a");
    expect(winnerOf(3, 5)).toBe("b");
  });
  it("equal values tie (including 0-0)", () => {
    expect(winnerOf(7, 7)).toBe("tie");
    expect(winnerOf(0, 0)).toBe("tie");
  });
});

describe("computeRounds", () => {
  it("returns one result per round def, in order, with correct winners", () => {
    const rounds = computeRounds(A, B);
    expect(rounds.map((r) => r.key)).toEqual(ROUND_DEFS.map((r) => r.key));
    const byKey = Object.fromEntries(rounds.map((r) => [r.key, r]));
    expect(byKey.strength.winner).toBe("a");
    expect(byKey.diversity.winner).toBe("b");
    expect(byKey.completion.winner).toBe("tie");
    expect(byKey.shiny.winner).toBe("a");
    expect(byKey.ribbons.winner).toBe("a");
    expect(byKey.rarity.winner).toBe("a");
  });

  it("carries each side's raw value and label through", () => {
    const rounds = computeRounds(A, B);
    const shiny = rounds.find((r) => r.key === "shiny")!;
    expect(shiny.a).toBe(40);
    expect(shiny.b).toBe(12);
    expect(shiny.label).toBe("Shiny");
  });
});

describe("overallOutcome", () => {
  it("tallies round wins and names the overall winner", () => {
    const out = overallOutcome(computeRounds(A, B));
    expect(out.aWins).toBe(4);
    expect(out.bWins).toBe(1);
    expect(out.ties).toBe(1);
    expect(out.winner).toBe("a");
  });

  it("is a tie when both sides win the same number of rounds", () => {
    const even = overallOutcome(
      computeRounds(
        { strength: 5, diversity: 1, completion: 0, shiny: 0, ribbons: 0, rarity: 0 },
        { strength: 1, diversity: 5, completion: 0, shiny: 0, ribbons: 0, rarity: 0 },
      ),
    );
    expect(even.aWins).toBe(1);
    expect(even.bWins).toBe(1);
    expect(even.winner).toBe("tie");
  });
});

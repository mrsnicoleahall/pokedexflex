import { describe, expect, it } from "vitest";
import {
  TYPE_ORDER,
  GEN_ORDER,
  formatPct,
  barPct,
  buildCompletionRows,
} from "../../src/react-app/stats/statsDisplay";

describe("re-exported order constants", () => {
  it("exposes all 18 types and 9 generations", () => {
    expect(TYPE_ORDER).toHaveLength(18);
    expect(GEN_ORDER).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });
});

describe("formatPct", () => {
  it("renders a 0..1 fraction as a whole percent", () => {
    expect(formatPct(0)).toBe("0%");
    expect(formatPct(0.5)).toBe("50%");
    expect(formatPct(1)).toBe("100%");
    expect(formatPct(0.126)).toBe("13%"); // rounds
  });
});

describe("barPct", () => {
  it("is a clamped 0..100 percentage; 0 when there is no total", () => {
    expect(barPct(3, 4)).toBe(75);
    expect(barPct(0, 10)).toBe(0);
    expect(barPct(0, 0)).toBe(0);
    expect(barPct(5, 4)).toBe(100); // clamp
  });
});

describe("buildCompletionRows", () => {
  it("builds one row per key with a positive total, in order, defaulting owned to 0", () => {
    const rows = buildCompletionRows(GEN_ORDER, { "1": 2 }, { "1": 5, "2": 10 });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ key: "1", label: "1", owned: 2, total: 5, pct: 2 / 5 });
    expect(rows[1]).toEqual({ key: "2", label: "2", owned: 0, total: 10, pct: 0 });
  });

  it("drops keys whose total is 0 or missing", () => {
    const rows = buildCompletionRows(["fire", "water"], { fire: 1 }, { fire: 3 });
    expect(rows.map((r) => r.key)).toEqual(["fire"]);
  });
});

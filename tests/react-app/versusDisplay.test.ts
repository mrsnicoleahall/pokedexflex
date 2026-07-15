import { describe, expect, it } from "vitest";
import {
	TYPE_ORDER,
	GEN_ORDER,
	formatRoundValue,
	barPercents,
	buildBreakdown,
} from "../../src/react-app/versus/versusDisplay";

describe("TYPE_ORDER / GEN_ORDER", () => {
	it("lists all 18 types and 9 generations", () => {
		expect(TYPE_ORDER).toHaveLength(18);
		expect(GEN_ORDER).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
	});
});

describe("formatRoundValue", () => {
	it("formats ints plainly and percents as a rounded %", () => {
		expect(formatRoundValue("int", 42)).toBe("42");
		expect(formatRoundValue("percent", 0.5)).toBe("50%");
		expect(formatRoundValue("percent", 0.333)).toBe("33%");
	});
});

describe("barPercents", () => {
	it("scales the larger side to 100 and the other proportionally", () => {
		expect(barPercents(50, 25)).toEqual({ a: 100, b: 50 });
		expect(barPercents(0, 10)).toEqual({ a: 0, b: 100 });
	});
	it("is 0/0 when both sides are 0", () => {
		expect(barPercents(0, 0)).toEqual({ a: 0, b: 0 });
	});
});

describe("buildBreakdown", () => {
	it("emits a row per key in order, dropping rows where both sides are 0", () => {
		const rows = buildBreakdown([1, 2, 3], { "1": 3, "3": 1 }, { "1": 1, "2": 0 });
		expect(rows.map((r) => r.key)).toEqual(["1", "3"]); // gen 2 dropped (both 0)
		expect(rows[0]).toEqual({ key: "1", label: "1", a: 3, b: 1 });
		expect(rows[1]).toEqual({ key: "3", label: "3", a: 1, b: 0 });
	});
});

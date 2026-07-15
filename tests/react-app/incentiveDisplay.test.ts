import { describe, expect, it } from "vitest";
import {
	formatRarityPct,
	RARE_FLEX_THRESHOLD,
	isRareFlex,
	rankColor,
	deriveShowcaseSlots,
	nudgePct,
} from "../../src/react-app/ribbons/incentiveDisplay";
// Local structural shape (mirrors the fields these pure helpers read) so the
// tests project stays decoupled from the DOM-typed api.ts — deriveShowcaseSlots
// is generic over `{ id }`, so a plain literal is all callers need here.
type TestRibbon = {
	id: string;
	name: string;
	description: string;
	category: string;
	earned: boolean;
	progress: { current: number; total: number };
	points: number;
	rarityPct: number;
	newlyEarned: boolean;
};

function ribbon(overrides: Partial<TestRibbon> = {}): TestRibbon {
	return {
		id: "x",
		name: "X",
		description: "d",
		category: "Fun",
		earned: false,
		progress: { current: 0, total: 1 },
		points: 5,
		rarityPct: 0,
		newlyEarned: false,
		...overrides,
	};
}

describe("formatRarityPct", () => {
	it("formats a normal percentage rounded to the nearest integer", () => {
		expect(formatRarityPct(0.123)).toBe("12% of trainers");
	});
	it("floors sub-1% rarities to a <1% label instead of rounding to 0%", () => {
		expect(formatRarityPct(0.004)).toBe("<1% of trainers");
	});
	it("labels exactly zero as not yet earned by anyone", () => {
		expect(formatRarityPct(0)).toBe("Not yet earned by any trainer");
	});
	it("never throws on an out-of-range input (never negative from the API, but defensive)", () => {
		expect(formatRarityPct(-0.1)).toBe("Not yet earned by any trainer");
		expect(formatRarityPct(1)).toBe("100% of trainers");
	});
});

describe("isRareFlex", () => {
	it("is true only when rarity is positive and below the flex threshold", () => {
		expect(isRareFlex(0.03)).toBe(true);
		expect(isRareFlex(RARE_FLEX_THRESHOLD)).toBe(false); // boundary is exclusive
		expect(isRareFlex(0.2)).toBe(false);
		expect(isRareFlex(0)).toBe(false);
	});
});

describe("rankColor", () => {
	it("returns a distinct color for each known rank", () => {
		const known = ["Novice", "Collector", "Ace", "Elite", "Champion", "Master", "Living Legend"];
		const colors = new Set(known.map(rankColor));
		expect(colors.size).toBe(known.length);
	});
	it("returns a stable, defined fallback for an unrecognized rank", () => {
		expect(rankColor("Bogus Rank")).toBe(rankColor("Bogus Rank"));
		expect(typeof rankColor("Bogus Rank")).toBe("string");
	});
});

describe("deriveShowcaseSlots", () => {
	it("maps showcase ids to full ribbon objects, preserving slot order and empty slots", () => {
		const ribbons = [ribbon({ id: "a" }), ribbon({ id: "b" })];
		const slots = deriveShowcaseSlots([null, "a", "b", null, null, null], ribbons);
		expect(slots).toHaveLength(6);
		expect(slots[0]).toBeNull();
		expect(slots[1]?.id).toBe("a");
		expect(slots[2]?.id).toBe("b");
		expect(slots[3]).toBeNull();
	});
	it("never throws on a showcase id with no matching ribbon in the current catalog", () => {
		expect(deriveShowcaseSlots(["missing"], [])).toEqual([null]);
	});
});

describe("nudgePct", () => {
	it("computes a rounded percentage from current/total", () => {
		expect(nudgePct({ progress: { current: 3, total: 4 } })).toBe(75);
	});
	it("never divides by zero", () => {
		expect(nudgePct({ progress: { current: 0, total: 0 } })).toBe(0);
	});
});

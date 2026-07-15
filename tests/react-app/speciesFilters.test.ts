import { describe, expect, it } from "vitest";
import {
	buildSpeciesQueryString,
	hasActiveDexFilters,
	TYPE_ORDER,
} from "../../src/react-app/species/speciesFilters";

describe("buildSpeciesQueryString", () => {
	it("omits defaults (all / dex) and empty type", () => {
		expect(buildSpeciesQueryString({ owned: "all", sort: "dex" })).toBe("");
		expect(buildSpeciesQueryString({ type: "" })).toBe("");
		expect(buildSpeciesQueryString({})).toBe("");
	});

	it("serializes active filters + pagination", () => {
		const p = new URLSearchParams(
			buildSpeciesQueryString({ q: "char", gen: 1, type: "fire", owned: "missing", sort: "name", limit: 60, offset: 120 }),
		);
		expect(p.get("q")).toBe("char");
		expect(p.get("gen")).toBe("1");
		expect(p.get("type")).toBe("fire");
		expect(p.get("owned")).toBe("missing");
		expect(p.get("sort")).toBe("name");
		expect(p.get("limit")).toBe("60");
		expect(p.get("offset")).toBe("120");
	});

	it("emits owned only for owned|missing and sort only for name", () => {
		expect(buildSpeciesQueryString({ owned: "owned" })).toBe("owned=owned");
		expect(new URLSearchParams(buildSpeciesQueryString({ sort: "name" })).get("sort")).toBe("name");
		expect(buildSpeciesQueryString({ sort: "dex", owned: "all" })).toBe("");
	});
});

describe("hasActiveDexFilters", () => {
	it("is false only for the default type/owned/sort", () => {
		expect(hasActiveDexFilters({ type: "", owned: "all", sort: "dex" })).toBe(false);
		expect(hasActiveDexFilters({ type: "fire", owned: "all", sort: "dex" })).toBe(true);
		expect(hasActiveDexFilters({ type: "", owned: "missing", sort: "dex" })).toBe(true);
		expect(hasActiveDexFilters({ type: "", owned: "all", sort: "name" })).toBe(true);
	});
});

describe("TYPE_ORDER re-export", () => {
	it("exposes all 18 canonical types", () => {
		expect(TYPE_ORDER).toHaveLength(18);
		expect(TYPE_ORDER).toContain("fire");
	});
});

import { describe, expect, it } from "vitest";
import {
	GENDER_OPTIONS,
	NAME_PLACEHOLDER,
	avatarUrl,
	initials,
	needsOnboarding,
} from "../../src/react-app/profile/display";

describe("GENDER_OPTIONS", () => {
	it("is exactly Boy/Girl/Ditto, values lowercased", () => {
		expect(GENDER_OPTIONS.map((g) => g.value)).toEqual(["boy", "girl", "ditto"]);
		expect(GENDER_OPTIONS.map((g) => g.label)).toEqual(["Boy", "Girl", "Ditto"]);
	});
});

describe("NAME_PLACEHOLDER", () => {
	it("is a neutral placeholder, never derived from email", () => {
		expect(NAME_PLACEHOLDER).toBe("Trainer");
	});
});

describe("avatarUrl", () => {
	it("builds the profile avatar endpoint URL for a user id", () => {
		expect(avatarUrl("u1")).toBe("/api/profile/avatar/u1");
	});
});

describe("initials", () => {
	it("takes the first letter of the first and last word, uppercased", () => {
		expect(initials("Ash Ketchum")).toBe("AK");
	});
	it("takes just one letter for a single-word name", () => {
		expect(initials("Misty")).toBe("M");
	});
	it("collapses extra whitespace", () => {
		expect(initials("  Ash   Ketchum  ")).toBe("AK");
	});
	it("falls back to ? for null/empty/blank names", () => {
		expect(initials(null)).toBe("?");
		expect(initials("")).toBe("?");
		expect(initials("   ")).toBe("?");
	});
});

describe("needsOnboarding", () => {
	it("is false when signed out", () => {
		expect(needsOnboarding(null)).toBe(false);
	});
	it("is true when displayName or gender (or both) are missing", () => {
		expect(needsOnboarding({ displayName: null, gender: null })).toBe(true);
		expect(needsOnboarding({ displayName: "Ash", gender: null })).toBe(true);
		expect(needsOnboarding({ displayName: null, gender: "boy" })).toBe(true);
	});
	it("is false once both are set", () => {
		expect(needsOnboarding({ displayName: "Ash", gender: "boy" })).toBe(false);
	});
});

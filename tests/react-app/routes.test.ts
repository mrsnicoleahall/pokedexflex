import { describe, expect, it } from "vitest";
import {
	PATHS,
	pathForAccountView,
	publicProfilePath,
	tabForPath,
	showFiltersForPath,
	versusPath,
	leaderboardPath,
} from "../../src/react-app/routes";

describe("PATHS", () => {
	it("defines every existing app view at a stable path", () => {
		expect(PATHS).toEqual({
			home: "/",
			species: "/species",
			events: "/events",
			forms: "/forms",
			collection: "/collection",
			wanted: "/wanted",
			ribbons: "/ribbons",
			progress: "/progress",
			importExport: "/import-export",
			settings: "/settings",
			leaderboard: "/leaderboard",
		});
	});
});

describe("pathForAccountView", () => {
	it("maps each account view to its path", () => {
		expect(pathForAccountView("collection")).toBe("/collection");
		expect(pathForAccountView("wanted")).toBe("/wanted");
		expect(pathForAccountView("ribbons")).toBe("/ribbons");
		expect(pathForAccountView("importExport")).toBe("/import-export");
		expect(pathForAccountView("settings")).toBe("/settings");
	});
});

describe("publicProfilePath", () => {
	it("builds the /u/:handle path", () => {
		expect(publicProfilePath("ash-ketchum")).toBe("/u/ash-ketchum");
	});
});

describe("tabForPath", () => {
	it("maps events/forms to their tabs, 'species' everywhere else", () => {
		expect(tabForPath("/events")).toBe("events");
		expect(tabForPath("/forms")).toBe("forms");
		expect(tabForPath("/species")).toBe("species");
		expect(tabForPath("/")).toBe("species");
		expect(tabForPath("/collection")).toBe("species");
	});
});

describe("showFiltersForPath", () => {
	it("shows the search/gen filters only on the two catalog paths", () => {
		expect(showFiltersForPath("/species")).toBe(true);
		expect(showFiltersForPath("/events")).toBe(true);
		expect(showFiltersForPath("/")).toBe(false);
		expect(showFiltersForPath("/ribbons")).toBe(false);
	});
});

describe("versusPath", () => {
	it("builds the /versus/:a/:b path from two handles", () => {
		expect(versusPath("ash-ketchum", "gary-oak")).toBe("/versus/ash-ketchum/gary-oak");
	});
});

describe("progress path", () => {
	it("exposes PATHS.progress", () => {
		expect(PATHS.progress).toBe("/progress");
	});

	it("maps the 'progress' account view to /progress", () => {
		expect(pathForAccountView("progress")).toBe("/progress");
	});
});

describe("leaderboard path", () => {
	it("exposes PATHS.leaderboard", () => {
		expect(PATHS.leaderboard).toBe("/leaderboard");
	});

	it("leaderboardPath() returns the leaderboard route", () => {
		expect(leaderboardPath()).toBe("/leaderboard");
	});
});

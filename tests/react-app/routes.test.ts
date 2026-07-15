import { describe, expect, it } from "vitest";
import {
	PATHS,
	pathForAccountView,
	publicProfilePath,
	tabForPath,
	showFiltersForPath,
	versusPath,
} from "../../src/react-app/routes";

describe("PATHS", () => {
	it("defines every existing app view at a stable path", () => {
		expect(PATHS).toEqual({
			home: "/",
			species: "/species",
			events: "/events",
			collection: "/collection",
			ribbons: "/ribbons",
			importExport: "/import-export",
			settings: "/settings",
		});
	});
});

describe("pathForAccountView", () => {
	it("maps each account view to its path", () => {
		expect(pathForAccountView("collection")).toBe("/collection");
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
	it("is 'events' only on the events path, 'species' everywhere else", () => {
		expect(tabForPath("/events")).toBe("events");
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

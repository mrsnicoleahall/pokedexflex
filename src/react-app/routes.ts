// src/react-app/routes.ts
//
// DOM-free routing constants + pure path helpers for the client router (Flex
// Phase F). Kept free of React/DOM/api.ts imports so it's unit-testable the
// same way profile/display.ts is (see the BUILD-GATE GOTCHA — tests import
// this, never a component). `AccountView` lives here (not in AccountMenu.tsx)
// so this pure module can own it without pulling a component into the tests.

/** Every existing app view, at a real, stable URL path. */
export const PATHS = {
	home: "/",
	species: "/species",
	events: "/events",
	collection: "/collection",
	ribbons: "/ribbons",
	importExport: "/import-export",
	settings: "/settings",
} as const;

/** The account-menu destinations (unchanged set from Phase P's AccountMenu). */
export type AccountView = "collection" | "ribbons" | "importExport" | "settings";

const ACCOUNT_VIEW_PATHS: Record<AccountView, string> = {
	collection: PATHS.collection,
	ribbons: PATHS.ribbons,
	importExport: PATHS.importExport,
	settings: PATHS.settings,
};

/** Path for an account-menu destination. */
export function pathForAccountView(view: AccountView): string {
	return ACCOUNT_VIEW_PATHS[view];
}

/** Public trainer profile path for a handle. */
export function publicProfilePath(handle: string): string {
	return `/u/${handle}`;
}

/** Which catalog tab a path represents (drives TopBar's tab highlight). */
export function tabForPath(pathname: string): "species" | "events" {
	return pathname === PATHS.events ? "events" : "species";
}

/** Whether the TopBar's search + generation filters apply on this path. */
export function showFiltersForPath(pathname: string): boolean {
	return pathname === PATHS.species || pathname === PATHS.events;
}

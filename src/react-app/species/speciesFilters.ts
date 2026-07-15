// src/react-app/species/speciesFilters.ts
//
// DOM-free filter/sort helpers for the Living Dex (Flex Phase I). Kept free of
// React/DOM/fetch so it's unit-testable the same way versusDisplay.ts /
// statsDisplay.ts are (see the BUILD-GATE split — tests import this, never a
// component). Reuses TYPE_ORDER from versusDisplay.ts rather than redefining
// the 18-type list. `fetchSpecies` (api.ts) delegates its query-string
// building here so the serialization has one tested home.

import { TYPE_ORDER } from "../versus/versusDisplay";

export { TYPE_ORDER };

/** Owned/missing/all catalog filter. Only owned|missing are meaningful server-side. */
export type OwnedFilter = "all" | "owned" | "missing";

/** Catalog sort order. "dex" (id asc) is the server default and never serialized. */
export type SpeciesSort = "dex" | "name";

/** Every param `GET /api/species` understands. `q`/`gen`/`limit`/`offset` are the pre-Phase-I set. */
export type SpeciesQuery = {
	q?: string;
	gen?: number;
	type?: string;
	owned?: OwnedFilter;
	sort?: SpeciesSort;
	limit?: number;
	offset?: number;
};

/**
 * Serializes a species query to a URLSearchParams string, OMITTING inert values
 * so the request URL only carries active filters: empty `type`, `owned==="all"`,
 * and `sort==="dex"` (the server default) are dropped. `owned` is emitted only
 * for "owned"/"missing"; `sort` only for "name".
 */
export function buildSpeciesQueryString(params: SpeciesQuery): string {
	const qs = new URLSearchParams();
	if (params.q) qs.set("q", params.q);
	if (params.gen) qs.set("gen", String(params.gen));
	if (params.type) qs.set("type", params.type);
	if (params.owned === "owned" || params.owned === "missing") qs.set("owned", params.owned);
	if (params.sort === "name") qs.set("sort", params.sort);
	if (params.limit != null) qs.set("limit", String(params.limit));
	if (params.offset != null) qs.set("offset", String(params.offset));
	return qs.toString();
}

/** True when any catalog filter differs from its default — drives the "Clear filters" affordance. */
export function hasActiveDexFilters(f: { type: string; owned: OwnedFilter; sort: SpeciesSort }): boolean {
	return f.type !== "" || f.owned !== "all" || f.sort !== "dex";
}

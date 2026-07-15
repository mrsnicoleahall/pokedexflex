// src/react-app/pages/SpeciesCatalog.tsx

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchSpecies, type SpeciesDto } from "../api";
import { useAuth } from "../auth/AuthProvider";
import { PokemonCard } from "../components/PokemonCard";
import { SignInPanel } from "../components/SignInPanel";
import { SpecimenEditor } from "../collection/SpecimenEditor";
import { TypeIcon } from "../components/TypeIcon";
import { typeColor } from "../theme";
import {
	TYPE_ORDER,
	hasActiveDexFilters,
	type OwnedFilter,
	type SpeciesSort,
} from "../species/speciesFilters";

type SpeciesCatalogProps = {
	q: string;
	gen: number | undefined;
};

/** Page size for the living-dex grid. The worker caps a single page at 200. */
const PAGE_SIZE = 60;

export function SpeciesCatalog({ q, gen }: SpeciesCatalogProps) {
	const { user } = useAuth();
	const [items, setItems] = useState<SpeciesDto[]>([]);
	const [total, setTotal] = useState<number | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	const [loadingMore, setLoadingMore] = useState(false);
	const [refreshKey, setRefreshKey] = useState(0);
	const [signInOpen, setSignInOpen] = useState(false);
	const [addTarget, setAddTarget] = useState<SpeciesDto | null>(null);

	// Catalog-specific filters (species-only, so they live here, not in the TopBar).
	const [type, setType] = useState("");
	const [owned, setOwned] = useState<OwnedFilter>("all");
	const [sort, setSort] = useState<SpeciesSort>("dex");

	const loadingMoreRef = useRef(false);
	const sentinelRef = useRef<HTMLDivElement>(null);

	// The owned/missing filter is only meaningful signed in; never send it signed out.
	const effectiveOwned: OwnedFilter = user ? owned : "all";

	// First page — resets whenever any filter changes (debounced) or a specimen
	// is added (refreshKey). Adding type/owned/sort here is the pagination reset.
	useEffect(() => {
		let cancelled = false;
		const t = setTimeout(() => {
			setLoading(true);
			fetchSpecies({ q, gen, type, owned: effectiveOwned, sort, limit: PAGE_SIZE, offset: 0 })
				.then((r) => {
					if (cancelled) return;
					setItems(r.items);
					setTotal(r.total);
					setError(null);
				})
				.catch((err: unknown) => {
					if (cancelled) return;
					setError(err instanceof Error ? err.message : String(err));
				})
				.finally(() => {
					if (!cancelled) setLoading(false);
				});
		}, 250);
		return () => {
			cancelled = true;
			clearTimeout(t);
		};
	}, [q, gen, type, effectiveOwned, sort, refreshKey]);

	const hasMore = total !== null && items.length < total;

	const loadMore = useCallback(() => {
		if (loadingMoreRef.current || total === null || items.length >= total) return;
		loadingMoreRef.current = true;
		setLoadingMore(true);
		fetchSpecies({ q, gen, type, owned: effectiveOwned, sort, limit: PAGE_SIZE, offset: items.length })
			.then((r) => setItems((prev) => [...prev, ...r.items]))
			.catch(() => {
				/* keep what's loaded; the sentinel stays and can retry on next scroll */
			})
			.finally(() => {
				loadingMoreRef.current = false;
				setLoadingMore(false);
			});
	}, [q, gen, type, effectiveOwned, sort, items.length, total]);

	// Auto-load the next page when the sentinel scrolls into view.
	useEffect(() => {
		if (!hasMore) return;
		const el = sentinelRef.current;
		if (!el) return;
		const io = new IntersectionObserver(
			(entries) => {
				if (entries[0]?.isIntersecting) loadMore();
			},
			{ rootMargin: "600px" },
		);
		io.observe(el);
		return () => io.disconnect();
	}, [hasMore, loadMore]);

	function handleAddClick(species: SpeciesDto) {
		if (!user) {
			setSignInOpen(true);
			return;
		}
		setAddTarget(species);
	}

	const filtersActive = hasActiveDexFilters({ type, owned, sort });
	function clearFilters() {
		setType("");
		setOwned("all");
		setSort("dex");
	}

	return (
		<div className="container page">
			<div className="page__meta">
				<h1 className="page__title">Living Dex</h1>
				{total !== null && !error && (
					<span>
						{items.length < total ? `Showing ${items.length} of ${total}` : `${total} Pokémon`}
					</span>
				)}
			</div>

			<div className="dex-filters" role="group" aria-label="Dex filters">
				<div className="dex-filters__types" role="group" aria-label="Filter by type">
					<button
						type="button"
						className="dex-type-chip"
						aria-pressed={type === ""}
						onClick={() => setType("")}
					>
						All
					</button>
					{TYPE_ORDER.map((t) => (
						<button
							key={t}
							type="button"
							className="dex-type-chip dex-type-chip--icon"
							aria-pressed={type === t}
							aria-label={t}
							title={t}
							onClick={() => setType((cur) => (cur === t ? "" : t))}
						>
							<TypeIcon type={t} color={typeColor(t)} size={20} />
						</button>
					))}
				</div>

				<div className="dex-filters__row">
					{user && (
						<div className="dex-segment" role="group" aria-label="Owned filter">
							{(["all", "owned", "missing"] as const).map((value) => (
								<button
									key={value}
									type="button"
									className="dex-segment__btn"
									aria-pressed={owned === value}
									onClick={() => setOwned(value)}
								>
									{value === "all" ? "All" : value === "owned" ? "Owned" : "Missing"}
								</button>
							))}
						</div>
					)}

					<label className="dex-sort">
						<span className="dex-sort__label">Sort</span>
						<select
							className="select"
							value={sort}
							onChange={(e) => setSort(e.target.value as SpeciesSort)}
							aria-label="Sort species"
						>
							<option value="dex">Dex number</option>
							<option value="name">Name (A–Z)</option>
						</select>
					</label>

					{filtersActive && (
						<button type="button" className="button dex-filters__clear" onClick={clearFilters}>
							Clear filters
						</button>
					)}
				</div>
			</div>

			{error && <p className="error-banner" role="alert">Error: {error}</p>}

			{loading && items.length === 0 && !error && (
				<div className="state">
					<span className="state__title">Loading the dex…</span>
				</div>
			)}

			{!loading && !error && items.length === 0 && (
				<div className="state">
					<span className="state__title">
						{filtersActive ? "No Pokémon match these filters." : "No Pokémon match — try another name."}
					</span>
				</div>
			)}

			{items.length > 0 && (
				<div className="grid">
					{items.map((species) => (
						<PokemonCard key={species.id} species={species} onAdd={() => handleAddClick(species)} />
					))}
				</div>
			)}

			{/* Infinite-scroll sentinel + manual fallback (keyboard/reduced-motion accessible). */}
			{hasMore && (
				<div ref={sentinelRef} className="load-more">
					<button type="button" className="button" onClick={loadMore} disabled={loadingMore}>
						{loadingMore ? "Loading…" : `Load more (${items.length} of ${total})`}
					</button>
				</div>
			)}

			{signInOpen && <SignInPanel onClose={() => setSignInOpen(false)} />}

			{addTarget && (
				<SpecimenEditor
					key={`create-species-${addTarget.id}`}
					mode="create"
					initial={{
						speciesId: addTarget.id,
						speciesName: addTarget.name,
						homeId: addTarget.homeId,
						forms: addTarget.forms,
					}}
					onClose={() => setAddTarget(null)}
					onSaved={() => {
						setAddTarget(null);
						setRefreshKey((k) => k + 1);
					}}
				/>
			)}
		</div>
	);
}

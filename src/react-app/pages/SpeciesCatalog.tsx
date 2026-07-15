// src/react-app/pages/SpeciesCatalog.tsx

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchSpecies, type SpeciesDto } from "../api";
import { useAuth } from "../auth/AuthProvider";
import { PokemonCard } from "../components/PokemonCard";
import { SignInPanel } from "../components/SignInPanel";
import { SpecimenEditor } from "../collection/SpecimenEditor";

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
	const loadingMoreRef = useRef(false);
	const sentinelRef = useRef<HTMLDivElement>(null);

	// First page — resets whenever the search/gen filter changes (debounced) or
	// a specimen is added (refreshKey).
	useEffect(() => {
		let cancelled = false;
		const t = setTimeout(() => {
			setLoading(true);
			fetchSpecies({ q, gen, limit: PAGE_SIZE, offset: 0 })
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
	}, [q, gen, refreshKey]);

	const hasMore = total !== null && items.length < total;

	const loadMore = useCallback(() => {
		if (loadingMoreRef.current || total === null || items.length >= total) return;
		loadingMoreRef.current = true;
		setLoadingMore(true);
		fetchSpecies({ q, gen, limit: PAGE_SIZE, offset: items.length })
			.then((r) => setItems((prev) => [...prev, ...r.items]))
			.catch(() => {
				/* keep what's loaded; the sentinel stays and can retry on next scroll */
			})
			.finally(() => {
				loadingMoreRef.current = false;
				setLoadingMore(false);
			});
	}, [q, gen, items.length, total]);

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

			{error && <p className="error-banner" role="alert">Error: {error}</p>}

			{loading && items.length === 0 && !error && (
				<div className="state">
					<span className="state__title">Loading the dex…</span>
				</div>
			)}

			{!loading && !error && items.length === 0 && (
				<div className="state">
					<span className="state__title">No Pokémon match — try another name.</span>
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

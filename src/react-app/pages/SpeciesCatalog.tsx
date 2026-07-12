// src/react-app/pages/SpeciesCatalog.tsx

import { useEffect, useState } from "react";
import { fetchSpecies, type SpeciesDto } from "../api";
import { useAuth } from "../auth/AuthProvider";
import { PokemonCard } from "../components/PokemonCard";
import { SignInPanel } from "../components/SignInPanel";
import { SpecimenEditor } from "../collection/SpecimenEditor";

type SpeciesCatalogProps = {
	q: string;
	gen: number | undefined;
};

export function SpeciesCatalog({ q, gen }: SpeciesCatalogProps) {
	const { user } = useAuth();
	const [items, setItems] = useState<SpeciesDto[]>([]);
	const [total, setTotal] = useState<number | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	const [refreshKey, setRefreshKey] = useState(0);
	const [signInOpen, setSignInOpen] = useState(false);
	const [addTarget, setAddTarget] = useState<SpeciesDto | null>(null);

	useEffect(() => {
		let cancelled = false;

		const t = setTimeout(() => {
			setLoading(true);
			fetchSpecies({ q, gen })
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
					if (cancelled) return;
					setLoading(false);
				});
		}, 250);

		return () => {
			cancelled = true;
			clearTimeout(t);
		};
	}, [q, gen, refreshKey]);

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
						{total} {total === 1 ? "Pokémon" : "Pokémon"} found
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

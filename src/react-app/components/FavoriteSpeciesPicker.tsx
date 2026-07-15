// src/react-app/components/FavoriteSpeciesPicker.tsx
//
// Lets a user pick up to 3 favorite species for their trainer card. Modeled
// on both existing pickers: SpeciesPicker's debounced `fetchSpecies` search
// (favorites, unlike ribbons, aren't drawn from a fixed "earned" list — any
// species in the dex is eligible) and ShowcasePicker's toggle-and-save
// selection UX. Saves independently of the surrounding form (its own "Save
// favorites" button) since favorites are optional and unrelated to whether
// name+gender pass the onboarding gate.

import { useEffect, useState } from "react";
import { fetchSpecies, setFavoriteSpecies, type FavoriteDto, type SpeciesDto } from "../api";
import { Sprite } from "./Sprite";
import { formatDexNumber, formatName } from "../theme";

const MAX_FAVORITES = 3;

export function FavoriteSpeciesPicker({
	favorites,
	onSaved,
}: {
	favorites: FavoriteDto[];
	onSaved: (favorites: FavoriteDto[]) => void;
}) {
	const [selected, setSelected] = useState<FavoriteDto[]>(favorites);
	const [q, setQ] = useState("");
	const [results, setResults] = useState<SpeciesDto[]>([]);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		setSelected(favorites);
	}, [favorites]);

	useEffect(() => {
		let cancelled = false;
		const t = setTimeout(() => {
			fetchSpecies({ q: q.trim() || undefined })
				.then((r) => {
					if (!cancelled) setResults(r.items.slice(0, 20));
				})
				.catch(() => {
					if (!cancelled) setResults([]);
				});
		}, 200);
		return () => {
			cancelled = true;
			clearTimeout(t);
		};
	}, [q]);

	function toggle(sp: SpeciesDto) {
		setError(null);
		setSelected((prev) => {
			if (prev.some((f) => f.speciesId === sp.id)) return prev.filter((f) => f.speciesId !== sp.id);
			if (prev.length >= MAX_FAVORITES) return prev; // full — ignore extra picks rather than silently evicting one
			return [...prev, { speciesId: sp.id, name: sp.name, homeId: sp.homeId }];
		});
	}

	async function save() {
		setSaving(true);
		setError(null);
		try {
			const result = await setFavoriteSpecies(selected.map((f) => f.speciesId));
			onSaved(result.favorites);
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setSaving(false);
		}
	}

	return (
		<section className="favorites-picker">
			<div className="favorites-picker__header">
				<h2 className="ribbon-section__title">Top 3 favorites</h2>
				<span className="ribbon-section__count">
					{selected.length} / {MAX_FAVORITES}
				</span>
			</div>
			<p className="favorites-picker__hint">Optional — pin up to 3 species to show on your trainer card.</p>
			{error && (
				<p className="error-banner" role="alert">
					Error: {error}
				</p>
			)}
			{selected.length > 0 && (
				<div className="favorites-picker__selected">
					{selected.map((f) => (
						<button
							key={f.speciesId}
							type="button"
							className="favorites-picker__chip"
							onClick={() => setSelected((prev) => prev.filter((x) => x.speciesId !== f.speciesId))}
							aria-label={`Remove ${f.name} from favorites`}
						>
							<Sprite homeId={f.homeId ?? f.speciesId} alt={formatName(f.name)} />
							{formatName(f.name)} ✕
						</button>
					))}
				</div>
			)}
			<label className="field-label" htmlFor="favorites-picker-search">
				Search species
			</label>
			<input
				id="favorites-picker-search"
				className="input input--full"
				type="search"
				placeholder="e.g. Pikachu"
				value={q}
				onChange={(e) => setQ(e.target.value)}
			/>
			<div className="species-picker__list" role="listbox" aria-label="Species results">
				{results.map((sp) => {
					const picked = selected.some((f) => f.speciesId === sp.id);
					return (
						<button
							key={sp.id}
							type="button"
							className={`species-picker__item${picked ? " species-picker__item--picked" : ""}`}
							role="option"
							aria-selected={picked}
							onClick={() => toggle(sp)}
						>
							<Sprite homeId={sp.homeId ?? sp.id} alt={formatName(sp.name)} />
							<span className="species-picker__item-name">{formatName(sp.name)}</span>
							<span className="mono">{formatDexNumber(sp.id)}</span>
						</button>
					);
				})}
			</div>
			<button type="button" className="button button--primary" onClick={save} disabled={saving}>
				{saving ? "Saving…" : "Save favorites"}
			</button>
		</section>
	);
}

// src/react-app/collection/SpeciesPicker.tsx
//
// Lightweight species search modal used by My Collection's "+ Add Pokémon"
// button: search the species catalog inline (reusing the same debounced
// `fetchSpecies` call as SpeciesCatalog) and hand the pick straight to the
// caller, which opens the SpecimenEditor in create mode. Keeps the "add"
// flow inside My Collection instead of navigating away to the dex.

import { useEffect, useState } from "react";
import { fetchSpecies, type SpeciesDto } from "../api";
import { Sprite } from "../components/Sprite";
import { formatDexNumber, formatName } from "../theme";

type SpeciesPickerProps = {
	onPick: (species: SpeciesDto) => void;
	onClose: () => void;
};

export function SpeciesPicker({ onPick, onClose }: SpeciesPickerProps) {
	const [q, setQ] = useState("");
	const [items, setItems] = useState<SpeciesDto[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		function onKeyDown(e: KeyboardEvent) {
			if (e.key === "Escape") onClose();
		}
		document.addEventListener("keydown", onKeyDown);
		return () => document.removeEventListener("keydown", onKeyDown);
	}, [onClose]);

	useEffect(() => {
		let cancelled = false;
		const t = setTimeout(() => {
			setLoading(true);
			fetchSpecies({ q: q.trim() || undefined })
				.then((r) => {
					if (cancelled) return;
					setItems(r.items.slice(0, 30));
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
		}, 200);
		return () => {
			cancelled = true;
			clearTimeout(t);
		};
	}, [q]);

	return (
		<div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
			<div className="modal" role="dialog" aria-modal="true" aria-labelledby="species-picker-title">
				<div className="modal__header">
					<h2 id="species-picker-title" className="modal__title">
						Choose a Pokémon
					</h2>
					<button type="button" className="icon-button" aria-label="Close" onClick={onClose}>
						✕
					</button>
				</div>
				<div className="modal__body">
					<label className="field-label" htmlFor="species-picker-search">
						Search species
					</label>
					<input
						id="species-picker-search"
						className="input input--full"
						type="search"
						autoFocus
						placeholder="e.g. Pikachu"
						value={q}
						onChange={(e) => setQ(e.target.value)}
					/>
					{error && (
						<p className="error-banner" role="alert">
							{error}
						</p>
					)}
					<div className="species-picker__list" role="listbox" aria-label="Species results">
						{loading && items.length === 0 && <p className="settings-section__hint">Searching…</p>}
						{!loading && items.length === 0 && <p className="settings-section__hint">No matches.</p>}
						{items.map((species) => (
							<button
								key={species.id}
								type="button"
								className="species-picker__item"
								role="option"
								aria-selected="false"
								onClick={() => onPick(species)}
							>
								<Sprite homeId={species.homeId ?? species.id} alt={formatName(species.name)} />
								<span className="species-picker__item-name">{formatName(species.name)}</span>
								<span className="mono">{formatDexNumber(species.id)}</span>
							</button>
						))}
					</div>
				</div>
			</div>
		</div>
	);
}

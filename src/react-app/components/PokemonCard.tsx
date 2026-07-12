// src/react-app/components/PokemonCard.tsx

import type { SpeciesDto } from "../api";
import { formatDexNumber, formatName, typeAura } from "../theme";
import { Sprite } from "./Sprite";
import { TypeChip } from "./TypeChip";

export function PokemonCard({ species, onAdd }: { species: SpeciesDto; onAdd?: () => void }) {
	const name = formatName(species.name);
	const homeId = species.homeId ?? species.id;

	return (
		<article className="card card--event" style={{ background: typeAura(species.types) }} tabIndex={0}>
			<span className="card__dexnum">{formatDexNumber(species.id)}</span>
			{species.owned && <span className="card__owned-badge">✓ Owned</span>}
			<Sprite homeId={homeId} alt={name} />
			<h3 className="card__name">{name}</h3>
			<div className="card__chips">
				{species.types.map((type) => (
					<TypeChip key={type} type={type} />
				))}
			</div>
			{onAdd && (
				<button
					type="button"
					className="button button--primary card__add-button"
					onClick={(e) => {
						e.stopPropagation();
						onAdd();
					}}
				>
					＋ Add
				</button>
			)}
		</article>
	);
}

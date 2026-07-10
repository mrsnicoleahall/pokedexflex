// src/react-app/components/PokemonCard.tsx

import type { SpeciesDto } from "../api";
import { formatDexNumber, formatName, typeAura } from "../theme";
import { Sprite } from "./Sprite";
import { TypeChip } from "./TypeChip";

export function PokemonCard({ species }: { species: SpeciesDto }) {
	const name = formatName(species.name);
	const homeId = species.homeId ?? species.id;

	return (
		<article className="card" style={{ background: typeAura(species.types) }} tabIndex={0}>
			<span className="card__dexnum">{formatDexNumber(species.id)}</span>
			<Sprite homeId={homeId} alt={name} />
			<h3 className="card__name">{name}</h3>
			<div className="card__chips">
				{species.types.map((type) => (
					<TypeChip key={type} type={type} />
				))}
			</div>
		</article>
	);
}

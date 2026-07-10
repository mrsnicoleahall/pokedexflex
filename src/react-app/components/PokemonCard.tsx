// src/react-app/components/PokemonCard.tsx

import { useState } from "react";
import type { SpeciesDto } from "../api";
import { formatDexNumber, formatName, spriteUrl, typeAura } from "../theme";
import { TypeChip } from "./TypeChip";

export function PokemonCard({ species }: { species: SpeciesDto }) {
	const name = formatName(species.name);
	const homeId = species.homeId ?? species.id;
	const [loaded, setLoaded] = useState(false);

	return (
		<article className="card" style={{ background: typeAura(species.types) }} tabIndex={0}>
			<span className="card__dexnum">{formatDexNumber(species.id)}</span>
			<div className={`card__sprite-wrap${loaded ? "" : " is-loading"}`}>
				<img
					className={`card__sprite${loaded ? " is-loaded" : ""}`}
					src={spriteUrl(homeId)}
					alt={name}
					loading="lazy"
					width={150}
					height={150}
					onLoad={() => setLoaded(true)}
					onError={() => setLoaded(true)}
				/>
			</div>
			<h3 className="card__name">{name}</h3>
			<div className="card__chips">
				{species.types.map((type) => (
					<TypeChip key={type} type={type} />
				))}
			</div>
		</article>
	);
}

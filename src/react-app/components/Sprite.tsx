// src/react-app/components/Sprite.tsx
//
// Shared HOME sprite tile used by both the species and events cards: a
// fixed-size frame with a shimmering skeleton while the image loads, then a
// fade-in once it resolves (or fails, so we never get stuck loading).

import { useState } from "react";
import { spriteUrl } from "../theme";

type SpriteProps = {
	homeId: number;
	alt: string;
	shiny?: boolean;
};

export function Sprite({ homeId, alt, shiny = false }: SpriteProps) {
	const [loaded, setLoaded] = useState(false);

	return (
		<div className={`card__sprite-wrap${loaded ? "" : " is-loading"}`}>
			<img
				className={`card__sprite${loaded ? " is-loaded" : ""}`}
				src={spriteUrl(homeId, shiny)}
				alt={alt}
				loading="lazy"
				width={150}
				height={150}
				onLoad={() => setLoaded(true)}
				onError={() => setLoaded(true)}
			/>
		</div>
	);
}

// src/react-app/components/FavoritesStrip.tsx
//
// Read-only display of a user's top-3 favorite species (set via
// FavoriteSpeciesPicker in ProfileSetup/Settings) — the "trainer card"
// strip on the signed-in Home dashboard. Renders nothing if the user
// hasn't picked any favorites (they're entirely optional, not a required
// part of onboarding).

import type { FavoriteDto } from "../api";
import { Sprite } from "./Sprite";
import { formatName } from "../theme";

export function FavoritesStrip({ favorites }: { favorites: FavoriteDto[] }) {
	if (favorites.length === 0) return null;
	return (
		<section className="favorites-strip" aria-label="Favorite Pokémon">
			<h2 className="favorites-strip__title">Favorites</h2>
			<div className="favorites-strip__list">
				{favorites.map((f) => (
					<div key={f.speciesId} className="favorites-strip__item">
						<Sprite homeId={f.homeId ?? f.speciesId} alt={formatName(f.name)} />
						<span className="favorites-strip__name">{formatName(f.name)}</span>
					</div>
				))}
			</div>
		</section>
	);
}

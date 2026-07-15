// src/react-app/theme.ts
//
// Design-system tokens shared by the "living dex" UI: the 18 canonical
// Pokémon type colors, small formatting helpers, and the type-aura
// background generator that gives each PokemonCard its identity.

export const TYPE_COLORS: Record<string, string> = {
	normal: "#A0A29F",
	fire: "#FBA54C",
	water: "#539DDF",
	grass: "#5FBD58",
	electric: "#F2D94E",
	ice: "#75D0C1",
	fighting: "#D3425F",
	poison: "#B763CF",
	ground: "#DA7C4D",
	flying: "#A1BBEC",
	psychic: "#FA8581",
	bug: "#92BC2C",
	rock: "#C9BB8A",
	ghost: "#5F6DBC",
	dragon: "#0C69C8",
	dark: "#595761",
	steel: "#5695A3",
	fairy: "#EE90E6",
};

const FALLBACK_TYPE_COLOR = TYPE_COLORS.normal;

/** Look up a type's signature color, falling back to the "normal" gray for unknown types. */
export function typeColor(type: string): string {
	return TYPE_COLORS[type.toLowerCase()] ?? FALLBACK_TYPE_COLOR;
}

/** Path to a type's icon SVG (served from public/types), falling back to "normal" for unknown types. */
export function typeIconUrl(type: string): string {
	const slug = type.toLowerCase();
	return `/types/${slug in TYPE_COLORS ? slug : "normal"}.svg`;
}

/**
 * Turn a PokéAPI-style slug ("charizard-mega-x", "mr-mime") into a
 * title-cased display name ("Charizard Mega X", "Mr Mime").
 */
export function formatName(slug: string): string {
	return slug
		.split("-")
		.filter(Boolean)
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
		.join(" ");
}

/** Zero-pad a dex number to 4 digits for the mono "#0006" display. */
export function formatDexNumber(id: number): string {
	return `#${String(id).padStart(4, "0")}`;
}

/**
 * Build the CSS `background` value for a PokemonCard's type-aura: a soft
 * radial glow using the primary type's color. Dual-type species blend a
 * second radial stop (offset toward the opposite corner) using the
 * secondary type's color, so the card reads as "half fire, half flying"
 * etc. Falls back to the neutral "normal" aura when no types are given.
 */
export function typeAura(types: string[]): string {
	const [primary, secondary] = types;
	const primaryColor = primary ? typeColor(primary) : FALLBACK_TYPE_COLOR;

	if (!secondary) {
		return `radial-gradient(circle at 50% 20%, ${primaryColor}33 0%, ${primaryColor}14 45%, transparent 75%), var(--surface)`;
	}

	const secondaryColor = typeColor(secondary);
	return [
		`radial-gradient(circle at 30% 15%, ${primaryColor}38 0%, ${primaryColor}12 45%, transparent 72%)`,
		`radial-gradient(circle at 75% 60%, ${secondaryColor}30 0%, ${secondaryColor}10 50%, transparent 75%)`,
		"var(--surface)",
	].join(", ");
}

/**
 * Pick a readable text color (near-black or near-white) for text placed on
 * top of a solid `hexColor` fill, using the YIQ perceived-brightness
 * heuristic. Keeps type chips legible regardless of how light or dark a
 * given type's signature color is.
 */
export function getContrastText(hexColor: string): string {
	const hex = hexColor.replace("#", "");
	const r = parseInt(hex.slice(0, 2), 16);
	const g = parseInt(hex.slice(2, 4), 16);
	const b = parseInt(hex.slice(4, 6), 16);
	const yiq = (r * 299 + g * 587 + b * 114) / 1000;
	return yiq >= 150 ? "#14171F" : "#FFFFFF";
}

/**
 * Build a soft, multi-type gradient for large marketing surfaces (the
 * homepage hero) — a wider echo of the per-card `typeAura`, sweeping across
 * several signature type colors instead of blending just one or two, so it
 * reads as "every type welcome here" rather than any one species' aura.
 */
export function heroAura(): string {
	const palette = ["fire", "electric", "grass", "water", "psychic", "dragon"];
	const stops = palette
		.map((type, i) => `${typeColor(type)}2E ${Math.round((i / (palette.length - 1)) * 100)}%`)
		.join(", ");
	return `linear-gradient(120deg, ${stops}), var(--surface)`;
}

/** Build the URL for our own lazy-cached HOME sprite proxy route. */
export function spriteUrl(homeId: number, shiny = false): string {
	return shiny ? `/sprites/home/shiny/${homeId}` : `/sprites/home/${homeId}`;
}

/**
 * URL for a HOME 3D sprite by key — a numeric national id OR a form slug
 * ("669-blue", "666-icy-snow"). HOME renders exist for cosmetic variants under
 * these slugs, so the Forms gallery can show 3D instead of the 2D sprite.
 */
export function homeSpriteUrl(key: string | number): string {
	return `/sprites/home/${key}`;
}

/**
 * URL for an alternate-form sprite (Forms gallery) via the 2D-default-set
 * proxy route. `slug` is the PokeAPI sprite filename stem (e.g. "666-icy-snow").
 * Used only as a fallback when no HOME render exists.
 */
export function formSpriteUrl(slug: string): string {
	return `/sprites/form/${slug}`;
}

// src/react-app/theme.ts
//
// Design-system tokens shared by the "living dex" UI: the 18 canonical
// Pokémon type colors, small formatting helpers, and the type-aura
// background generator that gives each PokemonCard its identity.

export const TYPE_COLORS: Record<string, string> = {
	normal: "#9AA3AF",
	fire: "#FF7A3C",
	water: "#3E9BFF",
	grass: "#3FBF6F",
	electric: "#F6C64B",
	ice: "#67D2E0",
	fighting: "#E0603E",
	poison: "#B463D6",
	ground: "#E0B24A",
	flying: "#8FB7FF",
	psychic: "#FF6DA6",
	bug: "#96C22E",
	rock: "#C9B472",
	ghost: "#7A6BC4",
	dragon: "#6A5BE0",
	dark: "#5A5566",
	steel: "#7F99B0",
	fairy: "#F49AE0",
};

const FALLBACK_TYPE_COLOR = TYPE_COLORS.normal;

/** Look up a type's signature color, falling back to the "normal" gray for unknown types. */
export function typeColor(type: string): string {
	return TYPE_COLORS[type.toLowerCase()] ?? FALLBACK_TYPE_COLOR;
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

/** Build the URL for our own lazy-cached HOME sprite proxy route. */
export function spriteUrl(homeId: number, shiny = false): string {
	return shiny ? `/sprites/home/shiny/${homeId}` : `/sprites/home/${homeId}`;
}

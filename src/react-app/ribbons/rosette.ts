// The one rosette geometry, recolored at runtime: its three pleat fills
// become CSS variables so any base color yields an on-brand rosette. The
// gold inner ring and white center stay fixed. Raw SVG imported as a string.
import rawRosette from "./rosette.svg?raw";

/** Swap the 3 pleat hexes for CSS vars; leave gold ring (#fdf37a) + white (#fff) alone. */
export function transformRosette(raw: string): string {
	// `.replace(/.../g, ...)` instead of `.replaceAll` — the project's tsconfig
	// targets ES2020 (lib doesn't include `String.prototype.replaceAll`,
	// added in ES2021); a global regex is the ES2020-safe equivalent.
	return raw
		.replace(/#e4007f/g, "var(--r-main)")
		.replace(/#f92891/g, "var(--r-mid)")
		.replace(/#ff9fd4/g, "var(--r-light)");
}

export const ROSETTE_MARKUP = transformRosette(rawRosette);

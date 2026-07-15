// src/react-app/versus/versusDisplay.ts
//
// DOM-free display helpers for the Versus page (Flex Phase G). Kept free of
// React/DOM/api.ts imports so it's unit-testable the same way
// incentiveDisplay.ts / routes.ts are (see the BUILD-GATE split — tests import
// this, never a component).

/** The 18 canonical Pokémon types, in the palette's documented order. */
export const TYPE_ORDER: readonly string[] = [
	"normal", "fire", "water", "electric", "grass", "ice",
	"fighting", "poison", "ground", "flying", "psychic", "bug",
	"rock", "ghost", "dragon", "dark", "steel", "fairy",
];

/** Generations 1..9, for the per-generation breakdown. */
export const GEN_ORDER: readonly number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9];

/** Formats a round's raw value for display — a percent round is a 0..1 fraction shown as a whole %. */
export function formatRoundValue(format: "int" | "percent", value: number): string {
	if (format === "percent") return `${Math.round(value * 100)}%`;
	return String(value);
}

/** Bar widths (0..100) for a two-sided comparison: larger side fills the bar, the other is proportional. */
export function barPercents(a: number, b: number): { a: number; b: number } {
	const max = Math.max(a, b);
	if (max <= 0) return { a: 0, b: 0 };
	return { a: Math.round((a / max) * 100), b: Math.round((b / max) * 100) };
}

export type BreakdownRow = { key: string; label: string; a: number; b: number };

/**
 * Builds diverging-breakdown rows over a fixed key order (types or gens),
 * reading each side's sparse count map (missing = 0) and dropping any row
 * where both sides own nothing.
 */
export function buildBreakdown(
	order: readonly (string | number)[],
	a: Record<string, number>,
	b: Record<string, number>,
): BreakdownRow[] {
	const rows: BreakdownRow[] = [];
	for (const k of order) {
		const key = String(k);
		const av = a[key] ?? 0;
		const bv = b[key] ?? 0;
		if (av === 0 && bv === 0) continue;
		rows.push({ key, label: key, a: av, b: bv });
	}
	return rows;
}

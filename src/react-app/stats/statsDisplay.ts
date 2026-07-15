// src/react-app/stats/statsDisplay.ts
//
// DOM-free display/math helpers for the Progress page (Flex Phase H). Kept
// free of React/DOM/api.ts imports so it's unit-testable the same way
// incentiveDisplay.ts / versusDisplay.ts are (see the BUILD-GATE split — tests
// import this, never a component). Reuses TYPE_ORDER/GEN_ORDER from
// versusDisplay.ts rather than redefining the palette/gen order.

import { TYPE_ORDER, GEN_ORDER } from "../versus/versusDisplay";

export { TYPE_ORDER, GEN_ORDER };

/** Renders a 0..1 completion fraction as a whole percent, e.g. 0.5 → "50%". */
export function formatPct(fraction: number): string {
	return `${Math.round(fraction * 100)}%`;
}

/** Progress-bar width (0..100), clamped; 0 when there is nothing to complete. */
export function barPct(owned: number, total: number): number {
	if (total <= 0) return 0;
	return Math.min(100, Math.round((owned / total) * 100));
}

export type CompletionRow = { key: string; label: string; owned: number; total: number; pct: number };

/**
 * Builds owned/total completion rows over a fixed key order (types or gens),
 * reading each side's sparse count map (missing owned = 0) and dropping any key
 * with no reference total (so, e.g., a type absent from the dex never renders).
 */
export function buildCompletionRows(
	order: readonly (string | number)[],
	owned: Record<string, number>,
	total: Record<string, number>,
): CompletionRow[] {
	const rows: CompletionRow[] = [];
	for (const k of order) {
		const key = String(k);
		const t = total[key] ?? 0;
		if (t <= 0) continue;
		const o = owned[key] ?? 0;
		rows.push({ key, label: key, owned: o, total: t, pct: t > 0 ? o / t : 0 });
	}
	return rows;
}

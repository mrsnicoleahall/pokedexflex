// src/react-app/ribbons/incentiveDisplay.ts
//
// Pure, display-only helpers for the Phase E incentive UI: rarity-%
// formatting, the "rare flex" threshold, a presentational rank→color
// lookup, showcase-slot derivation, and nudge progress math. No fetch, no
// DOM, no React — kept separate from the components so it can be
// unit-tested directly (there is no React component-test harness in this
// repo; see tests/react-app/incentiveDisplay.test.ts).
//
// Trainer Score and rank THEMSELVES are never recomputed here — they come
// verbatim from the API (src/worker/ribbons/scoring.ts is the single source
// of truth). `rankColor` only maps an already-known rank title to a display
// color; it has no opinion on score thresholds.

import type { RibbonDto } from "../api";

/** Rarities below this (but above zero) get a "rare flex" highlight on an earned card. */
export const RARE_FLEX_THRESHOLD = 0.05;

/** Human-readable rarity line for a ribbon card, e.g. "12% of trainers". */
export function formatRarityPct(rarityPct: number): string {
	if (rarityPct <= 0) return "Not yet earned by any trainer";
	const pct = Math.round(rarityPct * 100);
	if (pct < 1) return "<1% of trainers";
	return `${Math.min(pct, 100)}% of trainers`;
}

/** True when a ribbon is rare enough (but actually earned by someone) to merit a "flex" highlight. */
export function isRareFlex(rarityPct: number): boolean {
	return rarityPct > 0 && rarityPct < RARE_FLEX_THRESHOLD;
}

/** Presentational rank → accent color, reusing hues from the documented type palette (theme.ts). */
const RANK_COLORS: Record<string, string> = {
	Novice: "#8a94a6",
	Collector: "#5FBD58",
	Ace: "#539DDF",
	Elite: "#B763CF",
	Champion: "#FBA54C",
	Master: "#5F6DBC",
	"Living Legend": "#F2D94E",
};

/** Fallback for any rank title not in `RANK_COLORS` (should not happen against the real catalog, but never throws). */
const DEFAULT_RANK_COLOR = "#8a94a6";

/** Maps a rank title (from the API's `rank` field) to a display accent color. Presentational only — never re-derives rank from score. */
export function rankColor(rank: string): string {
	return RANK_COLORS[rank] ?? DEFAULT_RANK_COLOR;
}

/**
 * Maps the API's 6-slot `showcase` (ribbon ids, `null` for empty) onto full
 * `RibbonDto` objects for display, preserving slot order/length exactly.
 * An id with no matching ribbon in the current catalog (stale/renamed id)
 * resolves to `null` for that slot rather than throwing.
 */
export function deriveShowcaseSlots(showcase: (string | null)[], ribbons: RibbonDto[]): (RibbonDto | null)[] {
	const byId = new Map(ribbons.map((r) => [r.id, r] as const));
	return showcase.map((id) => (id ? (byId.get(id) ?? null) : null));
}

/** Rounded completion percentage for a nudge's progress bar; never divides by zero. */
export function nudgePct(ribbon: { progress: { current: number; total: number } }): number {
	return ribbon.progress.total > 0 ? Math.round((ribbon.progress.current / ribbon.progress.total) * 100) : 0;
}

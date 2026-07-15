# Flex Phase E — Ribbon Incentive UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface the Phase D incentive backend in the UI — Trainer Score + rank, rarity % on cards, an earn-moment celebration, a showcase picker + trophy wall, and "closest to earning" nudges — across the Ribbons page and the signed-in dashboard (Home), without touching the worker or the `api.ts` response shapes.

**Architecture:** Phase D already extended `GET /api/ribbons` with `points`/`rarityPct`/`newlyEarned` per ribbon and `trainerScore`/`rank`/`showcase`/`nearest` on the response (`src/react-app/api.ts`, already committed — read, do not modify). Phase E is **client-only**: a small pure-formatting module (`src/react-app/ribbons/incentiveDisplay.ts`), one shared data hook (`src/react-app/ribbons/useRibbonsData.ts`) that both `Ribbons.tsx` and `Home.tsx` consume, and five small presentational components (`RankBadge`, `EarnMomentToast`, `ShowcasePicker`, `TrophyWall`, `NudgeList`) that all reuse the existing `RibbonIcon` for ribbon visuals. No new API calls beyond the three already exposed by `api.ts` (`fetchRibbons`, `setRibbonShowcase`, `ackRibbonsSeen`).

**Tech Stack:** Vite + React + TypeScript client only for this phase (no worker/D1 changes). Vitest (Workers pool) for the pure helpers only — there is no React component-test harness, so components are verified via `npx tsc -b`, `npm run build`, and a controller browser pass. Depends on Phase D (incentive backend + extended `api.ts`) being in place.

## Global Constraints

- **Client-only; API is frozen.** Do **not** modify `src/worker/**` or the shapes exported from `src/react-app/api.ts` (`RibbonDto`, `RibbonsResponse`, `setRibbonShowcase`, `ackRibbonsSeen`). You may add new client-only modules, components, and CSS.
- **No React component-test harness.** Vitest here runs the Workers pool (pure/worker tests only — see `vitest.config.ts`). TDD any **pure** helper introduced in this phase (`src/react-app/ribbons/incentiveDisplay.ts`) in `tests/react-app/*.test.ts`. Verify every **component** change with `npx tsc -b` + `npm run build`, then a controller browser pass — never by trying to unit-test a component, and never by starting a dev server.
- **Reuse `RibbonIcon` for every ribbon visual.** The earn-moment toast, showcase picker, trophy wall, and nudge list all render ribbons via `<RibbonIcon ribbon={{ id, category }} .../>` — never a raw emoji or a new icon path.
- **No duplicated point/rank math on the client.** `trainerScore` and `rank` are read verbatim from the API response (`useRibbonsData`). The only client-side rank logic is a **presentational** rank→color lookup (`rankColor` in `incentiveDisplay.ts`) — it must not re-derive rank from score (that stays server-side in `src/worker/ribbons/scoring.ts`).
- **Match existing CSS conventions.** Extend `src/react-app/styles.css` using the established tokens (`--surface`, `--hairline`, `--ink`, `--muted`, `--radius-card`, `--font-display`, `--font-mono`, `--shadow-card-rest`) and existing class-naming style (`.block__element`, `.block--modifier`), the same way `.ribbon-card`/`.ribbons-summary` are structured. No hardcoded light/dark-unsafe colors — reuse `color-mix(in srgb, <token> <pct>%, ...)` the way `.ribbon-card--earned`'s accent gradient and `.error-banner` already do.
- **Accessible by construction.** Every interactive control (showcase toggle buttons, dismiss button) has an `aria-label` or visible text; every progress bar keeps the existing `role="progressbar"` + `aria-valuenow/min/max` pattern from `Ribbons.tsx`; the earn-moment toast carries `role="alertdialog"` + `aria-live="assertive"` so screen readers announce it once, not per-render.
- **Logged-out safe.** `Ribbons.tsx` already renders the full (all-locked) catalog for signed-out visitors — keep that. `Home.tsx`'s new dashboard elements (rank badge, trophy wall, nudges) render only inside the existing `{user && ...}` branch; signed-out `Home` is unchanged (hero pitch + sign-in nudge, no crash, no extra fetch cost beyond what `Ribbons.tsx` already pays).
- **Earn-moment must not spam.** `newlyEarned` ribbons are shown **once** per batch, then `ackRibbonsSeen()` fires and the local state is optimistically cleared so a re-render (or a second mount on the other page) never re-shows the same ribbons. If the ack request fails, retry is allowed on the next natural refetch (don't silently drop the flag forever).
- **Determinism.** `deriveShowcaseSlots` always returns exactly `showcase.length` entries in the same order (never re-sorts, never drops a slot), and never throws on a showcase id that doesn't match any ribbon in the current catalog (returns `null` for that slot instead).

---

### Task E1: Pure incentive-display helpers (`incentiveDisplay.ts`)

**Files:**
- Create: `src/react-app/ribbons/incentiveDisplay.ts`
- Test: `tests/react-app/incentiveDisplay.test.ts`

**Interfaces:**
- Produces: `formatRarityPct(rarityPct: number): string`, `RARE_FLEX_THRESHOLD: number`, `isRareFlex(rarityPct: number): boolean`, `rankColor(rank: string): string`, `deriveShowcaseSlots(showcase: (string | null)[], ribbons: RibbonDto[]): (RibbonDto | null)[]`, `nudgePct(ribbon: { progress: { current: number; total: number } }): number`.
- Consumes: `RibbonDto` (type-only import from `../api`). No fetch, no DOM, no React — this module is pure data-in/data-out, mirroring how `src/worker/ribbons/scoring.ts` stays pure on the server side.

- [ ] **Step 1: Write the failing tests**

Create `tests/react-app/incentiveDisplay.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
	formatRarityPct,
	RARE_FLEX_THRESHOLD,
	isRareFlex,
	rankColor,
	deriveShowcaseSlots,
	nudgePct,
} from "../../src/react-app/ribbons/incentiveDisplay";
import type { RibbonDto } from "../../src/react-app/api";

function ribbon(overrides: Partial<RibbonDto> = {}): RibbonDto {
	return {
		id: "x",
		name: "X",
		description: "d",
		category: "Fun",
		earned: false,
		progress: { current: 0, total: 1 },
		points: 5,
		rarityPct: 0,
		newlyEarned: false,
		...overrides,
	};
}

describe("formatRarityPct", () => {
	it("formats a normal percentage rounded to the nearest integer", () => {
		expect(formatRarityPct(0.123)).toBe("12% of trainers");
	});
	it("floors sub-1% rarities to a <1% label instead of rounding to 0%", () => {
		expect(formatRarityPct(0.004)).toBe("<1% of trainers");
	});
	it("labels exactly zero as not yet earned by anyone", () => {
		expect(formatRarityPct(0)).toBe("Not yet earned by any trainer");
	});
	it("never throws on an out-of-range input (never negative from the API, but defensive)", () => {
		expect(formatRarityPct(-0.1)).toBe("Not yet earned by any trainer");
		expect(formatRarityPct(1)).toBe("100% of trainers");
	});
});

describe("isRareFlex", () => {
	it("is true only when rarity is positive and below the flex threshold", () => {
		expect(isRareFlex(0.03)).toBe(true);
		expect(isRareFlex(RARE_FLEX_THRESHOLD)).toBe(false); // boundary is exclusive
		expect(isRareFlex(0.2)).toBe(false);
		expect(isRareFlex(0)).toBe(false);
	});
});

describe("rankColor", () => {
	it("returns a distinct color for each known rank", () => {
		const known = ["Novice", "Collector", "Ace", "Elite", "Champion", "Master", "Living Legend"];
		const colors = new Set(known.map(rankColor));
		expect(colors.size).toBe(known.length);
	});
	it("returns a stable, defined fallback for an unrecognized rank", () => {
		expect(rankColor("Bogus Rank")).toBe(rankColor("Bogus Rank"));
		expect(typeof rankColor("Bogus Rank")).toBe("string");
	});
});

describe("deriveShowcaseSlots", () => {
	it("maps showcase ids to full ribbon objects, preserving slot order and empty slots", () => {
		const ribbons = [ribbon({ id: "a" }), ribbon({ id: "b" })];
		const slots = deriveShowcaseSlots([null, "a", "b", null, null, null], ribbons);
		expect(slots).toHaveLength(6);
		expect(slots[0]).toBeNull();
		expect(slots[1]?.id).toBe("a");
		expect(slots[2]?.id).toBe("b");
		expect(slots[3]).toBeNull();
	});
	it("never throws on a showcase id with no matching ribbon in the current catalog", () => {
		expect(deriveShowcaseSlots(["missing"], [])).toEqual([null]);
	});
});

describe("nudgePct", () => {
	it("computes a rounded percentage from current/total", () => {
		expect(nudgePct({ progress: { current: 3, total: 4 } })).toBe(75);
	});
	it("never divides by zero", () => {
		expect(nudgePct({ progress: { current: 0, total: 0 } })).toBe(0);
	});
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/react-app/incentiveDisplay.test.ts`
Expected: FAIL — `src/react-app/ribbons/incentiveDisplay.ts` doesn't exist yet.

- [ ] **Step 3: Implement `incentiveDisplay.ts`**

Create `src/react-app/ribbons/incentiveDisplay.ts`:

```ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/react-app/incentiveDisplay.test.ts`
Expected: PASS (12 tests).

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc -b`
Expected: clean (no consumers yet, so this only checks the new module + test file compile).

```bash
git add src/react-app/ribbons/incentiveDisplay.ts tests/react-app/incentiveDisplay.test.ts
git commit -m "feat(flex-E): pure incentive-display helpers (rarity%, rare-flex, rank color, showcase slots, nudge pct)"
```

---

### Task E2: Shared `useRibbonsData` hook + `RankBadge` (Ribbons header + Home summary)

Both `Ribbons.tsx` and `Home.tsx` need the same `GET /api/ribbons` payload (ribbons, `trainerScore`, `rank`, `showcase`, `nearest`, plus the newly-earned diff). Rather than duplicate the fetch/effect/ack bookkeeping on both pages, extract it once into a hook.

**Files:**
- Create: `src/react-app/ribbons/useRibbonsData.ts`
- Create: `src/react-app/components/RankBadge.tsx`
- Modify: `src/react-app/pages/Ribbons.tsx` (replace the local `fetchRibbons` `useEffect` with the hook; add `RankBadge` to the page header)
- Modify: `src/react-app/pages/Home.tsx` (call the hook; add a rank/score line to the signed-in welcome block)
- Modify: `src/react-app/styles.css` (`.rank-badge` + modifiers)

**Interfaces:**
- Produces (`useRibbonsData`): `{ ribbons, earnedCount, total, trainerScore, rank, showcase, nearest, newlyEarned, loading, error, refetch, ackSeen }`. `newlyEarned` is derived client-side as `ribbons.filter(r => r.newlyEarned)` (no separate request). `ackSeen()` calls `ackRibbonsSeen()` once per batch (guarded so a re-render can't double-fire) and optimistically clears `newlyEarned` in local state; `refetch()` re-runs the fetch (used after showcase edits in Task E5).
- Consumes: `fetchRibbons`, `ackRibbonsSeen`, `RibbonDto`, `RibbonsResponse` (`../api`); `useAuth` (`../auth/AuthProvider`) so the fetch re-runs on sign-in/out, matching the existing `Ribbons.tsx` behavior.
- Produces (`RankBadge`): a presentational `{ trainerScore: number; rank: string; size?: "sm" | "md" }` component using `rankColor` (Task E1).

- [ ] **Step 1: Implement the hook**

Create `src/react-app/ribbons/useRibbonsData.ts`:

```ts
// src/react-app/ribbons/useRibbonsData.ts
//
// Shared data hook for the Phase E incentive UI: fetches GET /api/ribbons
// once and exposes the full response plus the newly-earned diff and an ack
// helper. Both Ribbons.tsx and Home.tsx consume this instead of each
// re-implementing the fetch/effect/ack bookkeeping. Re-fetches on sign-in/
// out (same dependency the original Ribbons.tsx effect used) and exposes
// `refetch` for callers that mutate server state out-of-band (the showcase
// picker, Task E5).

import { useCallback, useEffect, useRef, useState } from "react";
import { ackRibbonsSeen, fetchRibbons, type RibbonDto, type RibbonsResponse } from "../api";
import { useAuth } from "../auth/AuthProvider";

const SHOWCASE_SLOTS_FALLBACK = 6;

const EMPTY_RESPONSE: RibbonsResponse = {
	ribbons: [],
	earnedCount: 0,
	total: 0,
	trainerScore: 0,
	rank: "Novice",
	showcase: new Array(SHOWCASE_SLOTS_FALLBACK).fill(null),
	nearest: [],
};

export type RibbonsData = {
	ribbons: RibbonDto[];
	earnedCount: number;
	total: number;
	trainerScore: number;
	rank: string;
	showcase: (string | null)[];
	nearest: RibbonDto[];
	/** Earned-but-not-yet-acked ribbons from this fetch; drives the earn-moment toast (Task E4). */
	newlyEarned: RibbonDto[];
	loading: boolean;
	error: string | null;
	/** Re-runs the GET /api/ribbons fetch (e.g. after the showcase picker saves). */
	refetch: () => void;
	/** Acks all outstanding earn moments once; safe to call multiple times (no-ops after the first per batch, or once newlyEarned is empty). */
	ackSeen: () => Promise<void>;
};

export function useRibbonsData(): RibbonsData {
	const { user } = useAuth();
	const [data, setData] = useState<RibbonsResponse>(EMPTY_RESPONSE);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [reloadToken, setReloadToken] = useState(0);
	const ackedRef = useRef(false);

	useEffect(() => {
		let cancelled = false;
		setLoading(true);
		ackedRef.current = false; // a fresh fetch may carry a new batch of newlyEarned ids
		fetchRibbons()
			.then((r) => {
				if (cancelled) return;
				setData(r);
				setError(null);
			})
			.catch((err: unknown) => {
				if (cancelled) return;
				setError(err instanceof Error ? err.message : String(err));
			})
			.finally(() => {
				if (cancelled) return;
				setLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [user, reloadToken]);

	const newlyEarned = data.ribbons.filter((r) => r.newlyEarned);

	const ackSeen = useCallback(async () => {
		if (ackedRef.current) return;
		if (newlyEarned.length === 0) return;
		ackedRef.current = true;
		try {
			await ackRibbonsSeen();
			setData((d) => ({
				...d,
				ribbons: d.ribbons.map((r) => (r.newlyEarned ? { ...r, newlyEarned: false } : r)),
			}));
		} catch {
			// Let the next natural refetch retry — don't strand the user with a toast that can never be dismissed.
			ackedRef.current = false;
		}
	}, [newlyEarned.length]);

	return {
		ribbons: data.ribbons,
		earnedCount: data.earnedCount,
		total: data.total,
		trainerScore: data.trainerScore,
		rank: data.rank,
		showcase: data.showcase,
		nearest: data.nearest,
		newlyEarned,
		loading,
		error,
		refetch: () => setReloadToken((t) => t + 1),
		ackSeen,
	};
}
```

- [ ] **Step 2: Implement `RankBadge`**

Create `src/react-app/components/RankBadge.tsx`:

```tsx
// src/react-app/components/RankBadge.tsx
//
// Compact Trainer Score + rank display, reused on the Ribbons page header
// and the signed-in Home dashboard. Purely presentational — reads
// `trainerScore`/`rank` verbatim from useRibbonsData; never recomputes rank.
import { rankColor } from "../ribbons/incentiveDisplay";

export function RankBadge({
	trainerScore,
	rank,
	size = "md",
}: {
	trainerScore: number;
	rank: string;
	size?: "sm" | "md";
}) {
	const color = rankColor(rank);
	return (
		<div className={`rank-badge rank-badge--${size}`} style={{ borderColor: color }}>
			<span className="rank-badge__rank" style={{ color }}>
				{rank}
			</span>
			<span className="rank-badge__score">
				{trainerScore.toLocaleString()} <small>pts</small>
			</span>
		</div>
	);
}
```

- [ ] **Step 3: Wire the hook + badge into `Ribbons.tsx`**

In `src/react-app/pages/Ribbons.tsx`, replace the local `useState`/`useEffect` fetch (the `ribbons`/`earnedCount`/`total`/`loading`/`error` state and its effect) with the shared hook:

```tsx
import { useMemo } from "react";
import { useRibbonsData } from "../ribbons/useRibbonsData";
import { RankBadge } from "../components/RankBadge";
// (drop the old `fetchRibbons`/`useEffect`/`useState` imports for this data; keep `useMemo`)
```

```tsx
export function Ribbons() {
	const { user } = useAuth();
	const { ribbons, earnedCount, total, trainerScore, rank, loading, error } = useRibbonsData();

	const grouped = useMemo(() => {
		// ...unchanged body...
	}, [ribbons]);

	const overallPct = total > 0 ? Math.round((earnedCount / total) * 100) : 0;

	return (
		<div className="container page">
			<div className="page__meta">
				<h1 className="page__title">Ribbons</h1>
				{user && <RankBadge trainerScore={trainerScore} rank={rank} />}
			</div>
			{/* ...unchanged below... */}
```

(The rest of the component — error banner, loading/empty states, `ribbons-summary`, `RibbonSection` map — is unchanged; only the data source and the header line change. `showcase`/`nearest`/`newlyEarned`/`refetch`/`ackSeen` from the hook are wired in Tasks E4–E5.)

- [ ] **Step 4: Wire the hook + badge into `Home.tsx`**

In `src/react-app/pages/Home.tsx`, add the hook (called unconditionally — hooks can't be conditional — but its output is only rendered inside the existing `user` branch, so signed-out visitors pay no new fetch cost beyond what `Ribbons.tsx` already does):

```tsx
import { useRibbonsData } from "../ribbons/useRibbonsData";
import { RankBadge } from "../components/RankBadge";
```

```tsx
export function Home({ onBrowse, onNavigate }: HomeProps) {
	const { user } = useAuth();
	const [signInOpen, setSignInOpen] = useState(false);
	const { trainerScore, rank } = useRibbonsData();

	return (
		<div className="container page">
			<section className="hero" style={{ background: heroAura() }}>
				{user ? (
					<div className="hero__welcome">
						<p className="hero__eyebrow">Welcome back</p>
						<h1 className="hero__title hero__title--slim">{user.displayName ?? user.email}</h1>
						<RankBadge trainerScore={trainerScore} rank={rank} size="sm" />
						<div className="hero__actions">
							{/* ...unchanged My Collection / Ribbons buttons... */}
						</div>
					</div>
				) : (
					/* ...unchanged signed-out hero__intro... */
				)}
			</section>
			{signInOpen && <SignInPanel onClose={() => setSignInOpen(false)} />}
			{/* Trophy wall + nudges land here in Tasks E5–E6, inside `{user && (...)}`. */}
		</div>
	);
}
```

- [ ] **Step 5: Add `.rank-badge` styles**

Append to `src/react-app/styles.css`:

```css
.rank-badge {
	display: inline-flex;
	align-items: center;
	gap: 10px;
	padding: 6px 14px;
	border: 1px solid var(--hairline);
	border-radius: 999px;
	background: var(--surface);
	box-shadow: var(--shadow-card-rest);
}

.rank-badge--sm {
	padding: 4px 10px;
	gap: 8px;
}

.rank-badge__rank {
	font-family: var(--font-display);
	font-weight: 700;
	font-size: 0.85rem;
}

.rank-badge--sm .rank-badge__rank {
	font-size: 0.78rem;
}

.rank-badge__score {
	font-family: var(--font-mono);
	font-size: 0.8rem;
	color: var(--muted);
	white-space: nowrap;
}

.rank-badge__score small {
	font-size: 0.72rem;
}

.page__meta {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	flex-wrap: wrap;
}
```

(`.page__meta` already exists as a flex container per the current `Ribbons.tsx` markup — this rule just makes the title and the new badge sit on one row with space between them; if `.page__meta` is already defined elsewhere in `styles.css` with different rules, merge into the existing block instead of duplicating the selector.)

- [ ] **Step 6: Verify**

Run: `npx tsc -b && npm run build`
Expected: clean typecheck; build succeeds.

- [ ] **Step 7: Controller browser review**

On the Ribbons page (signed in), confirm a rank/score pill appears next to the "Ribbons" title. On Home (signed in), confirm the same pill (small size) appears under the display name. Signed-out: Home shows the original pitch only, no badge, no console errors. Check both light and dark themes.

```bash
git add src/react-app/ribbons/useRibbonsData.ts src/react-app/components/RankBadge.tsx src/react-app/pages/Ribbons.tsx src/react-app/pages/Home.tsx src/react-app/styles.css
git commit -m "feat(flex-E): shared useRibbonsData hook + RankBadge on Ribbons header and Home dashboard"
```

---

### Task E3: Rarity % + rare-flex highlight on ribbon cards

**Files:**
- Modify: `src/react-app/pages/Ribbons.tsx` (`RibbonCard`: render `formatRarityPct(ribbon.rarityPct)`; add the rare-flex modifier class on earned+rare cards)
- Modify: `src/react-app/styles.css` (`.ribbon-card__rarity`, `.ribbon-card--rare-flex`)

**Interfaces:**
- Consumes: `ribbon.rarityPct` (already on `RibbonDto` from Phase D — no API change); `formatRarityPct`, `isRareFlex` (Task E1).
- Produces: every ribbon card (earned or locked, non-hidden-secret) shows a rarity line; earned + rare (`isRareFlex(ribbon.rarityPct)`) cards get a `ribbon-card--rare-flex` class for a subtle glow/border treatment.

- [ ] **Step 1: Implement in `RibbonCard`**

In `src/react-app/pages/Ribbons.tsx`, import the two helpers:

```tsx
import { formatRarityPct, isRareFlex } from "../ribbons/incentiveDisplay";
```

Update the earned branch of `RibbonCard` to add the rare-flex class and a rarity line:

```tsx
	if (ribbon.earned) {
		const accent = ribbonAccentColor(ribbon);
		const rareFlex = isRareFlex(ribbon.rarityPct);
		return (
			<article
				className={`ribbon-card ribbon-card--earned${rareFlex ? " ribbon-card--rare-flex" : ""}`}
				style={{
					background: `linear-gradient(135deg, ${accent}4D 0%, ${accent}1F 55%, transparent 100%), var(--surface)`,
					borderColor: `color-mix(in srgb, ${accent} 55%, var(--hairline))`,
				}}
			>
				<div className="ribbon-card__icon">
					<RibbonIcon ribbon={{ id: ribbon.id, category: ribbon.category }} size={72} />
				</div>
				<span className="ribbon-card__shine" style={{ color: accent }} aria-hidden="true">
					✦
				</span>
				<h3 className="ribbon-card__name">
					<span className="ribbon-card__check" style={{ background: accent }} role="img" aria-label="Earned">
						✓
					</span>
					{ribbon.name}
					{ribbon.secret && (
						<span className="ribbon-card__secret-tag" style={{ color: accent, borderColor: accent }}>
							Secret
						</span>
					)}
					{rareFlex && (
						<span className="ribbon-card__rare-tag" style={{ color: accent, borderColor: accent }}>
							Rare
						</span>
					)}
				</h3>
				<p className="ribbon-card__desc">{ribbon.description}</p>
				<p className="ribbon-card__rarity">{formatRarityPct(ribbon.rarityPct)}</p>
			</article>
		);
	}
```

Add the rarity line to the locked branch too (skip it while the secret is still hidden — it would leak that the ribbon exists at all beyond the "???" treatment already showing progress):

```tsx
	return (
		<article className={`ribbon-card ribbon-card--locked${hiddenSecret ? " ribbon-card--secret" : ""}`}>
			<div className="ribbon-card__icon ribbon-card__icon--locked">
				<RibbonIcon ribbon={{ id: ribbon.id, category: ribbon.category }} hidden={hiddenSecret} size={72} />
			</div>
			<h3 className="ribbon-card__name">
				{hiddenSecret && (
					<span className="ribbon-card__secret-icon" aria-hidden="true">
						?
					</span>
				)}
				{hiddenSecret ? SECRET_HIDDEN_NAME : ribbon.name}
			</h3>
			<p className="ribbon-card__desc">{hiddenSecret ? SECRET_HIDDEN_DESC : ribbon.description}</p>
			{!hiddenSecret && <p className="ribbon-card__rarity">{formatRarityPct(ribbon.rarityPct)}</p>}
			<div className="ribbon-progress">
				{/* ...unchanged progress bar... */}
			</div>
		</article>
	);
```

- [ ] **Step 2: Add CSS**

Append to `src/react-app/styles.css`:

```css
.ribbon-card__rarity {
	font-size: 0.72rem;
	font-family: var(--font-mono);
	color: var(--muted);
	letter-spacing: 0.01em;
}

.ribbon-card--rare-flex {
	box-shadow: var(--shadow-card-hover);
}

.ribbon-card__rare-tag {
	margin-left: 8px;
	padding: 1px 7px;
	border: 1px solid;
	border-radius: 999px;
	font-size: 0.62rem;
	font-family: var(--font-mono);
	text-transform: uppercase;
	letter-spacing: 0.04em;
	font-weight: 600;
}
```

(`.ribbon-card--rare-flex` deliberately reuses the existing `--shadow-card-hover` token rather than introducing a new glow color, so the effect stays legible and light/dark-safe without any new hardcoded color.)

- [ ] **Step 3: Verify**

Run: `npx tsc -b && npm run build`
Expected: clean.

- [ ] **Step 4: Controller browser review**

On the Ribbons page, confirm every non-hidden-secret card shows a "N% of trainers" (or "Not yet earned by any trainer" / "<1% of trainers") line. Confirm at least one earned ribbon with low rarity (if any exist in the seeded reference data) shows the "Rare" tag and the elevated shadow; ribbons with `rarityPct` above the threshold do not. Confirm hidden secret cards still show **no** rarity line (no leak). Check both themes.

```bash
git add src/react-app/pages/Ribbons.tsx src/react-app/styles.css
git commit -m "feat(flex-E): rarity% on ribbon cards + rare-flex highlight for earned rare ribbons"
```

---

### Task E4: Earn-moment celebration (`EarnMomentToast`)

**Files:**
- Create: `src/react-app/components/EarnMomentToast.tsx`
- Modify: `src/react-app/pages/Ribbons.tsx` (render the toast from `newlyEarned`/`ackSeen`)
- Modify: `src/react-app/pages/Home.tsx` (same, so the celebration also fires from the dashboard per the spec)
- Modify: `src/react-app/styles.css` (`.earn-toast` + descendants)

**Interfaces:**
- Consumes: `newlyEarned: RibbonDto[]`, `ackSeen(): Promise<void>` (Task E2's `useRibbonsData`).
- Produces: `EarnMomentToast({ ribbons: RibbonDto[]; onDismiss: () => void })` — renders nothing when `ribbons.length === 0`; otherwise a celebratory panel listing every newly-earned ribbon (via `RibbonIcon`) at once (handles a multi-earn batch — e.g. several ribbons crossing their threshold from one big import — without a confusing one-at-a-time carousel), with a single dismiss action.

- [ ] **Step 1: Implement `EarnMomentToast`**

Create `src/react-app/components/EarnMomentToast.tsx`:

```tsx
// src/react-app/components/EarnMomentToast.tsx
//
// Celebration overlay for newly-earned ribbons (Flex Phase E). Rendered
// whenever useRibbonsData().newlyEarned is non-empty, on both the Ribbons
// page and the Home dashboard. Dismissing calls the caller's `onDismiss`
// (wired to `ackSeen`, which calls POST /api/ribbons/seen) so the same
// batch never re-fires. Shows every newly-earned ribbon in one panel rather
// than a one-at-a-time carousel, so a multi-ribbon batch (e.g. right after
// a big import) reads as one clean celebration instead of a spam of toasts.
import { RibbonIcon } from "../ribbons/RibbonIcon";
import type { RibbonDto } from "../api";

export function EarnMomentToast({ ribbons, onDismiss }: { ribbons: RibbonDto[]; onDismiss: () => void }) {
	if (ribbons.length === 0) return null;

	const heading = ribbons.length === 1 ? "Ribbon earned!" : `${ribbons.length} ribbons earned!`;

	return (
		<div className="earn-toast">
			<div className="earn-toast__panel" role="alertdialog" aria-live="assertive" aria-label={heading}>
				<p className="earn-toast__heading">{heading}</p>
				<div className="earn-toast__grid">
					{ribbons.map((r) => (
						<div className="earn-toast__item" key={r.id}>
							<RibbonIcon ribbon={{ id: r.id, category: r.category }} size={56} />
							<span className="earn-toast__name">{r.secret ? "???" : r.name}</span>
						</div>
					))}
				</div>
				<button type="button" className="button button--primary earn-toast__dismiss" onClick={onDismiss}>
					Nice!
				</button>
			</div>
		</div>
	);
}
```

- [ ] **Step 2: Wire into `Ribbons.tsx`**

```tsx
import { EarnMomentToast } from "../components/EarnMomentToast";
```

```tsx
export function Ribbons() {
	const { user } = useAuth();
	const { ribbons, earnedCount, total, trainerScore, rank, newlyEarned, ackSeen, loading, error } = useRibbonsData();
	// ...unchanged grouped/overallPct...

	return (
		<div className="container page">
			{newlyEarned.length > 0 && (
				<EarnMomentToast ribbons={newlyEarned} onDismiss={() => void ackSeen()} />
			)}
			<div className="page__meta">
				{/* ...unchanged title + RankBadge... */}
			</div>
			{/* ...unchanged rest... */}
		</div>
	);
}
```

- [ ] **Step 3: Wire into `Home.tsx`**

```tsx
import { EarnMomentToast } from "../components/EarnMomentToast";
```

```tsx
export function Home({ onBrowse, onNavigate }: HomeProps) {
	const { user } = useAuth();
	const [signInOpen, setSignInOpen] = useState(false);
	const { trainerScore, rank, newlyEarned, ackSeen } = useRibbonsData();

	return (
		<div className="container page">
			{user && newlyEarned.length > 0 && (
				<EarnMomentToast ribbons={newlyEarned} onDismiss={() => void ackSeen()} />
			)}
			<section className="hero" style={{ background: heroAura() }}>
				{/* ...unchanged... */}
			</section>
			{signInOpen && <SignInPanel onClose={() => setSignInOpen(false)} />}
		</div>
	);
}
```

(Gating on `user &&` here is defense-in-depth, not strictly required — `newlyEarned` is always empty for a logged-out response — but it keeps the intent obvious and matches the "logged-out safe" constraint.)

Because both pages read from the **same** `useRibbonsData` hook shape (each page mounts its own instance, but both call the same `GET /api/ribbons` and the same `ackSeen`), whichever page the user is on when a new ribbon has been earned shows the toast; once dismissed there, `seenAt` is bumped server-side so navigating to the other page does not re-trigger it (its next fetch simply returns `newlyEarned: false` for those ids).

- [ ] **Step 4: Add `.earn-toast` styles**

Append to `src/react-app/styles.css`:

```css
.earn-toast {
	position: fixed;
	inset: 0;
	z-index: 50;
	display: flex;
	align-items: center;
	justify-content: center;
	padding: 24px;
	background: color-mix(in srgb, var(--ink) 45%, transparent);
}

.earn-toast__panel {
	width: min(480px, 100%);
	border: 1px solid var(--hairline);
	border-radius: var(--radius-card);
	background: var(--surface);
	box-shadow: var(--shadow-card-hover);
	padding: 24px;
	text-align: center;
}

.earn-toast__heading {
	font-family: var(--font-display);
	font-weight: 700;
	font-size: 1.3rem;
	margin-bottom: 16px;
}

.earn-toast__grid {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(88px, 1fr));
	gap: 12px;
	margin-bottom: 20px;
	max-height: 320px;
	overflow-y: auto;
}

.earn-toast__item {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 6px;
}

.earn-toast__name {
	font-size: 0.72rem;
	font-weight: 600;
	line-height: 1.2;
}

.earn-toast__dismiss {
	width: 100%;
}
```

- [ ] **Step 5: Verify**

Run: `npx tsc -b && npm run build`
Expected: clean.

- [ ] **Step 6: Controller browser review**

This one needs a real earn moment to observe end-to-end: sign in, add a specimen that completes a ribbon (or use a fresh account so the first ribbon computed counts as newly-earned), load the Ribbons page, confirm the celebration panel appears listing the ribbon(s) with `RibbonIcon`s, click "Nice!", confirm it closes and does **not** reappear on refresh or on navigating to Home. Repeat the earn-then-view flow starting from Home instead, confirming the toast can appear there too. Check both themes; confirm the backdrop dims content without fully hiding it.

```bash
git add src/react-app/components/EarnMomentToast.tsx src/react-app/pages/Ribbons.tsx src/react-app/pages/Home.tsx src/react-app/styles.css
git commit -m "feat(flex-E): earn-moment celebration toast on Ribbons and Home, acked via ackRibbonsSeen"
```

---

### Task E5: Showcase picker (Ribbons) + trophy wall (Home)

**Files:**
- Create: `src/react-app/ribbons/ShowcasePicker.tsx`
- Create: `src/react-app/ribbons/TrophyWall.tsx`
- Modify: `src/react-app/pages/Ribbons.tsx` (render `ShowcasePicker` above or alongside the category sections, signed-in only)
- Modify: `src/react-app/pages/Home.tsx` (render `TrophyWall` in the signed-in dashboard block)
- Modify: `src/react-app/styles.css` (`.showcase-picker`, `.trophy-wall` + descendants)

**Interfaces:**
- Consumes: `setRibbonShowcase` (`../api`); `deriveShowcaseSlots` (Task E1); `RibbonIcon`.
- Produces: `ShowcasePicker({ earnedRibbons: RibbonDto[]; showcase: (string | null)[]; onSaved: () => void })` — a toggle-grid of **earned-only** ribbons (never renders a locked ribbon as selectable, per the spec's "only earned ribbons selectable"), capped at `showcase.length` (6) picks, saving via `setRibbonShowcase(selectedIds)`; on success calls `onSaved()` so the caller (`Ribbons.tsx`) can `refetch()` and re-sync `showcase` from the server (the source of truth stays server-side — the picker never assumes its own optimistic state is final). `TrophyWall({ showcase: (string | null)[]; ribbons: RibbonDto[] })` — read-only, renders the 6 slots (via `deriveShowcaseSlots`) as a grid of `RibbonIcon`s with names, or an empty-state nudge to visit the Ribbons page.

- [ ] **Step 1: Implement `ShowcasePicker`**

Create `src/react-app/ribbons/ShowcasePicker.tsx`:

```tsx
// src/react-app/ribbons/ShowcasePicker.tsx
//
// Lets a signed-in user pin up to `showcase.length` (6) EARNED ribbons to
// their showcase. Only earned ribbons are ever rendered as selectable — the
// server re-validates this on save (setShowcase in
// src/worker/ribbons/incentive-store.ts), but the picker never even offers
// a locked ribbon as a choice. On save, defers back to the server via
// `onSaved` (the caller refetches) rather than trusting its own optimistic
// state as final.
import { useEffect, useState } from "react";
import { setRibbonShowcase, type RibbonDto } from "../api";
import { RibbonIcon } from "./RibbonIcon";

export function ShowcasePicker({
	earnedRibbons,
	showcase,
	onSaved,
}: {
	earnedRibbons: RibbonDto[];
	showcase: (string | null)[];
	onSaved: () => void;
}) {
	const maxSlots = showcase.length;
	const [selected, setSelected] = useState<string[]>(() => showcase.filter((id): id is string => id !== null));
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// Re-sync local selection whenever the server's showcase changes underneath us (e.g. after a save + refetch).
	useEffect(() => {
		setSelected(showcase.filter((id): id is string => id !== null));
	}, [showcase]);

	function toggle(id: string) {
		setError(null);
		setSelected((prev) => {
			if (prev.includes(id)) return prev.filter((x) => x !== id);
			if (prev.length >= maxSlots) return prev; // full — ignore extra picks rather than silently evicting one
			return [...prev, id];
		});
	}

	async function save() {
		setSaving(true);
		setError(null);
		try {
			await setRibbonShowcase(selected);
			onSaved();
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setSaving(false);
		}
	}

	return (
		<section className="showcase-picker">
			<div className="showcase-picker__header">
				<h2 className="ribbon-section__title">Showcase</h2>
				<span className="ribbon-section__count">
					{selected.length} / {maxSlots}
				</span>
			</div>
			<p className="showcase-picker__hint">Pin up to {maxSlots} earned ribbons to your trophy wall on the dashboard.</p>
			{error && (
				<p className="error-banner" role="alert">
					Error: {error}
				</p>
			)}
			<div className="showcase-picker__grid">
				{earnedRibbons.map((r) => {
					const picked = selected.includes(r.id);
					return (
						<button
							type="button"
							key={r.id}
							className={`showcase-picker__item${picked ? " showcase-picker__item--picked" : ""}`}
							aria-pressed={picked}
							aria-label={`${picked ? "Remove" : "Pin"} ${r.name} ${picked ? "from" : "to"} showcase`}
							onClick={() => toggle(r.id)}
						>
							<RibbonIcon ribbon={{ id: r.id, category: r.category }} size={48} />
							<span className="showcase-picker__name">{r.name}</span>
						</button>
					);
				})}
				{earnedRibbons.length === 0 && <p className="showcase-picker__empty">Earn a ribbon to start your showcase.</p>}
			</div>
			<button type="button" className="button button--primary" onClick={save} disabled={saving}>
				{saving ? "Saving…" : "Save showcase"}
			</button>
		</section>
	);
}
```

- [ ] **Step 2: Implement `TrophyWall`**

Create `src/react-app/ribbons/TrophyWall.tsx`:

```tsx
// src/react-app/ribbons/TrophyWall.tsx
//
// Read-only "trophy wall" for the signed-in Home dashboard: the user's
// pinned showcase ribbons, in slot order. Empty slots render as blank
// placeholders (not omitted) so the wall's layout stays stable as ribbons
// are pinned/unpinned from the Ribbons page's ShowcasePicker.
import { deriveShowcaseSlots } from "./incentiveDisplay";
import { RibbonIcon } from "./RibbonIcon";
import type { RibbonDto } from "../api";

export function TrophyWall({ showcase, ribbons }: { showcase: (string | null)[]; ribbons: RibbonDto[] }) {
	const slots = deriveShowcaseSlots(showcase, ribbons);
	const pinnedCount = slots.filter((s) => s !== null).length;

	return (
		<section className="trophy-wall">
			<h2 className="ribbon-section__title">Trophy Wall</h2>
			{pinnedCount === 0 ? (
				<p className="trophy-wall__empty">Pin your favorite ribbons from the Ribbons page to show them off here.</p>
			) : (
				<div className="trophy-wall__grid">
					{slots.map((ribbon, i) =>
						ribbon ? (
							<div className="trophy-wall__slot" key={ribbon.id}>
								<RibbonIcon ribbon={{ id: ribbon.id, category: ribbon.category }} size={64} />
								<span className="trophy-wall__name">{ribbon.name}</span>
							</div>
						) : (
							<div className="trophy-wall__slot trophy-wall__slot--empty" key={`empty-${i}`} aria-hidden="true" />
						),
					)}
				</div>
			)}
		</section>
	);
}
```

- [ ] **Step 3: Wire `ShowcasePicker` into `Ribbons.tsx`**

```tsx
import { ShowcasePicker } from "../ribbons/ShowcasePicker";
```

```tsx
	const { ribbons, earnedCount, total, trainerScore, rank, showcase, newlyEarned, ackSeen, refetch, loading, error } =
		useRibbonsData();
	const earnedRibbons = useMemo(() => ribbons.filter((r) => r.earned), [ribbons]);
```

Render it once, after the `ribbons-summary` block and before the category sections (only for signed-in users — showcase editing is meaningless logged out):

```tsx
					{user && (
						<ShowcasePicker earnedRibbons={earnedRibbons} showcase={showcase} onSaved={refetch} />
					)}

					{grouped.map(({ category, ribbons: categoryRibbons }) => (
						<RibbonSection key={category} category={category} ribbons={categoryRibbons} />
					))}
```

- [ ] **Step 4: Wire `TrophyWall` into `Home.tsx`**

```tsx
import { TrophyWall } from "../ribbons/TrophyWall";
```

```tsx
	const { trainerScore, rank, showcase, ribbons, newlyEarned, ackSeen } = useRibbonsData();
```

```tsx
				{user && (
					<div className="hero__welcome">
						{/* ...unchanged eyebrow/title/RankBadge/actions... */}
					</div>
				)}
			</section>
			{user && <TrophyWall showcase={showcase} ribbons={ribbons} />}
			{signInOpen && <SignInPanel onClose={() => setSignInOpen(false)} />}
```

- [ ] **Step 5: Add CSS**

Append to `src/react-app/styles.css`:

```css
.showcase-picker {
	border: 1px solid var(--hairline);
	border-radius: var(--radius-card);
	padding: 16px;
	margin-bottom: 24px;
}

.showcase-picker__header {
	display: flex;
	align-items: baseline;
	justify-content: space-between;
	gap: 12px;
}

.showcase-picker__hint {
	color: var(--muted);
	font-size: 0.82rem;
	margin: 6px 0 14px;
}

.showcase-picker__grid {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
	gap: 10px;
	margin-bottom: 16px;
}

.showcase-picker__item {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 6px;
	padding: 10px 6px;
	border: 1px solid var(--hairline);
	border-radius: var(--radius-control);
	background: var(--surface);
	cursor: pointer;
}

.showcase-picker__item--picked {
	border-color: color-mix(in srgb, #f6c64b 60%, var(--hairline));
	background: color-mix(in srgb, #f6c64b 14%, var(--surface));
}

.showcase-picker__name {
	font-size: 0.68rem;
	text-align: center;
	line-height: 1.2;
}

.showcase-picker__empty {
	color: var(--muted);
	font-size: 0.85rem;
	grid-column: 1 / -1;
}

.trophy-wall {
	border: 1px solid var(--hairline);
	border-radius: var(--radius-card);
	padding: 20px;
	margin-top: 20px;
}

.trophy-wall__empty {
	color: var(--muted);
	font-size: 0.85rem;
	margin-top: 8px;
}

.trophy-wall__grid {
	display: grid;
	grid-template-columns: repeat(6, 1fr);
	gap: 12px;
	margin-top: 14px;
}

.trophy-wall__slot {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 6px;
}

.trophy-wall__slot--empty {
	border: 1px dashed var(--hairline);
	border-radius: var(--radius-control);
	min-height: 64px;
}

.trophy-wall__name {
	font-size: 0.68rem;
	text-align: center;
	line-height: 1.2;
}

@media (max-width: 560px) {
	.trophy-wall__grid {
		grid-template-columns: repeat(3, 1fr);
	}
}
```

- [ ] **Step 6: Verify**

Run: `npx tsc -b && npm run build`
Expected: clean.

- [ ] **Step 7: Controller browser review**

On the Ribbons page (signed in), confirm only earned ribbons appear as pickable tiles; pin fewer than 6, save, confirm the count updates and a page refresh shows the same picks pre-selected. Try picking a 7th while 6 are selected — confirm it's silently ignored (no crash, no 7th pick). On Home, confirm the trophy wall shows the same pinned ribbons in the same slot order, and empty slots render as visible placeholders, not gaps. With zero pins, confirm the empty-state message on both. Signed-out: neither component renders; no crash. Both themes.

```bash
git add src/react-app/ribbons/ShowcasePicker.tsx src/react-app/ribbons/TrophyWall.tsx src/react-app/pages/Ribbons.tsx src/react-app/pages/Home.tsx src/react-app/styles.css
git commit -m "feat(flex-E): showcase picker (Ribbons) + read-only trophy wall (Home)"
```

---

### Task E6: "Closest to earning" nudges on the dashboard (`NudgeList`)

**Files:**
- Create: `src/react-app/ribbons/NudgeList.tsx`
- Modify: `src/react-app/pages/Home.tsx` (render `NudgeList` from `nearest`, signed-in only)
- Modify: `src/react-app/styles.css` (`.nudge-list` + descendants)

**Interfaces:**
- Consumes: `nearest: RibbonDto[]` (Task E2's `useRibbonsData`, already sorted server-side by `nearestRibbons` in `src/worker/ribbons/scoring.ts` — top ~5, locked, non-secret, highest progress ratio first); `nudgePct` (Task E1); `RibbonIcon`.
- Produces: `NudgeList({ nearest: RibbonDto[] })` — a compact list, one row per ribbon, each with its icon, name, a progress bar, and the raw `current / total` count. Renders nothing when `nearest` is empty (e.g. a user who has earned everything, or a fresh signed-out response).

- [ ] **Step 1: Implement `NudgeList`**

Create `src/react-app/ribbons/NudgeList.tsx`:

```tsx
// src/react-app/ribbons/NudgeList.tsx
//
// "Closest to earning" nudge list for the signed-in Home dashboard. Renders
// the API's `nearest` array (already ranked, filtered to locked/non-secret
// ribbons server-side by nearestRibbons in src/worker/ribbons/scoring.ts) as
// a compact progress list — no re-sorting or re-filtering here, this
// component only formats what the server already decided to show.
import { nudgePct } from "./incentiveDisplay";
import { RibbonIcon } from "./RibbonIcon";
import type { RibbonDto } from "../api";

export function NudgeList({ nearest }: { nearest: RibbonDto[] }) {
	if (nearest.length === 0) return null;

	return (
		<section className="nudge-list">
			<h2 className="ribbon-section__title">Almost there</h2>
			<ul className="nudge-list__items">
				{nearest.map((r) => {
					const pct = nudgePct(r);
					return (
						<li className="nudge-list__item" key={r.id}>
							<RibbonIcon ribbon={{ id: r.id, category: r.category }} size={40} />
							<div className="nudge-list__body">
								<span className="nudge-list__name">{r.name}</span>
								<div
									className="nudge-list__track"
									role="progressbar"
									aria-valuenow={r.progress.current}
									aria-valuemin={0}
									aria-valuemax={r.progress.total}
									aria-label={`${r.name} progress`}
								>
									<div className="nudge-list__fill" style={{ width: `${pct}%` }} />
								</div>
								<span className="nudge-list__count">
									{r.progress.current} / {r.progress.total}
								</span>
							</div>
						</li>
					);
				})}
			</ul>
		</section>
	);
}
```

- [ ] **Step 2: Wire into `Home.tsx`**

```tsx
import { NudgeList } from "../ribbons/NudgeList";
```

```tsx
	const { trainerScore, rank, showcase, ribbons, nearest, newlyEarned, ackSeen } = useRibbonsData();
```

```tsx
			</section>
			{user && <TrophyWall showcase={showcase} ribbons={ribbons} />}
			{user && <NudgeList nearest={nearest} />}
			{signInOpen && <SignInPanel onClose={() => setSignInOpen(false)} />}
```

- [ ] **Step 3: Add CSS**

Append to `src/react-app/styles.css`:

```css
.nudge-list {
	border: 1px solid var(--hairline);
	border-radius: var(--radius-card);
	padding: 20px;
	margin-top: 20px;
}

.nudge-list__items {
	list-style: none;
	margin: 14px 0 0;
	padding: 0;
	display: flex;
	flex-direction: column;
	gap: 14px;
}

.nudge-list__item {
	display: flex;
	align-items: center;
	gap: 12px;
}

.nudge-list__body {
	flex: 1;
	min-width: 0;
	display: flex;
	flex-direction: column;
	gap: 4px;
}

.nudge-list__name {
	font-size: 0.85rem;
	font-weight: 600;
}

.nudge-list__track {
	height: 6px;
	border-radius: 999px;
	background: color-mix(in srgb, var(--ink) 8%, transparent);
	overflow: hidden;
}

.nudge-list__fill {
	height: 100%;
	border-radius: 999px;
	background: linear-gradient(90deg, #f6c64b, #ff7a3c);
	transition: width 0.3s ease;
}

.nudge-list__count {
	font-family: var(--font-mono);
	font-size: 0.72rem;
	color: var(--muted);
}
```

(Reuses the same gold→orange gradient as `.ribbons-summary__fill` for visual continuity between the overall progress bar and the per-ribbon nudge bars.)

- [ ] **Step 4: Verify**

Run: `npx tsc -b && npm run build`
Expected: clean.

- [ ] **Step 5: Controller browser review**

On Home (signed in, with at least one locked ribbon), confirm "Almost there" lists up to 5 ribbons with icons, names, progress bars, and counts, ordered highest-progress-first. Confirm no secret (`???`) ribbons ever appear in this list (the server already filters them, but visually re-confirm nothing reads as a spoiler). For a user who has earned every ribbon (or is signed out), confirm the section doesn't render at all rather than showing an empty box. Both themes.

- [ ] **Step 6: Full-suite verification + final commit**

Run: `npx vitest run tests/react-app/ && npx tsc -b && npm run build`
Expected: all Phase E pure tests pass (`incentiveDisplay.test.ts` plus the pre-existing `ribbonIcon.test.ts`/`rosette.test.ts`/`theme.test.ts` still green, unmodified by this phase); typecheck and build both succeed.

```bash
git add src/react-app/ribbons/NudgeList.tsx src/react-app/pages/Home.tsx src/react-app/styles.css
git commit -m "feat(flex-E): closest-to-earning nudge list on the Home dashboard"
```

---

## Self-Review

**Spec coverage (Section 4 of the design spec, UI-facing parts):**

| Spec item | Component/mechanism | Task | Status |
| --- | --- | --- | --- |
| Points + rank shown on dashboard + profile | `RankBadge` on Ribbons header + Home welcome | E2 | ✓ |
| Rarity % shown per card; rare ribbons get a "flex" highlight | `formatRarityPct` + `isRareFlex` on `RibbonCard` | E1, E3 | ✓ |
| Earn moments: celebratory toast/modal on Ribbons page **and** dashboard; ack via `POST /api/ribbons/seen` | `EarnMomentToast` wired on both `Ribbons.tsx` and `Home.tsx` via shared `ackSeen` | E2, E4 | ✓ |
| Showcase: pin up to 6 earned ribbons; shown as a trophy wall on the dashboard | `ShowcasePicker` (Ribbons) + `TrophyWall` (Home), only earned ribbons selectable | E5 | ✓ |
| Nudges: "closest to earning" top ~5 non-secret locked ribbons by progress ratio, on the dashboard | `NudgeList` renders the API's `nearest` verbatim | E2, E6 | ✓ |
| API already extended (`points`, `rarityPct`, `newlyEarned`, `trainerScore`, `rank`, `showcase`, `nearest`) — Phase E must not change it | No edits to `src/react-app/api.ts` or `src/worker/**` in any task | E1–E6 | ✓ |

**Ribbon-count / scope note:** Phase E adds no new ribbons or catalog entries (that was Phase C) and no new backend fields (Phase D) — it is purely presentational plumbing over the existing response. Net new: 1 pure module, 1 hook, 5 components, ~2 modified pages, CSS additions.

**Placeholder scan:** none — every step carries complete, consistent code (matching `api.ts`'s actual field names verbatim: `trainerScore`, `rank`, `showcase`, `nearest`, `points`, `rarityPct`, `newlyEarned`) and exact verification commands. Two intentional simplifications are called out inline rather than left implicit: (1) `ShowcasePicker` defers to `refetch()` after a save instead of trusting its own optimistic showcase state (Task E5, Step 1's comment); (2) the `{user && ...}` gating around `EarnMomentToast` on `Home.tsx` is flagged as defense-in-depth, not load-bearing (Task E4, Step 3).

**Type consistency vs `api.ts`:**
- `useRibbonsData` returns exactly the fields `RibbonsResponse` defines (`ribbons`, `earnedCount`, `total`, `trainerScore`, `rank`, `showcase`, `nearest`) plus two derived-only additions (`newlyEarned: RibbonDto[]`, computed as `ribbons.filter(r => r.newlyEarned)`) and hook-local UI state (`loading`, `error`, `refetch`, `ackSeen`) — no reshaping of the wire types.
- `showcase` stays `(string | null)[]` end-to-end (`useRibbonsData` → `ShowcasePicker`/`TrophyWall` → `deriveShowcaseSlots`); `deriveShowcaseSlots` returns `(RibbonDto | null)[]` of the *same length*, never re-indexed.
- `setRibbonShowcase(ribbonIds: string[])` and `ackRibbonsSeen(): Promise<void>` are called with the exact signatures already exported from `api.ts` — no new client wrapper duplicates them.
- `rankColor(rank: string): string` is presentational-only; it never reads or re-derives `trainerScore`, so a future change to `RANKS` thresholds in `src/worker/ribbons/scoring.ts` cannot desync from this file (only a *new rank title* would need a `RANK_COLORS` entry, and the `DEFAULT_RANK_COLOR` fallback means that's a cosmetic follow-up, not a crash).

**Accessibility scan:**
- Every progress bar (`ribbon-progress` unchanged, `ribbons-summary` unchanged, new `nudge-list__track`) keeps `role="progressbar"` + `aria-valuenow/min/max` + `aria-label`.
- `EarnMomentToast`'s panel carries `role="alertdialog"` + `aria-live="assertive"` + `aria-label` so it's announced once as a whole, not narrated field-by-field.
- `ShowcasePicker`'s toggle buttons are real `<button type="button">`s with `aria-pressed` + a full-sentence `aria-label` ("Pin X to showcase" / "Remove X from showcase") — never a bare icon with no accessible name.
- No new hardcoded colors that break dark mode: all new CSS reuses existing tokens (`--surface`, `--hairline`, `--ink`, `--muted`, `--radius-card`, `--radius-control`, `--shadow-card-rest`, `--shadow-card-hover`) or `color-mix(...)` against them, mirroring `.ribbon-card--earned`/`.error-banner`'s existing pattern. The two literal hexes reused (`#f6c64b`/`#ff7a3c` gold→orange gradient) are copied verbatim from the pre-existing `.ribbons-summary__fill`, not new.

**Risks / open questions:**
1. **Two `useRibbonsData` instances never share a cache.** `Ribbons.tsx` and `Home.tsx` each mount their own hook instance and independently call `GET /api/ribbons` (and, if applicable, independently compute/ack their own `newlyEarned`). This matches the existing app's routing model (one page component mounted at a time, per `src/react-app/App.tsx`'s `View` switch) — there's no simultaneous double-fetch in practice — but if a future refactor renders both at once (e.g. a persistent sidebar), this should be lifted into a context/provider instead of two independent hook instances.
2. **`ackSeen` race across a fast page navigation.** If a user sees the toast on Home, clicks "Nice!" (fires `ackRibbonsSeen()`), and navigates to Ribbons *before* that request resolves, the freshly-mounted `Ribbons.tsx` hook's own fetch could still see the pre-ack `newlyEarned: true` and show the toast a second time. This is a narrow timing window (typically sub-second) rather than a structural spam bug, and resolves itself on any subsequent fetch; flagged for the controller as a possible follow-up (e.g. a shared in-flight-ack flag) if it proves noticeable in practice.
3. **`showcase.length` assumed to be a stable 6.** `ShowcasePicker`/`TrophyWall` derive their slot count from `showcase.length` rather than a hardcoded `6`, so they track the server's `SHOWCASE_SLOTS` constant automatically — but the grid CSS (`.trophy-wall__grid { grid-template-columns: repeat(6, 1fr); }`) hardcodes 6 columns for layout. If `SHOWCASE_SLOTS` ever changes server-side, this CSS constant needs a matching update (flagged, not expected to change).
4. **Rare-flex threshold (5%) is a placeholder tuning value**, matching how Phase D's point values were called out as "tune during build" in the spec. The controller may want to adjust `RARE_FLEX_THRESHOLD` in `incentiveDisplay.ts` after seeing real rarity distributions across the expanded (Phase C) catalog.
5. **No dev server was used for verification**, per the Global Constraints — all component-level checks rely on `tsc -b` + `npm run build` (structural correctness) plus a controller browser pass (visual/behavioral correctness) against a deployed/previewed build. Any interaction bug that only manifests at runtime (e.g. a stale closure in `ackSeen`) depends on that manual pass catching it.


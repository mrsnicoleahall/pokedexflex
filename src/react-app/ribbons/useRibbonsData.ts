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

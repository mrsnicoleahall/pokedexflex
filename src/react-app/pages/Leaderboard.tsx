// src/react-app/pages/Leaderboard.tsx
//
// Public leaderboard at /leaderboard (Flex Phase J). Ungated +
// unauthenticated: registered outside AppLayout, fetched via the public
// GET /api/leaderboard endpoint, which ranks ONLY public trainers and never
// returns email or private data. Its own minimal header (wordmark link home +
// theme toggle) — deliberately NO AccountMenu, matching PublicProfile. A metric
// switcher re-ranks by refetching. If the viewer is signed in, their own row is
// highlighted. All ranking/formatting lives in the DOM-free
// leaderboard/leaderboardDisplay.ts + the server; this page is presentation.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { fetchLeaderboard, type LeaderboardEntryDto, type LeaderboardResponse } from "../api";
import { Avatar } from "../components/Avatar";
import { RankBadge } from "../components/RankBadge";
import { ThemeToggle } from "../components/ThemeToggle";
import { PATHS, publicProfilePath } from "../routes";
import {
	LEADERBOARD_TABS,
	DEFAULT_METRIC,
	formatMetricValue,
	type LeaderboardMetric,
} from "../leaderboard/leaderboardDisplay";

type LoadState =
	| { status: "loading" }
	| { status: "error" }
	| { status: "ok"; data: LeaderboardResponse };

function PublicHeader() {
	return (
		<header className="toolbar public-profile__bar">
			<div className="toolbar__inner container">
				<Link className="wordmark" to={PATHS.home}>
					PokeDexFlex
				</Link>
				<div className="toolbar__controls">
					<ThemeToggle />
				</div>
			</div>
		</header>
	);
}

export function Leaderboard() {
	const { user } = useAuth();
	const [metric, setMetric] = useState<LeaderboardMetric>(DEFAULT_METRIC);
	const [state, setState] = useState<LoadState>({ status: "loading" });

	useEffect(() => {
		let cancelled = false;
		setState({ status: "loading" });
		fetchLeaderboard(metric)
			.then((data) => {
				if (!cancelled) setState({ status: "ok", data });
			})
			.catch(() => {
				if (!cancelled) setState({ status: "error" });
			});
		return () => {
			cancelled = true;
		};
	}, [metric]);

	return (
		<div className="app">
			<PublicHeader />
			<div className="container page">
				<h1 className="hero__title hero__title--slim">Leaderboard</h1>
				<p className="state__hint leaderboard__intro">
					The top public trainers, ranked. Set a public handle in Settings to appear here.
				</p>

				<nav className="leaderboard-tabs" role="tablist" aria-label="Rank by">
					{LEADERBOARD_TABS.map((t) => (
						<button
							key={t.metric}
							type="button"
							role="tab"
							aria-selected={metric === t.metric}
							className="leaderboard-tab"
							onClick={() => setMetric(t.metric)}
						>
							{t.label}
						</button>
					))}
				</nav>

				{state.status === "loading" && <p className="state__title">Loading…</p>}

				{state.status === "error" && (
					<div className="state">
						<p className="state__title">Couldn't load the leaderboard</p>
						<p className="state__hint">Please try again in a moment.</p>
					</div>
				)}

				{state.status === "ok" && state.data.entries.length === 0 && (
					<div className="state">
						<p className="state__title">No trainers yet</p>
						<p className="state__hint">
							Be the first — set a public handle in Settings. <Link to={PATHS.home}>Back home</Link>
						</p>
					</div>
				)}

				{state.status === "ok" && state.data.entries.length > 0 && (
					<LeaderboardTable data={state.data} metric={metric} youId={user?.id ?? null} />
				)}
			</div>
		</div>
	);
}

function LeaderboardTable({
	data,
	metric,
	youId,
}: {
	data: LeaderboardResponse;
	metric: LeaderboardMetric;
	youId: string | null;
}) {
	return (
		<>
			<p className="leaderboard__count">
				Top {Math.min(data.entries.length, data.limit)} of {data.total.toLocaleString()} public trainers
			</p>
			<div className="leaderboard__scroll">
				<ol className="leaderboard-list">
					{data.entries.map((entry) => (
						<Row key={entry.userId} entry={entry} metric={metric} isYou={entry.userId === youId} />
					))}
				</ol>
			</div>
			<p className="state__hint leaderboard__note">
				Trainer Score, Ribbons, and Rarity reflect each trainer's last visit to their Ribbons page.
				Completion and Shiny are live.
			</p>
		</>
	);
}

function Row({
	entry,
	metric,
	isYou,
}: {
	entry: LeaderboardEntryDto;
	metric: LeaderboardMetric;
	isYou: boolean;
}) {
	return (
		<li className={`leaderboard-row${isYou ? " leaderboard-row--you" : ""}`}>
			<span className="leaderboard-row__pos">{entry.position}</span>
			<Avatar userId={entry.userId} displayName={entry.displayName} hasAvatar={entry.hasAvatar} size="sm" />
			<span className="leaderboard-row__id">
				<Link className="leaderboard-row__name" to={publicProfilePath(entry.handle)}>
					{entry.displayName ?? `@${entry.handle}`}
				</Link>
				<span className="leaderboard-row__handle">@{entry.handle}</span>
			</span>
			<span className="leaderboard-row__rank">
				<RankBadge trainerScore={entry.trainerScore} rank={entry.rank} size="sm" />
			</span>
			<span className="leaderboard-row__value">{formatMetricValue(entry, metric)}</span>
		</li>
	);
}

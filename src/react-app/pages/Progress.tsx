// src/react-app/pages/Progress.tsx
//
// Signed-in "Progress" dashboard (Flex Phase H): how close the trainer is to a
// living dex. Gated route inside AppLayout — a signed-out visitor sees a
// sign-in prompt (the same pattern other account pages use). Data comes from
// the auth-scoped GET /api/stats; all counting/percentage logic lives in the
// DOM-free stats/statsDisplay.ts. Reuses RankBadge, TypeIcon, the type palette,
// and the --brand-grad token for a brand-consistent completion hero.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { fetchStats, type StatsDto } from "../api";
import { RankBadge } from "../components/RankBadge";
import { TypeIcon } from "../components/TypeIcon";
import { PATHS } from "../routes";
import { typeColor } from "../theme";
import {
	TYPE_ORDER,
	GEN_ORDER,
	formatPct,
	barPct,
	buildCompletionRows,
} from "../stats/statsDisplay";

type LoadState =
	| { status: "loading" }
	| { status: "error" }
	| { status: "ok"; stats: StatsDto };

export function Progress() {
	const { user } = useAuth();
	const [state, setState] = useState<LoadState>({ status: "loading" });

	useEffect(() => {
		if (!user) return;
		let cancelled = false;
		setState({ status: "loading" });
		fetchStats()
			.then((stats) => {
				if (!cancelled) setState({ status: "ok", stats });
			})
			.catch(() => {
				if (!cancelled) setState({ status: "error" });
			});
		return () => {
			cancelled = true;
		};
	}, [user]);

	if (!user) {
		return (
			<div className="container page">
				<div className="state">
					<p className="state__title">Sign in to see your progress</p>
					<p className="state__hint">
						Track your living dex, per-type and per-generation completion, and every stat.{" "}
						<Link to={PATHS.home}>Back home</Link>
					</p>
				</div>
			</div>
		);
	}

	return (
		<div className="container page">
			<h1 className="hero__title hero__title--slim">Your Progress</h1>

			{state.status === "loading" && <p className="state__title">Loading…</p>}

			{state.status === "error" && (
				<div className="state">
					<p className="state__title">Couldn't load your stats</p>
					<p className="state__hint">Please try again in a moment.</p>
				</div>
			)}

			{state.status === "ok" && <ProgressBody stats={state.stats} />}
		</div>
	);
}

function ProgressBody({ stats }: { stats: StatsDto }) {
	const genRows = buildCompletionRows(GEN_ORDER, stats.byGen, stats.totalByGen);
	const typeRows = buildCompletionRows(TYPE_ORDER, stats.byType, stats.totalByType);
	const ringPct = Math.round(stats.completion.pct * 100);

	return (
		<>
			<section className="progress-hero" aria-label="Overall completion">
				<div
					className="progress-ring"
					style={{ ["--pct" as string]: String(ringPct) }}
					role="img"
					aria-label={`Living dex ${formatPct(stats.completion.pct)} complete`}
				>
					<div className="progress-ring__center">
						<span className="progress-ring__pct">{formatPct(stats.completion.pct)}</span>
						<span className="progress-ring__label">complete</span>
					</div>
				</div>
				<div className="progress-hero__meta">
					<p className="progress-hero__count">
						{stats.completion.owned.toLocaleString()} / {stats.completion.total.toLocaleString()} species
					</p>
					<RankBadge trainerScore={stats.trainerScore} rank={stats.rank} size="sm" />
				</div>
			</section>

			<section className="progress-section" aria-label="Stat totals">
				<div className="progress-tiles">
					<Tile label="Shiny species" value={stats.shinySpeciesCount} />
					<Tile label="Events" value={stats.eventCount} />
					<Tile label="Specimens" value={stats.specimenCount} />
					<Tile label="Boxes" value={stats.boxCount} />
					<Tile label="Mega forms" value={stats.megaFormCount} />
					<Tile label="Gigantamax" value={stats.gmaxFormCount} />
					<Tile label="Ribbons" value={stats.ribbonCount} />
					<Tile label="Rarity score" value={stats.rarityScore} />
				</div>
			</section>

			<section className="progress-section" aria-label="Completion by generation">
				<h2 className="ribbon-section__title">By generation</h2>
				{genRows.length === 0 ? (
					<p className="state__hint">No species owned yet.</p>
				) : (
					<div className="progress-bars">
						{genRows.map((row) => (
							<div className="progress-bar-row" key={row.key}>
								<span className="progress-bar-row__label">Gen {row.label}</span>
								<span className="progress-bar-row__track">
									<span className="progress-bar-row__fill" style={{ width: `${barPct(row.owned, row.total)}%` }} />
								</span>
								<span className="progress-bar-row__count">
									{row.owned} / {row.total}
								</span>
							</div>
						))}
					</div>
				)}
			</section>

			<section className="progress-section" aria-label="Completion by type">
				<h2 className="ribbon-section__title">By type</h2>
				{typeRows.length === 0 ? (
					<p className="state__hint">No species owned yet.</p>
				) : (
					<div className="progress-type-grid">
						{typeRows.map((row) => (
							<div className="progress-type" key={row.key}>
								<TypeIcon type={row.key} color={typeColor(row.key)} size={22} />
								<span className="progress-type__track">
									<span className="progress-type__fill" style={{ width: `${barPct(row.owned, row.total)}%` }} />
								</span>
								<span className="progress-type__count">
									{row.owned} / {row.total}
								</span>
							</div>
						))}
					</div>
				)}
			</section>
		</>
	);
}

function Tile({ label, value }: { label: string; value: number }) {
	return (
		<div className="progress-tile">
			<span className="progress-tile__value">{value.toLocaleString()}</span>
			<span className="progress-tile__label">{label}</span>
		</div>
	);
}

// src/react-app/pages/Versus.tsx
//
// Public head-to-head at /versus/:a/:b (Flex Phase G). Ungated +
// unauthenticated: registered outside AppLayout, fetched via the public
// GET /api/versus/:a/:b endpoint, which never returns email or private data
// for either side. If either side is unknown or private, the whole comparison
// comes back null (indistinguishable) and renders the same "not found" state.
// Its own minimal header (wordmark link home + theme toggle) — no AccountMenu.

import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { fetchVersus, saveRivalry, type VersusDto, type VersusRoundDto, type VersusSideDto } from "../api";
import { Avatar } from "../components/Avatar";
import { FavoritesStrip } from "../components/FavoritesStrip";
import { RankBadge } from "../components/RankBadge";
import { ThemeToggle } from "../components/ThemeToggle";
import { TypeIcon } from "../components/TypeIcon";
import { RibbonIcon } from "../ribbons/RibbonIcon";
import { PATHS } from "../routes";
import { typeColor } from "../theme";
import { rivalTargetHandle } from "../versus/rivalTarget";
import {
	TYPE_ORDER,
	GEN_ORDER,
	formatRoundValue,
	barPercents,
	buildBreakdown,
	type BreakdownRow,
} from "../versus/versusDisplay";

type LoadState =
	| { status: "loading" }
	| { status: "not_found" }
	| { status: "error" }
	| { status: "ok"; versus: VersusDto };

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

export function Versus() {
	const { a, b } = useParams<{ a: string; b: string }>();
	const [state, setState] = useState<LoadState>({ status: "loading" });

	useEffect(() => {
		let cancelled = false;
		setState({ status: "loading" });
		fetchVersus(a ?? "", b ?? "")
			.then((versus) => {
				if (cancelled) return;
				setState(versus ? { status: "ok", versus } : { status: "not_found" });
			})
			.catch(() => {
				if (!cancelled) setState({ status: "error" });
			});
		return () => {
			cancelled = true;
		};
	}, [a, b]);

	return (
		<div className="app">
			<PublicHeader />
			<div className="container page">
				{state.status === "loading" && <p className="state__title">Loading…</p>}

				{state.status === "not_found" && (
					<div className="state">
						<p className="state__title">Matchup unavailable</p>
						<p className="state__hint">
							One or both trainers don't exist or are private.{" "}
							<Link to={PATHS.home}>Back to PokeDexFlex</Link>
						</p>
					</div>
				)}

				{state.status === "error" && (
					<div className="state">
						<p className="state__title">Something went wrong</p>
						<p className="state__hint">
							Couldn't load this matchup. <Link to={PATHS.home}>Back to PokeDexFlex</Link>
						</p>
					</div>
				)}

				{state.status === "ok" && <VersusBody versus={state.versus} />}
			</div>
		</div>
	);
}

function nameOf(side: VersusSideDto): string {
	return side.displayName ?? `@${side.handle}`;
}

function VersusBody({ versus }: { versus: VersusDto }) {
	const { a, b, rounds, outcome, verdict } = versus;
	const winnerName = outcome.winner === "a" ? nameOf(a) : outcome.winner === "b" ? nameOf(b) : null;
	const { user } = useAuth();
	const targetHandle = rivalTargetHandle({ viewerHandle: user?.handle ?? null, aHandle: a.handle, bHandle: b.handle });
	const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");

	async function handleSaveRivalry() {
		if (!targetHandle) return;
		setSaveState("saving");
		try {
			await saveRivalry(targetHandle);
			setSaveState("saved");
		} catch {
			setSaveState("error");
		}
	}

	return (
		<>
			{/* Result share card — laid out to screenshot; copy-link lives in G6. */}
			<section className="versus-card" aria-label="Matchup result">
				<div className="versus-card__side">
					<Avatar userId={a.userId} displayName={a.displayName} hasAvatar={a.hasAvatar} size="lg" />
					<h2 className="versus-card__name">{nameOf(a)}</h2>
					<RankBadge trainerScore={a.trainerScore} rank={a.rank} size="sm" />
					<p className="versus-card__wins">{outcome.aWins} rounds</p>
				</div>

				<div className="versus-card__center">
					<span className="versus-card__vs">VS</span>
					<p className="versus-card__verdict">{verdict}</p>
					{winnerName ? (
						<p className="versus-card__winner">Winner: {winnerName}</p>
					) : (
						<p className="versus-card__winner">It's a draw</p>
					)}
					{targetHandle && (
						<button
							type="button"
							className="button versus-card__save"
							onClick={handleSaveRivalry}
							disabled={saveState === "saving" || saveState === "saved"}
						>
							{saveState === "saved" ? "Rivalry saved" : saveState === "saving" ? "Saving…" : "Save rivalry"}
						</button>
					)}
					{saveState === "error" && <p className="state__hint">Couldn't save — try again.</p>}
				</div>

				<div className="versus-card__side">
					<Avatar userId={b.userId} displayName={b.displayName} hasAvatar={b.hasAvatar} size="lg" />
					<h2 className="versus-card__name">{nameOf(b)}</h2>
					<RankBadge trainerScore={b.trainerScore} rank={b.rank} size="sm" />
					<p className="versus-card__wins">{outcome.bWins} rounds</p>
				</div>
			</section>

			<section className="versus-rounds" aria-label="Rounds">
				<h2 className="ribbon-section__title">Rounds</h2>
				{rounds.map((r) => (
					<RoundRow key={r.key} round={r} />
				))}
			</section>

			<section className="versus-breakdown" aria-label="By type">
				<h2 className="ribbon-section__title">By type</h2>
				<BreakdownBars rows={buildBreakdown(TYPE_ORDER, a.byType, b.byType)} kind="type" />
			</section>

			<section className="versus-breakdown" aria-label="By generation">
				<h2 className="ribbon-section__title">By generation</h2>
				<BreakdownBars rows={buildBreakdown(GEN_ORDER, a.byGen, b.byGen)} kind="gen" />
			</section>

			{(a.favorites.length > 0 || b.favorites.length > 0) && (
				<section className="versus-favorites" aria-label="Favorites">
					<div className="versus-favorites__cols">
						<div className="versus-favorites__col">
							<p className="versus-showcase__name">{nameOf(a)}</p>
							{a.favorites.length > 0 ? (
								<FavoritesStrip favorites={a.favorites} />
							) : (
								<p className="state__hint">No favorites yet.</p>
							)}
						</div>
						<div className="versus-favorites__col">
							<p className="versus-showcase__name">{nameOf(b)}</p>
							{b.favorites.length > 0 ? (
								<FavoritesStrip favorites={b.favorites} />
							) : (
								<p className="state__hint">No favorites yet.</p>
							)}
						</div>
					</div>
				</section>
			)}

			{(a.showcase.length > 0 || b.showcase.length > 0) && (
				<section className="versus-showcase" aria-label="Trophy walls">
					<h2 className="ribbon-section__title">Trophy walls</h2>
					<div className="versus-showcase__cols">
						<ShowcaseColumn side={a} />
						<ShowcaseColumn side={b} />
					</div>
				</section>
			)}
		</>
	);
}

function RoundRow({ round }: { round: VersusRoundDto }) {
	const pct = barPercents(round.a, round.b);
	return (
		<div className="versus-round">
			<div className={`versus-round__side versus-round__side--a${round.winner === "a" ? " is-winner" : ""}`}>
				<span className="versus-round__value">{formatRoundValue(round.format, round.a)}</span>
				<span className="versus-round__bar">
					<span className="versus-round__fill versus-round__fill--a" style={{ width: `${pct.a}%` }} />
				</span>
			</div>
			<span className="versus-round__label">{round.label}</span>
			<div className={`versus-round__side versus-round__side--b${round.winner === "b" ? " is-winner" : ""}`}>
				<span className="versus-round__bar">
					<span className="versus-round__fill versus-round__fill--b" style={{ width: `${pct.b}%` }} />
				</span>
				<span className="versus-round__value">{formatRoundValue(round.format, round.b)}</span>
			</div>
		</div>
	);
}

function BreakdownBars({ rows, kind }: { rows: BreakdownRow[]; kind: "type" | "gen" }) {
	if (rows.length === 0) return <p className="state__hint">Neither trainer owns any yet.</p>;
	return (
		<div className="versus-breakdown__rows">
			{rows.map((row) => {
				const pct = barPercents(row.a, row.b);
				return (
					<div className="versus-breakdown__row" key={row.key}>
						<span className="versus-breakdown__count">{row.a}</span>
						<span className="versus-breakdown__bar versus-breakdown__bar--a">
							<span className="versus-breakdown__fill" style={{ width: `${pct.a}%` }} />
						</span>
						<span className="versus-breakdown__key">
							{kind === "type" ? (
								<TypeIcon type={row.key} color={typeColor(row.key)} size={18} />
							) : (
								<span className="versus-breakdown__gen">{row.label}</span>
							)}
						</span>
						<span className="versus-breakdown__bar versus-breakdown__bar--b">
							<span className="versus-breakdown__fill" style={{ width: `${pct.b}%` }} />
						</span>
						<span className="versus-breakdown__count">{row.b}</span>
					</div>
				);
			})}
		</div>
	);
}

function ShowcaseColumn({ side }: { side: VersusSideDto }) {
	return (
		<div className="versus-showcase__col">
			<p className="versus-showcase__name">{nameOf(side)}</p>
			<div className="trophy-wall__grid">
				{side.showcase.map((r) => (
					<div className="trophy-wall__slot" key={r.id}>
						<RibbonIcon ribbon={{ id: r.id, category: r.category }} size={56} />
						<span className="trophy-wall__name">{r.name}</span>
					</div>
				))}
			</div>
		</div>
	);
}

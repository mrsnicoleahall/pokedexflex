// src/react-app/pages/Home.tsx
//
// Homepage intro/hero: the app's default landing view. Signed-out visitors
// get a full marketing landing page (hero, feature row, versus CTA) with two
// hero CTAs (browse for free, or sign in to start tracking); signed-in users
// get a slim welcome with quick links into their collection and ribbons.
// Both hero variants share the always-dark brand-gradient treatment
// (`.hero--brand` in styles.css) regardless of the active light/dark theme.

import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { AccountView } from "../components/AccountMenu";
import { Avatar } from "../components/Avatar";
import { EarnMomentToast } from "../components/EarnMomentToast";
import { FavoritesStrip } from "../components/FavoritesStrip";
import { RankBadge } from "../components/RankBadge";
import { SignInPanel } from "../components/SignInPanel";
import { useAuth } from "../auth/AuthProvider";
import { listRivalries, deleteRivalry, type RivalryDto } from "../api";
import { NAME_PLACEHOLDER } from "../profile/display";
import { PATHS, publicProfilePath, versusPath } from "../routes";
import { NudgeList } from "../ribbons/NudgeList";
import { TrophyWall } from "../ribbons/TrophyWall";
import { useRibbonsData } from "../ribbons/useRibbonsData";

type HomeProps = {
	onBrowse: () => void;
	onNavigate: (view: AccountView) => void;
};

export function Home({ onBrowse, onNavigate }: HomeProps) {
	const { user } = useAuth();
	const [signInOpen, setSignInOpen] = useState(false);
	const { trainerScore, rank, showcase, ribbons, nearest, newlyEarned, ackSeen } = useRibbonsData();

	return (
		<div className="container page">
			{user && newlyEarned.length > 0 && (
				<EarnMomentToast ribbons={newlyEarned} onDismiss={() => void ackSeen()} />
			)}
			<section className="hero hero--brand">
				{user ? (
					<div className="hero__welcome">
						<div className="hero__identity">
							<Avatar userId={user.id} displayName={user.displayName} hasAvatar={user.hasAvatar} size="lg" />
							<div>
								<p className="hero__eyebrow">Welcome back</p>
								<h1 className="hero__title hero__title--slim">{user.displayName ?? NAME_PLACEHOLDER}</h1>
							</div>
						</div>
						<RankBadge trainerScore={trainerScore} rank={rank} size="sm" />
						<div className="hero__actions">
							<button
								type="button"
								className="button button--primary"
								onClick={() => onNavigate("collection")}
							>
								My Collection
							</button>
							<button type="button" className="button" onClick={() => onNavigate("ribbons")}>
								Ribbons
							</button>
							<button type="button" className="button" onClick={() => onNavigate("progress")}>
								Progress
							</button>
							<button
								type="button"
								className="button"
								onClick={() =>
									document.getElementById("versus")?.scrollIntoView({ behavior: "smooth", block: "start" })
								}
							>
								Versus
							</button>
							<Link className="button" to={PATHS.leaderboard}>
								Leaderboard
							</Link>
						</div>
					</div>
				) : (
					<div className="landing__hero-inner">
						<img src="/brand/icon-512.png" alt="" className="landing__emblem" />
						<div className="hero__intro">
							<p className="hero__eyebrow">PokéDexFlex</p>
							<h1 className="hero__title">
								Catch &apos;em all.
								<br />
								Then flex &apos;em all.
							</h1>
							<p className="hero__subcopy">
								Track every species, form, and event distribution. Build your living dex, earn 166
								ribbons, climb the ranks, then go head-to-head with rival trainers.
							</p>
							<div className="hero__actions">
								<button type="button" className="button button--primary" onClick={onBrowse}>
									Browse the Dex
								</button>
								<button type="button" className="button" onClick={() => setSignInOpen(true)}>
									Sign in
								</button>
								<Link className="button" to={PATHS.leaderboard}>
									Leaderboard
								</Link>
							</div>
						</div>
					</div>
				)}
				{!user && (
					<div className="landing__stats">
						<div className="landing__stat">
							<span className="landing__stat-value">1,025</span>
							<span className="landing__stat-label">species</span>
						</div>
						<div className="landing__stat">
							<span className="landing__stat-value">2,046</span>
							<span className="landing__stat-label">events</span>
						</div>
						<div className="landing__stat">
							<span className="landing__stat-value">166</span>
							<span className="landing__stat-label">ribbons</span>
						</div>
					</div>
				)}
			</section>

			{!user && (
				<>
					<section className="landing__features" aria-label="Features">
						<div className="landing__feature-card">
							<h3 className="landing__feature-title">Living Dex</h3>
							<p className="landing__feature-copy">
								Track every specimen you own (IVs, nature, OT, shiny status) organized into boxes
								just like the games.
							</p>
						</div>
						<div className="landing__feature-card">
							<h3 className="landing__feature-title">166 Ribbons to chase</h3>
							<p className="landing__feature-copy">
								Ribbons are the flex. Earn them for completion milestones, rare catches, and shiny
								hunts, then show off your rarest on your trophy wall and climb the ribbon leaderboard.
							</p>
						</div>
						<div className="landing__feature-card">
							<h3 className="landing__feature-title">Import in seconds</h3>
							<p className="landing__feature-copy">
								Already have a collection? Upload a CSV, snap a screenshot of your Pokémon Home
								boxes, or drop in an Ultra Sun / Ultra Moon save file.
							</p>
						</div>
						<div className="landing__feature-card">
							<h3 className="landing__feature-title">Rank &amp; Rarity</h3>
							<p className="landing__feature-copy">
								Every catch feeds your Trainer Score. See exactly how rare your ribbons are compared
								to every other trainer.
							</p>
						</div>
					</section>

					<section className="versus-cta" aria-label="Versus">
						<div className="versus-cta__mock" aria-hidden="true">
							<div className="versus-cta__avatar">YOU</div>
							<span className="versus-cta__vs">VS</span>
							<div className="versus-cta__avatar versus-cta__avatar--rival">?</div>
						</div>
						<div className="versus-cta__copy">
							<h2 className="versus-cta__title">Versus. Settle it head-to-head.</h2>
							<p>
								Compare any two public trainers across six scored rounds (Strength, Diversity,
								Completion, Shiny, Ribbon Score, and Rarity Crown), get a winner and a trash-talk
								verdict, then save the rivalry for a rematch.
							</p>
							<button type="button" className="button button--primary" onClick={() => setSignInOpen(true)}>
								Sign in to challenge a rival
							</button>
						</div>
					</section>
				</>
			)}

			{user && <Rivals />}
			{user && <FavoritesStrip favorites={user.favorites} />}
			{user && <TrophyWall showcase={showcase} ribbons={ribbons} />}
			{user && <NudgeList nearest={nearest} />}
			{signInOpen && <SignInPanel onClose={() => setSignInOpen(false)} />}
		</div>
	);
}

function Rivals() {
	const navigate = useNavigate();
	const { user } = useAuth();
	const [rivals, setRivals] = useState<RivalryDto[]>([]);
	const [handle, setHandle] = useState("");

	useEffect(() => {
		let cancelled = false;
		listRivalries()
			.then((r) => {
				if (!cancelled) setRivals(r.rivalries);
			})
			.catch(() => {
				/* non-fatal — the Rivals box is optional dashboard chrome */
			});
		return () => {
			cancelled = true;
		};
	}, []);

	function startCompare() {
		const target = handle.trim().toLowerCase();
		if (user?.handle && target) navigate(versusPath(user.handle, target));
	}

	async function remove(id: string) {
		await deleteRivalry(id);
		setRivals((prev) => prev.filter((r) => r.id !== id));
	}

	return (
		<section id="versus" className="rivals" aria-label="Versus and rivals">
			<h2 className="ribbon-section__title">Versus &amp; Rivals</h2>
			<p className="rivals__hint">
				Compare your dex against any public trainer across six scored rounds, then save your best
				matchups here for easy rematches.
			</p>

			{user?.handle ? (
				<form
					className="rivals__compare"
					onSubmit={(e) => {
						e.preventDefault();
						startCompare();
					}}
				>
					<input
						className="input"
						value={handle}
						placeholder="a trainer's handle"
						onChange={(e) => setHandle(e.target.value)}
						aria-label="Opponent's handle"
					/>
					<button type="submit" className="button button--primary" disabled={!handle.trim()}>
						Compare
					</button>
				</form>
			) : (
				<p className="state__hint">Set a public handle in Settings to compare with other trainers.</p>
			)}

			{user?.handle && rivals.length === 0 && (
				<p className="state__hint rivals__empty">
					No saved rivalries yet. Challenge a trainer above, or{" "}
					<Link to={PATHS.leaderboard}>find someone on the leaderboard</Link>.
				</p>
			)}

			{rivals.length > 0 && (
				<ul className="rivals__list">
					{rivals.map((r) => (
						<li className="rivals__item" key={r.id}>
							<Avatar userId={r.opponentUserId} displayName={r.displayName} hasAvatar={r.hasAvatar} size="sm" />
							<span className="rivals__name">
								{r.handle ? (
									<Link to={publicProfilePath(r.handle)}>{r.displayName ?? `@${r.handle}`}</Link>
								) : (
									(r.displayName ?? "Trainer")
								)}
							</span>
							{user?.handle && r.handle && r.isPublic ? (
								<Link className="button rivals__rematch" to={versusPath(user.handle, r.handle)}>
									Rematch
								</Link>
							) : (
								<span className="state__hint">unavailable</span>
							)}
							<button type="button" className="button" onClick={() => void remove(r.id)}>
								Remove
							</button>
						</li>
					))}
				</ul>
			)}
		</section>
	);
}

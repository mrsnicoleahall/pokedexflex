// src/react-app/pages/Home.tsx
//
// Homepage intro/hero: the app's default landing view. Signed-out visitors
// get a marketing-style pitch with two CTAs (browse for free, or sign in to
// start tracking); signed-in users get a slim welcome with quick links into
// their collection and ribbons. Both states reuse the shared design tokens
// and the type-aura visual language from theme.ts.

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
import { publicProfilePath, versusPath } from "../routes";
import { NudgeList } from "../ribbons/NudgeList";
import { TrophyWall } from "../ribbons/TrophyWall";
import { useRibbonsData } from "../ribbons/useRibbonsData";
import { heroAura } from "../theme";

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
			<section className="hero" style={{ background: heroAura() }}>
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
						</div>
					</div>
				) : (
					<div className="hero__intro">
						<p className="hero__eyebrow">PokeDexFlex</p>
						<h1 className="hero__title">Your whole Pokémon journey, in one dex.</h1>
						<p className="hero__subcopy">
							Browse every species, form, and event distribution for free. Sign in to build your
							living dex, box your collection, and earn ribbons for completing it.
						</p>
						<div className="hero__actions">
							<button type="button" className="button button--primary" onClick={onBrowse}>
								Browse the Dex
							</button>
							<button type="button" className="button" onClick={() => setSignInOpen(true)}>
								Sign in
							</button>
						</div>
					</div>
				)}
			</section>
			{user && <FavoritesStrip favorites={user.favorites} />}
			{user && <TrophyWall showcase={showcase} ribbons={ribbons} />}
			{user && <NudgeList nearest={nearest} />}
			{user && <Rivals />}
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
		<section className="rivals" aria-label="Rivals">
			<h2 className="ribbon-section__title">Rivals</h2>

			{user?.handle ? (
				<div className="rivals__compare">
					<input
						className="input"
						value={handle}
						placeholder="a trainer's handle"
						onChange={(e) => setHandle(e.target.value)}
					/>
					<button type="button" className="button button--primary" onClick={startCompare} disabled={!handle.trim()}>
						Compare
					</button>
				</div>
			) : (
				<p className="state__hint">Set a public handle in Settings to compare with other trainers.</p>
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

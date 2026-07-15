// src/react-app/pages/PublicProfile.tsx
//
// Public trainer profile at /u/:handle (Flex Phase F). Ungated +
// unauthenticated: registered outside AppLayout, fetched via the public
// GET /api/u/:handle endpoint, which never returns email or private data. A
// missing handle OR a private profile both come back as null (the server
// makes them indistinguishable) and render the same "not found" state. Its
// own minimal header (wordmark link home + theme toggle) — deliberately NO
// AccountMenu, so no account-only chrome leaks onto a public page.

import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { fetchPublicProfile, type PublicProfileDto } from "../api";
import { Avatar } from "../components/Avatar";
import { FavoritesStrip } from "../components/FavoritesStrip";
import { RankBadge } from "../components/RankBadge";
import { ThemeToggle } from "../components/ThemeToggle";
import { RibbonIcon } from "../ribbons/RibbonIcon";
import { PATHS, versusPath } from "../routes";

type LoadState =
	| { status: "loading" }
	| { status: "not_found" }
	| { status: "error" }
	| { status: "ok"; profile: PublicProfileDto };

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

export function PublicProfile() {
	const { handle } = useParams<{ handle: string }>();
	const [state, setState] = useState<LoadState>({ status: "loading" });

	useEffect(() => {
		let cancelled = false;
		setState({ status: "loading" });
		fetchPublicProfile(handle ?? "")
			.then((profile) => {
				if (cancelled) return;
				setState(profile ? { status: "ok", profile } : { status: "not_found" });
			})
			.catch(() => {
				if (!cancelled) setState({ status: "error" });
			});
		return () => {
			cancelled = true;
		};
	}, [handle]);

	return (
		<div className="app">
			<PublicHeader />
			<div className="container page">
				{state.status === "loading" && <p className="state__title">Loading…</p>}

				{state.status === "not_found" && (
					<div className="state">
						<p className="state__title">Trainer not found</p>
						<p className="state__hint">
							This profile doesn't exist or is private.{" "}
							<Link to={PATHS.home}>Back to PokeDexFlex</Link>
						</p>
					</div>
				)}

				{state.status === "error" && (
					<div className="state">
						<p className="state__title">Something went wrong</p>
						<p className="state__hint">
							Couldn't load this profile. <Link to={PATHS.home}>Back to PokeDexFlex</Link>
						</p>
					</div>
				)}

				{state.status === "ok" && <PublicProfileBody profile={state.profile} />}
			</div>
		</div>
	);
}

function PublicProfileBody({ profile }: { profile: PublicProfileDto }) {
	const { user } = useAuth();
	const canCompare = user?.handle != null && user.handle !== profile.handle;

	return (
		<>
			<section className="public-profile__hero">
				<Avatar userId={profile.userId} displayName={profile.displayName} hasAvatar={profile.hasAvatar} size="lg" />
				<div>
					<p className="hero__eyebrow">@{profile.handle}</p>
					<h1 className="hero__title hero__title--slim">{profile.displayName ?? "Trainer"}</h1>
					<RankBadge trainerScore={profile.trainerScore} rank={profile.rank} size="sm" />
					{canCompare && (
						<Link className="button button--primary public-profile__compare" to={versusPath(user!.handle!, profile.handle)}>
							Compare with me
						</Link>
					)}
				</div>
			</section>

			<section className="public-profile__stats" aria-label="Collection stats">
				<Stat label="Dex" value={profile.stats.dexCount} />
				<Stat label="Shiny" value={profile.stats.shinySpeciesCount} />
				<Stat label="Specimens" value={profile.stats.specimenCount} />
				<Stat label="Ribbons" value={profile.stats.ribbonCount} />
			</section>

			<FavoritesStrip favorites={profile.favorites} />

			{profile.showcase.length > 0 && (
				<section className="public-profile__showcase" aria-label="Ribbon showcase">
					<h2 className="ribbon-section__title">Trophy Wall</h2>
					<div className="trophy-wall__grid">
						{profile.showcase.map((r) => (
							<div className="trophy-wall__slot" key={r.id}>
								<RibbonIcon ribbon={{ id: r.id, category: r.category }} size={64} />
								<span className="trophy-wall__name">{r.name}</span>
							</div>
						))}
					</div>
				</section>
			)}
		</>
	);
}

function Stat({ label, value }: { label: string; value: number }) {
	return (
		<div className="public-profile__stat">
			<span className="public-profile__stat-value">{value.toLocaleString()}</span>
			<span className="public-profile__stat-label">{label}</span>
		</div>
	);
}

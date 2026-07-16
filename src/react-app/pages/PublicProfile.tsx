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
import {
	deleteWallPost,
	fetchPublicProfile,
	fetchWall,
	postToWall,
	type PublicProfileDto,
	type WallPost,
} from "../api";
import { Avatar } from "../components/Avatar";
import { FavoritesStrip } from "../components/FavoritesStrip";
import { RankBadge } from "../components/RankBadge";
import { PublicHeader } from "../components/PublicHeader";
import { RibbonIcon } from "../ribbons/RibbonIcon";
import { PATHS, publicProfilePath, versusPath } from "../routes";

type LoadState =
	| { status: "loading" }
	| { status: "not_found" }
	| { status: "error" }
	| { status: "ok"; profile: PublicProfileDto };

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
							<Link to={PATHS.home}>Back to PokéDexFlex</Link>
						</p>
					</div>
				)}

				{state.status === "error" && (
					<div className="state">
						<p className="state__title">Something went wrong</p>
						<p className="state__hint">
							Couldn't load this profile. <Link to={PATHS.home}>Back to PokéDexFlex</Link>
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

			<TrainerWall handle={profile.handle} trainerName={profile.displayName ?? `@${profile.handle}`} />
		</>
	);
}

function relativeTime(ts: number, now: number): string {
	const s = Math.max(1, Math.round((now - ts) / 1000));
	if (s < 60) return "just now";
	const m = Math.round(s / 60);
	if (m < 60) return `${m}m ago`;
	const h = Math.round(m / 60);
	if (h < 24) return `${h}h ago`;
	const d = Math.round(h / 24);
	return d < 7 ? `${d}d ago` : new Date(ts).toLocaleDateString();
}

function TrainerWall({ handle, trainerName }: { handle: string; trainerName: string }) {
	const { user } = useAuth();
	const [posts, setPosts] = useState<WallPost[]>([]);
	const [loaded, setLoaded] = useState(false);
	const [body, setBody] = useState("");
	const [posting, setPosting] = useState(false);
	const now = Date.now();

	useEffect(() => {
		let cancelled = false;
		fetchWall(handle)
			.then((r) => {
				if (!cancelled) setPosts(r.posts);
			})
			.catch(() => {
				/* wall is optional chrome; ignore load errors */
			})
			.finally(() => {
				if (!cancelled) setLoaded(true);
			});
		return () => {
			cancelled = true;
		};
	}, [handle]);

	async function submit(e: React.FormEvent) {
		e.preventDefault();
		const text = body.trim();
		if (!text) return;
		setPosting(true);
		try {
			await postToWall(handle, text);
			setBody("");
			const r = await fetchWall(handle);
			setPosts(r.posts);
		} catch {
			/* leave the text so the user can retry */
		} finally {
			setPosting(false);
		}
	}

	async function remove(id: string) {
		const prev = posts;
		setPosts((p) => p.filter((x) => x.id !== id));
		deleteWallPost(id).catch(() => setPosts(prev));
	}

	return (
		<section className="wall" aria-label={`${trainerName}'s wall`}>
			<h2 className="ribbon-section__title">Wall</h2>

			{user ? (
				<form className="wall__compose" onSubmit={submit}>
					<textarea
						className="input input--full wall__input"
						rows={2}
						maxLength={500}
						placeholder={`Leave ${trainerName} a message…`}
						value={body}
						onChange={(e) => setBody(e.target.value)}
						aria-label="Write a wall post"
					/>
					<button type="submit" className="button button--primary" disabled={posting || !body.trim()}>
						{posting ? "Posting…" : "Post"}
					</button>
				</form>
			) : (
				<p className="state__hint">Sign in to leave a message on this wall.</p>
			)}

			{loaded && posts.length === 0 && (
				<p className="state__hint wall__empty">No posts yet. Be the first to say something.</p>
			)}

			<ul className="wall__list">
				{posts.map((p) => (
					<li className="wall__item" key={p.id}>
						<Avatar
							userId={p.authorUserId}
							displayName={p.authorName}
							hasAvatar={p.authorHasAvatar}
							size="sm"
						/>
						<div className="wall__body">
							<p className="wall__meta">
								{p.authorHandle ? (
									<Link className="wall__author" to={publicProfilePath(p.authorHandle)}>
										{p.authorName ?? `@${p.authorHandle}`}
									</Link>
								) : (
									<span className="wall__author">{p.authorName ?? "Trainer"}</span>
								)}
								<span className="wall__time">{relativeTime(p.createdAt, now)}</span>
								{p.canDelete && (
									<button
										type="button"
										className="wall__delete"
										aria-label="Delete post"
										title="Delete"
										onClick={() => remove(p.id)}
									>
										✕
									</button>
								)}
							</p>
							<p className="wall__text">{p.body}</p>
						</div>
					</li>
				))}
			</ul>
		</section>
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

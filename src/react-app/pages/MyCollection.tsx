// src/react-app/pages/MyCollection.tsx
//
// "My Collection" view: the signed-in user's living dex of owned specimens.
// Signed-out visitors get a friendly sign-in prompt (reusing the same
// SignInPanel modal as Home/AccountMenu) instead of a crash or a blank page.
// Signed-in users get a BoxBar filter, a search box, and a card grid of
// their specimens, reusing the sprite/type-aura/card language from the
// species and events catalogs.
//
// The "Add Pokémon" button and each card's click both defer to optional
// `onAdd` / `onEditSpecimen` props — Task 5 wires the specimen editor onto
// these hooks; until then they're safe no-ops.

import { useCallback, useEffect, useState } from "react";
import {
	AuthRequiredError,
	listBoxes,
	listCollection,
	type BoxDto,
	type SpecimenDto,
} from "../api";
import { useAuth } from "../auth/AuthProvider";
import { BoxBar } from "../components/BoxBar";
import { SignInPanel } from "../components/SignInPanel";
import { Sprite } from "../components/Sprite";
import { TypeChip } from "../components/TypeChip";
import { formatDexNumber, formatName, typeAura } from "../theme";

type MyCollectionProps = {
	/** Sends the user to the Species catalog (used by the empty-collection CTA). */
	onBrowseSpecies: () => void;
	/** Task 5 hook: open the specimen editor to create a new specimen (optionally pre-boxed). */
	onAdd?: (boxId: string | null) => void;
	/** Task 5 hook: open the specimen editor for an existing specimen. */
	onEditSpecimen?: (id: string) => void;
};

function SpecimenCard({
	specimen,
	boxName,
	onOpen,
}: {
	specimen: SpecimenDto;
	boxName: string | null;
	onOpen: () => void;
}) {
	const speciesName = formatName(specimen.speciesName);
	const displayName = specimen.nickname?.trim() ? specimen.nickname : speciesName;
	const homeId = specimen.homeId ?? specimen.speciesId;
	const metaParts = [specimen.level ? `Lv. ${specimen.level}` : null, boxName ?? "No box"].filter(
		(part): part is string => Boolean(part),
	);

	return (
		<article
			className="card card--event"
			style={{ background: typeAura(specimen.types) }}
			tabIndex={0}
			role="button"
			aria-label={`Edit ${displayName}`}
			onClick={onOpen}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					onOpen();
				}
			}}
		>
			{specimen.isShiny ? (
				<span className="card__shiny-badge" role="img" aria-label="Shiny">
					✨
				</span>
			) : null}

			<Sprite
				homeId={homeId}
				shiny={Boolean(specimen.isShiny)}
				alt={`${displayName}${specimen.isShiny ? " (shiny)" : ""}`}
			/>

			<h3 className="card__name">{displayName}</h3>
			<div className="card__species-line">
				<span>{speciesName}</span>
				<span className="mono">{formatDexNumber(specimen.speciesId)}</span>
			</div>

			<div className="card__chips">
				{specimen.types.map((type) => (
					<TypeChip key={type} type={type} />
				))}
			</div>

			{metaParts.length > 0 && <p className="card__meta-line">{metaParts.join(" · ")}</p>}
		</article>
	);
}

export function MyCollection({ onBrowseSpecies, onAdd, onEditSpecimen }: MyCollectionProps) {
	const { user, loading: authLoading } = useAuth();
	const [signInOpen, setSignInOpen] = useState(false);

	const [q, setQ] = useState("");
	const [selectedBoxId, setSelectedBoxId] = useState<string | null>(null);
	const [items, setItems] = useState<SpecimenDto[]>([]);
	const [total, setTotal] = useState<number | null>(null);
	const [boxes, setBoxes] = useState<BoxDto[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const refreshBoxes = useCallback(() => {
		listBoxes()
			.then((r) => setBoxes(r.boxes))
			.catch(() => {
				/* the box list is just a filtering aid — a failure here shouldn't block the grid */
			});
	}, []);

	useEffect(() => {
		if (!user) return;
		refreshBoxes();
	}, [user, refreshBoxes]);

	useEffect(() => {
		if (!user) return;
		let cancelled = false;

		const t = setTimeout(() => {
			setLoading(true);
			listCollection({ q, box: selectedBoxId ?? undefined })
				.then((r) => {
					if (cancelled) return;
					setItems(r.items);
					setTotal(r.total);
					setError(null);
				})
				.catch((err: unknown) => {
					if (cancelled) return;
					setError(
						err instanceof AuthRequiredError
							? "Your session expired — please sign in again."
							: err instanceof Error
								? err.message
								: String(err),
					);
				})
				.finally(() => {
					if (cancelled) return;
					setLoading(false);
				});
		}, 250);

		return () => {
			cancelled = true;
			clearTimeout(t);
		};
	}, [user, q, selectedBoxId]);

	if (authLoading) {
		return (
			<div className="container page">
				<div className="state">
					<span className="state__title">Loading…</span>
				</div>
			</div>
		);
	}

	if (!user) {
		return (
			<div className="container page">
				<div className="state">
					<p className="state__title">Sign in to build your collection</p>
					<p>Track every specimen you own — nicknames, IVs, ribbons, and more.</p>
					<button type="button" className="button button--primary" onClick={() => setSignInOpen(true)}>
						Sign in
					</button>
				</div>
				{signInOpen && <SignInPanel onClose={() => setSignInOpen(false)} />}
			</div>
		);
	}

	const boxName = (id: string | null) => boxes.find((b) => b.id === id)?.name ?? null;
	const isUnfiltered = q.trim() === "" && selectedBoxId === null;

	return (
		<div className="container page">
			<div className="page__meta">
				<h1 className="page__title">My Collection</h1>
				{total !== null && !error && (
					<span>
						{total} {total === 1 ? "specimen" : "specimens"}
					</span>
				)}
			</div>

			<BoxBar boxes={boxes} selectedBoxId={selectedBoxId} onSelect={setSelectedBoxId} onChanged={refreshBoxes} />

			<div className="collection-toolbar">
				<input
					className="input"
					type="search"
					placeholder="Search your collection…"
					value={q}
					onChange={(e) => setQ(e.target.value)}
					aria-label="Search your collection"
				/>
				<button type="button" className="button button--primary" onClick={() => onAdd?.(selectedBoxId)}>
					＋ Add Pokémon
				</button>
			</div>

			{error && (
				<p className="error-banner" role="alert">
					Error: {error}
				</p>
			)}

			{loading && items.length === 0 && !error && (
				<div className="state">
					<span className="state__title">Loading your collection…</span>
				</div>
			)}

			{!loading && !error && items.length === 0 && isUnfiltered && (
				<div className="state">
					<p className="state__title">Your collection is empty — browse the dex and add your first Pokémon.</p>
					<button type="button" className="button button--primary" onClick={onBrowseSpecies}>
						Browse the Dex
					</button>
				</div>
			)}

			{!loading && !error && items.length === 0 && !isUnfiltered && (
				<div className="state">
					<span className="state__title">No specimens match — try another search or box.</span>
				</div>
			)}

			{items.length > 0 && (
				<div className="grid">
					{items.map((specimen) => (
						<SpecimenCard
							key={specimen.id}
							specimen={specimen}
							boxName={boxName(specimen.boxId)}
							onOpen={() => onEditSpecimen?.(specimen.id)}
						/>
					))}
				</div>
			)}
		</div>
	);
}

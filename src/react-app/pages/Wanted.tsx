// src/react-app/pages/Wanted.tsx
//
// The signed-in trainer's "wanted" list — species they're chasing. Populated
// from the ☆ toggle on the Living Dex cards (GET /api/wanted). Each entry can be
// removed here; the empty state points back to the dex.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchWanted, removeWanted, type WantedItem } from "../api";
import { Sprite } from "../components/Sprite";
import { TypeChip } from "../components/TypeChip";
import { PATHS } from "../routes";
import { formatDexNumber, formatName } from "../theme";

type LoadState = { status: "loading" } | { status: "error" } | { status: "ok"; items: WantedItem[] };

export function Wanted() {
	const [state, setState] = useState<LoadState>({ status: "loading" });

	useEffect(() => {
		let cancelled = false;
		fetchWanted()
			.then(({ items }) => {
				if (!cancelled) setState({ status: "ok", items });
			})
			.catch(() => {
				if (!cancelled) setState({ status: "error" });
			});
		return () => {
			cancelled = true;
		};
	}, []);

	function remove(speciesId: number) {
		if (state.status !== "ok") return;
		const prev = state.items;
		setState({ status: "ok", items: prev.filter((i) => i.speciesId !== speciesId) });
		removeWanted(speciesId).catch(() => setState({ status: "ok", items: prev }));
	}

	return (
		<div className="container page">
			<header className="forms__head">
				<h1 className="hero__title hero__title--slim">Wanted</h1>
				<p className="state__hint forms__intro">
					The Pokémon you're chasing. Tap the ☆ on any species in the{" "}
					<Link to={PATHS.species}>Living Dex</Link> to add it here.
				</p>
			</header>

			{state.status === "loading" && <p className="state__title">Loading…</p>}

			{state.status === "error" && (
				<div className="state">
					<p className="state__title">Couldn't load your wanted list</p>
					<p className="state__hint">Please try again in a moment.</p>
				</div>
			)}

			{state.status === "ok" && state.items.length === 0 && (
				<div className="state">
					<p className="state__title">Nothing on your chase list yet</p>
					<p className="state__hint">
						Browse the <Link to={PATHS.species}>Living Dex</Link> and tap the ☆ on anything you want to
						hunt down.
					</p>
				</div>
			)}

			{state.status === "ok" && state.items.length > 0 && (
				<ul className="forms-grid wanted-grid" aria-label="Wanted species">
					{state.items.map((item) => {
						const name = formatName(item.name);
						return (
							<li key={item.speciesId} className="forms-tile">
								<div className="forms-tile__button wanted-tile">
									<button
										type="button"
										className="wanted-tile__remove"
										aria-label={`Remove ${name} from wanted`}
										title="Remove from wanted"
										onClick={() => remove(item.speciesId)}
									>
										★
									</button>
									<span className="card__dexnum wanted-tile__dex">{formatDexNumber(item.speciesId)}</span>
									<Sprite homeId={item.homeId ?? item.speciesId} alt={name} />
									<span className="forms-tile__name">{name}</span>
									<div className="card__chips">
										{item.types.map((type) => (
											<TypeChip key={type} type={type} />
										))}
									</div>
								</div>
							</li>
						);
					})}
				</ul>
			)}
		</div>
	);
}

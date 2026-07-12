// src/react-app/pages/EventsCatalog.tsx

import { useEffect, useRef, useState } from "react";
import { fetchEvents, type EventDto } from "../api";
import { useAuth } from "../auth/AuthProvider";
import { formatDexNumber, formatName, typeAura } from "../theme";
import { SpecimenEditor } from "../collection/SpecimenEditor";
import { SignInPanel } from "../components/SignInPanel";
import { Sprite } from "../components/Sprite";
import { TypeChip } from "../components/TypeChip";

const PAGE_SIZE = 60;

type EventsCatalogProps = {
	q: string;
	gen: number | undefined;
};

function EventCard({ event, onAdd }: { event: EventDto; onAdd?: () => void }) {
	const speciesName = formatName(event.speciesName);
	const homeId = event.homeId ?? event.speciesId;
	const metaParts = [event.year ? String(event.year) : null, event.games, event.method].filter(
		(part): part is string => Boolean(part),
	);
	const otParts = [event.otName, event.otId].filter((part): part is string => Boolean(part));

	return (
		<article className="card card--event" style={{ background: typeAura(event.speciesTypes) }} tabIndex={0}>
			{event.isShiny && (
				<span className="card__shiny-badge" role="img" aria-label="Shiny">
					✨
				</span>
			)}
			{event.owned && <span className="card__owned-badge">✓ Owned</span>}

			<Sprite homeId={homeId} shiny={event.isShiny} alt={`${speciesName}${event.isShiny ? " (shiny)" : ""}`} />

			<h3 className="card__name">{event.name}</h3>
			<div className="card__species-line">
				<span>{speciesName}</span>
				<span className="mono">{formatDexNumber(event.speciesId)}</span>
			</div>

			<div className="card__chips">
				{event.speciesTypes.map((type) => (
					<TypeChip key={type} type={type} />
				))}
			</div>

			{metaParts.length > 0 && <p className="card__meta-line">{metaParts.join(" · ")}</p>}
			{event.region && <p className="card__meta-line">{event.region}</p>}
			{otParts.length > 0 && <p className="card__ot">{otParts.join(" · ")}</p>}
			{event.ribbon && <span className="card__ribbon-chip">{event.ribbon}</span>}
			{onAdd && (
				<button
					type="button"
					className="button button--primary card__add-button"
					onClick={(e) => {
						e.stopPropagation();
						onAdd();
					}}
				>
					＋ Add
				</button>
			)}
		</article>
	);
}

export function EventsCatalog({ q, gen }: EventsCatalogProps) {
	const { user } = useAuth();
	const [items, setItems] = useState<EventDto[]>([]);
	const [total, setTotal] = useState<number | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	const [loadingMore, setLoadingMore] = useState(false);
	const [refreshKey, setRefreshKey] = useState(0);
	const [signInOpen, setSignInOpen] = useState(false);
	const [addTarget, setAddTarget] = useState<EventDto | null>(null);
	const offsetRef = useRef(0);
	const mountedRef = useRef(true);

	useEffect(() => {
		mountedRef.current = true;
		return () => {
			mountedRef.current = false;
		};
	}, []);

	useEffect(() => {
		let cancelled = false;
		offsetRef.current = 0;

		const t = setTimeout(() => {
			setLoading(true);
			fetchEvents({ q, gen, limit: PAGE_SIZE, offset: 0 })
				.then((r) => {
					if (cancelled) return;
					setItems(r.items);
					setTotal(r.total);
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
		}, 250);

		return () => {
			cancelled = true;
			clearTimeout(t);
		};
	}, [q, gen, refreshKey]);

	function handleAddClick(event: EventDto) {
		if (!user) {
			setSignInOpen(true);
			return;
		}
		setAddTarget(event);
	}

	const loadMore = () => {
		const nextOffset = offsetRef.current + PAGE_SIZE;
		setLoadingMore(true);
		fetchEvents({ q, gen, limit: PAGE_SIZE, offset: nextOffset })
			.then((r) => {
				if (!mountedRef.current) return;
				setItems((prev) => [...prev, ...r.items]);
				setTotal(r.total);
				offsetRef.current = nextOffset;
				setError(null);
			})
			.catch((err: unknown) => {
				if (!mountedRef.current) return;
				setError(err instanceof Error ? err.message : String(err));
			})
			.finally(() => {
				if (!mountedRef.current) return;
				setLoadingMore(false);
			});
	};

	const hasMore = total !== null && items.length < total;

	return (
		<div className="container page">
			<div className="page__meta">
				<h1 className="page__title">Events</h1>
				{total !== null && !error && (
					<span>
						{items.length} of {total} events
					</span>
				)}
			</div>

			{error && (
				<p className="error-banner" role="alert">
					Error: {error}
				</p>
			)}

			{loading && items.length === 0 && !error && (
				<div className="state">
					<span className="state__title">Loading events…</span>
				</div>
			)}

			{!loading && !error && items.length === 0 && (
				<div className="state">
					<span className="state__title">No events match.</span>
				</div>
			)}

			{items.length > 0 && (
				<>
					<div className="grid">
						{items.map((event) => (
							<EventCard key={event.id} event={event} onAdd={() => handleAddClick(event)} />
						))}
					</div>
					{hasMore && (
						<div className="load-more">
							<button type="button" className="button" onClick={loadMore} disabled={loadingMore}>
								{loadingMore ? "Loading…" : "Load more"}
							</button>
						</div>
					)}
				</>
			)}

			{signInOpen && <SignInPanel onClose={() => setSignInOpen(false)} />}

			{addTarget && (
				<SpecimenEditor
					key={`create-event-${addTarget.id}`}
					mode="create"
					initial={{
						speciesId: addTarget.speciesId,
						speciesName: addTarget.speciesName,
						homeId: addTarget.homeId,
						isEvent: true,
						eventName: addTarget.name,
						isShiny: addTarget.isShiny,
						otName: addTarget.otName,
						otId: addTarget.otId,
						originGame: addTarget.games,
						metLocation: addTarget.region,
						ribbons: addTarget.ribbon ? [addTarget.ribbon] : undefined,
					}}
					onClose={() => setAddTarget(null)}
					onSaved={() => {
						setAddTarget(null);
						setRefreshKey((k) => k + 1);
					}}
				/>
			)}
		</div>
	);
}

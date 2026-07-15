// src/react-app/ribbons/ShowcasePicker.tsx
//
// Lets a signed-in user pin up to `showcase.length` (6) EARNED ribbons to
// their showcase. Only earned ribbons are ever rendered as selectable — the
// server re-validates this on save (setShowcase in
// src/worker/ribbons/incentive-store.ts), but the picker never even offers
// a locked ribbon as a choice. On save, defers back to the server via
// `onSaved` (the caller refetches) rather than trusting its own optimistic
// state as final.
import { useEffect, useState } from "react";
import { setRibbonShowcase, type RibbonDto } from "../api";
import { RibbonIcon } from "./RibbonIcon";

export function ShowcasePicker({
	earnedRibbons,
	showcase,
	onSaved,
}: {
	earnedRibbons: RibbonDto[];
	showcase: (string | null)[];
	onSaved: () => void;
}) {
	const maxSlots = showcase.length;
	const [selected, setSelected] = useState<string[]>(() => showcase.filter((id): id is string => id !== null));
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// Re-sync local selection whenever the server's showcase changes underneath us (e.g. after a save + refetch).
	useEffect(() => {
		setSelected(showcase.filter((id): id is string => id !== null));
	}, [showcase]);

	function toggle(id: string) {
		setError(null);
		setSelected((prev) => {
			if (prev.includes(id)) return prev.filter((x) => x !== id);
			if (prev.length >= maxSlots) return prev; // full — ignore extra picks rather than silently evicting one
			return [...prev, id];
		});
	}

	async function save() {
		setSaving(true);
		setError(null);
		try {
			await setRibbonShowcase(selected);
			onSaved();
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setSaving(false);
		}
	}

	return (
		<section className="showcase-picker">
			<div className="showcase-picker__header">
				<h2 className="ribbon-section__title">Showcase</h2>
				<span className="ribbon-section__count">
					{selected.length} / {maxSlots}
				</span>
			</div>
			<p className="showcase-picker__hint">Pin up to {maxSlots} earned ribbons to your trophy wall on the dashboard.</p>
			{error && (
				<p className="error-banner" role="alert">
					Error: {error}
				</p>
			)}
			<div className="showcase-picker__grid">
				{earnedRibbons.map((r) => {
					const picked = selected.includes(r.id);
					return (
						<button
							type="button"
							key={r.id}
							className={`showcase-picker__item${picked ? " showcase-picker__item--picked" : ""}`}
							aria-pressed={picked}
							aria-label={`${picked ? "Remove" : "Pin"} ${r.name} ${picked ? "from" : "to"} showcase`}
							onClick={() => toggle(r.id)}
						>
							<RibbonIcon ribbon={{ id: r.id, category: r.category }} size={48} />
							<span className="showcase-picker__name">{r.name}</span>
						</button>
					);
				})}
				{earnedRibbons.length === 0 && <p className="showcase-picker__empty">Earn a ribbon to start your showcase.</p>}
			</div>
			<button type="button" className="button button--primary" onClick={save} disabled={saving}>
				{saving ? "Saving…" : "Save showcase"}
			</button>
		</section>
	);
}

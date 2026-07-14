// src/react-app/pages/Ribbons.tsx
//
// "Ribbons" view: the signed-in user's achievement catalog. Renders every
// ribbon in the catalog (grand, per-generation, per-type, form-fanatic,
// per-species form-set, shiny/event tiers) grouped by category, earned first
// within each group. Earned ribbons get a vibrant category-colored accent
// (reusing the typeAura hex-alpha technique from theme.ts) and a check
// badge; locked ribbons stay muted and show a progress bar with the raw
// current/total counts.
//
// Logged-out visitors still get the full catalog (the API returns it
// all-locked with progress 0) plus a gentle nudge to sign in — no crash,
// no empty page. The "Form Sets" category is by far the largest (one ribbon
// per multi-form species) so it renders behind a native <details> disclosure,
// collapsed by default, labeled with its own earned/total count.

import { useEffect, useMemo, useState } from "react";
import { fetchRibbons, type RibbonDto } from "../api";
import { useAuth } from "../auth/AuthProvider";
import { typeColor } from "../theme";

/** Sensible display order for ribbon categories; "Grand" (the hardest, rarest ribbons) leads. "Fun" (easter eggs) trails. */
const CATEGORY_ORDER = ["Grand", "Generation", "Type", "Forms", "Form Sets", "Shiny", "Events", "Fun"];

/** Above this many cards, a category collapses behind a disclosure by default (currently only "Form Sets" is this large). */
const COLLAPSE_THRESHOLD = 20;

/** Maps non-"Type" categories onto one of the 18 canonical type colors, so every category still reads as part of the same visual language. */
const CATEGORY_ACCENT_TYPE: Record<string, string> = {
	Grand: "electric",
	Generation: "dragon",
	Forms: "psychic",
	"Form Sets": "ice",
	Shiny: "fairy",
	Events: "grass",
	Fun: "poison",
};

/** Picks an earned-ribbon accent color: the ribbon's own type for "Type" ribbons (parsed from its `type-<type>` id), otherwise a fixed per-category color. */
function ribbonAccentColor(ribbon: RibbonDto): string {
	if (ribbon.category === "Type" && ribbon.id.startsWith("type-")) {
		return typeColor(ribbon.id.slice("type-".length));
	}
	return typeColor(CATEGORY_ACCENT_TYPE[ribbon.category] ?? "normal");
}

/** Secret ribbons stay unrevealed until earned: no name, no criteria, just a nudge to keep playing. */
const SECRET_HIDDEN_NAME = "???";
const SECRET_HIDDEN_DESC = "Secret ribbon — keep collecting to reveal it.";

function RibbonCard({ ribbon }: { ribbon: RibbonDto }) {
	const { current, total } = ribbon.progress;
	const pct = total > 0 ? Math.round((current / total) * 100) : 0;
	const hiddenSecret = Boolean(ribbon.secret) && !ribbon.earned;

	if (ribbon.earned) {
		const accent = ribbonAccentColor(ribbon);
		return (
			<article
				className="ribbon-card ribbon-card--earned"
				style={{
					background: `linear-gradient(135deg, ${accent}4D 0%, ${accent}1F 55%, transparent 100%), var(--surface)`,
					borderColor: `color-mix(in srgb, ${accent} 55%, var(--hairline))`,
				}}
			>
				<span className="ribbon-card__shine" style={{ color: accent }} aria-hidden="true">
					✦
				</span>
				<h3 className="ribbon-card__name">
					<span className="ribbon-card__check" style={{ background: accent }} role="img" aria-label="Earned">
						✓
					</span>
					{ribbon.name}
					{ribbon.secret && (
						<span className="ribbon-card__secret-tag" style={{ color: accent, borderColor: accent }}>
							Secret
						</span>
					)}
				</h3>
				<p className="ribbon-card__desc">{ribbon.description}</p>
			</article>
		);
	}

	return (
		<article className={`ribbon-card ribbon-card--locked${hiddenSecret ? " ribbon-card--secret" : ""}`}>
			<h3 className="ribbon-card__name">
				{hiddenSecret && (
					<span className="ribbon-card__secret-icon" aria-hidden="true">
						?
					</span>
				)}
				{hiddenSecret ? SECRET_HIDDEN_NAME : ribbon.name}
			</h3>
			<p className="ribbon-card__desc">{hiddenSecret ? SECRET_HIDDEN_DESC : ribbon.description}</p>
			<div className="ribbon-progress">
				<div
					className="ribbon-progress__track"
					role="progressbar"
					aria-valuenow={current}
					aria-valuemin={0}
					aria-valuemax={total}
					aria-label={`${hiddenSecret ? SECRET_HIDDEN_NAME : ribbon.name} progress`}
				>
					<div className="ribbon-progress__fill" style={{ width: `${pct}%` }} />
				</div>
				<span className="ribbon-progress__label">
					{current} / {total}
				</span>
			</div>
		</article>
	);
}

function RibbonSection({ category, ribbons }: { category: string; ribbons: RibbonDto[] }) {
	// Earned first within the group; Array#sort is stable, so ties keep the catalog's original order.
	const sorted = useMemo(() => [...ribbons].sort((a, b) => Number(b.earned) - Number(a.earned)), [ribbons]);
	const earned = ribbons.filter((r) => r.earned).length;
	const total = ribbons.length;

	const grid = (
		<div className="ribbon-grid">
			{sorted.map((ribbon) => (
				<RibbonCard key={ribbon.id} ribbon={ribbon} />
			))}
		</div>
	);

	if (total > COLLAPSE_THRESHOLD) {
		return (
			<details className="ribbon-section ribbon-section--collapsible">
				<summary className="ribbon-section__summary">
					<span className="ribbon-section__title">{category}</span>
					<span className="ribbon-section__count">
						{earned} / {total} {category === "Form Sets" ? "form sets" : ""}
					</span>
					<span className="ribbon-section__chevron" aria-hidden="true">
						▸
					</span>
				</summary>
				<div className="ribbon-section__body">{grid}</div>
			</details>
		);
	}

	return (
		<section className="ribbon-section">
			<div className="ribbon-section__header">
				<h2 className="ribbon-section__title">{category}</h2>
				<span className="ribbon-section__count">
					{earned} / {total}
				</span>
			</div>
			{grid}
		</section>
	);
}

export function Ribbons() {
	const { user } = useAuth();
	const [ribbons, setRibbons] = useState<RibbonDto[]>([]);
	const [earnedCount, setEarnedCount] = useState(0);
	const [total, setTotal] = useState(0);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		setLoading(true);
		fetchRibbons()
			.then((r) => {
				if (cancelled) return;
				setRibbons(r.ribbons);
				setEarnedCount(r.earnedCount);
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
		return () => {
			cancelled = true;
		};
	}, [user]);

	const grouped = useMemo(() => {
		const byCategory = new Map<string, RibbonDto[]>();
		for (const ribbon of ribbons) {
			const arr = byCategory.get(ribbon.category);
			if (arr) arr.push(ribbon);
			else byCategory.set(ribbon.category, [ribbon]);
		}
		const known = CATEGORY_ORDER.filter((c) => byCategory.has(c));
		const extra = Array.from(byCategory.keys())
			.filter((c) => !CATEGORY_ORDER.includes(c))
			.sort();
		return [...known, ...extra].map((category) => ({ category, ribbons: byCategory.get(category)! }));
	}, [ribbons]);

	const overallPct = total > 0 ? Math.round((earnedCount / total) * 100) : 0;

	return (
		<div className="container page">
			<div className="page__meta">
				<h1 className="page__title">Ribbons</h1>
			</div>

			{error && (
				<p className="error-banner" role="alert">
					Error: {error}
				</p>
			)}

			{loading && ribbons.length === 0 && !error && (
				<div className="state">
					<span className="state__title">Loading ribbons…</span>
				</div>
			)}

			{!loading && !error && ribbons.length === 0 && (
				<div className="state">
					<span className="state__title">No ribbons available yet.</span>
				</div>
			)}

			{!loading && !error && ribbons.length > 0 && (
				<>
					<div className="ribbons-summary">
						<div className="ribbons-summary__count">
							{earnedCount} / {total}
							<small> ribbons earned</small>
						</div>
						<div className="ribbons-summary__bar-wrap">
							<div
								className="ribbons-summary__track"
								role="progressbar"
								aria-valuenow={earnedCount}
								aria-valuemin={0}
								aria-valuemax={total}
								aria-label="Overall ribbon progress"
							>
								<div className="ribbons-summary__fill" style={{ width: `${overallPct}%` }} />
							</div>
						</div>
						{!user && <p className="ribbons-summary__note">Sign in and start collecting to earn these.</p>}
					</div>

					{grouped.map(({ category, ribbons: categoryRibbons }) => (
						<RibbonSection key={category} category={category} ribbons={categoryRibbons} />
					))}
				</>
			)}
		</div>
	);
}

// src/react-app/pages/Forms.tsx
//
// The Forms gallery: a browsable reference of every alternate form, sourced
// from the shared `forms` reference table via GET /api/forms. Families are
// switched with a sub-nav (the four regional variants split apart). Where a
// form has a HOME render (regional, Mega, Gigantamax, ...) we show the large 3D
// sprite like the Species/Events cards; cosmetic families (Vivillon, Unown,
// Alcremie, ...) have no HOME render, so they fall back to the 2D sprite.
// Clicking a form opens a detail sheet with how to obtain it and, for signed-in
// trainers, a one-tap add-to-collection. Grouping/display lives in the DOM-free
// formsDisplay module; this file is presentation + the add action.

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { createSpecimen, fetchForms } from "../api";
import { groupForms, type GalleryForm, type GalleryGroup } from "../forms/formsDisplay";
import { formSpriteUrl, spriteUrl } from "../theme";

type LoadState =
	| { status: "loading" }
	| { status: "error" }
	| { status: "ok"; groups: GalleryGroup[] };

export function Forms() {
	const [state, setState] = useState<LoadState>({ status: "loading" });
	const [groupKey, setGroupKey] = useState<string | null>(null);
	const [selected, setSelected] = useState<{ form: GalleryForm; group: GalleryGroup } | null>(null);

	useEffect(() => {
		let cancelled = false;
		fetchForms()
			.then(({ forms }) => {
				if (cancelled) return;
				const groups = groupForms(forms);
				setState({ status: "ok", groups });
				setGroupKey(groups[0]?.key ?? null);
			})
			.catch(() => {
				if (!cancelled) setState({ status: "error" });
			});
		return () => {
			cancelled = true;
		};
	}, []);

	const group = useMemo(() => {
		if (state.status !== "ok") return null;
		return state.groups.find((g) => g.key === groupKey) ?? state.groups[0] ?? null;
	}, [state, groupKey]);

	const total = state.status === "ok" ? state.groups.reduce((n, g) => n + g.forms.length, 0) : 0;

	/** Reflect an added form as owned across the loaded groups (and the open sheet). */
	function markOwned(formId: number) {
		setState((prev) => {
			if (prev.status !== "ok") return prev;
			return {
				status: "ok",
				groups: prev.groups.map((g) => ({
					...g,
					forms: g.forms.map((f) => (f.formId === formId ? { ...f, owned: true } : f)),
				})),
			};
		});
		setSelected((prev) => (prev && prev.form.formId === formId ? { ...prev, form: { ...prev.form, owned: true } } : prev));
	}

	return (
		<div className="container page">
			<header className="forms__head">
				<h1 className="hero__title hero__title--slim">Forms</h1>
				<p className="state__hint forms__intro">
					Every alternate form, region by region and pattern by pattern.
					{state.status === "ok" && (
						<>
							{" "}
							{total.toLocaleString()} sprites across {state.groups.length} families.
						</>
					)}
				</p>
			</header>

			{state.status === "loading" && <p className="state__title">Loading…</p>}

			{state.status === "error" && (
				<div className="state">
					<p className="state__title">Couldn't load forms</p>
					<p className="state__hint">Please try again in a moment.</p>
				</div>
			)}

			{state.status === "ok" && group && (
				<>
					<nav className="forms-tabs" role="tablist" aria-label="Form families">
						{state.groups.map((g) => (
							<button
								key={g.key}
								type="button"
								role="tab"
								aria-selected={g.key === group.key}
								className="forms-tab"
								onClick={() => setGroupKey(g.key)}
							>
								{g.label}
								<span className="forms-tab__count">{g.forms.length}</span>
							</button>
						))}
					</nav>

					<p className="forms__blurb">{group.blurb}</p>

					<ul className="forms-grid" aria-label={`${group.label} forms`}>
						{group.forms.map((form) => (
							<FormTile key={form.formId} form={form} onOpen={() => setSelected({ form, group })} />
						))}
					</ul>
				</>
			)}

			{selected && (
				<FormDetail
					form={selected.form}
					group={selected.group}
					onClose={() => setSelected(null)}
					onAdded={markOwned}
				/>
			)}
		</div>
	);
}

/** Prefer the large HOME 3D render; fall back to the 2D sprite for cosmetic forms. */
function formImageUrl(form: GalleryForm): string | null {
	if (form.homeId !== null) return spriteUrl(form.homeId);
	if (form.slug) return formSpriteUrl(form.slug);
	return null;
}

function FormTile({ form, onOpen }: { form: GalleryForm; onOpen: () => void }) {
	const [loaded, setLoaded] = useState(false);
	const url = formImageUrl(form);
	return (
		<li className="forms-tile">
			<button type="button" className="forms-tile__button" onClick={onOpen}>
				{form.owned && (
					<span className="forms-tile__owned" title="In your collection" aria-label="In your collection">
						✓
					</span>
				)}
				<div className={`forms-tile__sprite${loaded ? "" : " is-loading"}`}>
					{url && (
						<img
							className={`forms-tile__img${loaded ? " is-loaded" : ""}${form.homeId === null ? " forms-tile__img--pixel" : ""}`}
							src={url}
							alt={form.display}
							loading="lazy"
							width={120}
							height={120}
							onLoad={() => setLoaded(true)}
							onError={() => setLoaded(true)}
						/>
					)}
				</div>
				<span className="forms-tile__name">{form.display}</span>
			</button>
		</li>
	);
}

function FormDetail({
	form,
	group,
	onClose,
	onAdded,
}: {
	form: GalleryForm;
	group: GalleryGroup;
	onClose: () => void;
	onAdded: (formId: number) => void;
}) {
	const { user } = useAuth();
	const [adding, setAdding] = useState(false);
	const [error, setError] = useState(false);
	const url = formImageUrl(form);

	async function add() {
		setAdding(true);
		setError(false);
		try {
			await createSpecimen({ speciesId: form.speciesId, formId: form.formId });
			onAdded(form.formId);
		} catch {
			setError(true);
		} finally {
			setAdding(false);
		}
	}

	return (
		<div className="form-sheet" role="dialog" aria-modal="true" aria-label={form.display} onClick={onClose}>
			<div className="form-sheet__panel" onClick={(e) => e.stopPropagation()}>
				<button type="button" className="form-sheet__close" onClick={onClose} aria-label="Close">
					×
				</button>
				<div className={`form-sheet__sprite${form.homeId === null ? " form-sheet__sprite--pixel" : ""}`}>
					{url && <img src={url} alt={form.display} width={200} height={200} />}
				</div>
				<p className="form-sheet__family">{group.label}</p>
				<h2 className="form-sheet__name">{form.display}</h2>
				<h3 className="form-sheet__label">How to get it</h3>
				<p className="form-sheet__acq">{group.acquisition}</p>

				{form.owned ? (
					<p className="form-sheet__owned">✓ In your collection</p>
				) : user ? (
					<button type="button" className="button button--primary form-sheet__add" onClick={add} disabled={adding}>
						{adding ? "Adding…" : "Add to collection"}
					</button>
				) : (
					<p className="state__hint">Sign in to add this form to your collection.</p>
				)}
				{error && <p className="form-sheet__err">Couldn't add that form. Please try again.</p>}
			</div>
		</div>
	);
}

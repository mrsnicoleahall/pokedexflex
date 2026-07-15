// src/react-app/pages/Forms.tsx
//
// The Forms gallery: a browse-only reference of every alternate-form sprite,
// grouped into families (Regional, Vivillon, Alcremie, Unown, ...) switched via
// a sub-nav. Sprites come from the 2D default set through the /sprites/form/:slug
// proxy (see formsData.ts for why the whole gallery uses 2D rather than HOME).
// Pure presentation: all data lives in the DOM-free formsData module.

import { useMemo, useState } from "react";
import { formSpriteUrl } from "../theme";
import { FORM_GROUPS, DEFAULT_FORM_GROUP, TOTAL_FORMS, type FormEntry } from "../forms/formsData";

export function Forms() {
	const [groupKey, setGroupKey] = useState<string>(DEFAULT_FORM_GROUP);
	const group = useMemo(
		() => FORM_GROUPS.find((g) => g.key === groupKey) ?? FORM_GROUPS[0],
		[groupKey],
	);

	return (
		<div className="container page">
			<header className="forms__head">
				<h1 className="hero__title hero__title--slim">Forms</h1>
				<p className="state__hint forms__intro">
					Every alternate form, region by region and pattern by pattern.{" "}
					{TOTAL_FORMS.toLocaleString()} sprites across {FORM_GROUPS.length} families.
				</p>
			</header>

			<nav className="forms-tabs" role="tablist" aria-label="Form families">
				{FORM_GROUPS.map((g) => (
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
					<FormTile key={form.slug} form={form} />
				))}
			</ul>
		</div>
	);
}

function FormTile({ form }: { form: FormEntry }) {
	const [loaded, setLoaded] = useState(false);
	return (
		<li className="forms-tile">
			<div className={`forms-tile__sprite${loaded ? "" : " is-loading"}`}>
				<img
					className={`forms-tile__img${loaded ? " is-loaded" : ""}`}
					src={formSpriteUrl(form.slug)}
					alt={form.name}
					loading="lazy"
					width={96}
					height={96}
					onLoad={() => setLoaded(true)}
					onError={() => setLoaded(true)}
				/>
			</div>
			<span className="forms-tile__name">{form.name}</span>
		</li>
	);
}

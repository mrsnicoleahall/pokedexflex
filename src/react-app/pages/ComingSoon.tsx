// src/react-app/pages/ComingSoon.tsx
//
// Placeholder view for account sections not yet built (My Collection,
// Ribbons — Phases 2/3 fill these in).

type ComingSoonProps = {
	title: string;
	onBack: () => void;
};

export function ComingSoon({ title, onBack }: ComingSoonProps) {
	return (
		<div className="page container">
			<div className="page__meta">
				<button type="button" className="button" onClick={onBack}>
					← Back
				</button>
			</div>
			<div className="state">
				<p className="state__title">{title}</p>
				<p>Coming soon.</p>
			</div>
		</div>
	);
}
